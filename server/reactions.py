"""Core logic for signed reaction requests. Pure functions over a store, so it is testable without FC.

Every request, reads included, is signed by the uid's bound key. The signature covers the
request's fields, a timestamp (within WINDOW_SECONDS), and a nonce that may be used once.
"""

import re

from signing import verify

WINDOW_SECONDS = 300
MAX_EMOJI_LENGTH = 16
MAX_PIDS = 50
_DIGITS = re.compile(r"^[0-9]{1,20}$")
ACTIONS = ("add", "remove")


class Store:
    """Interface the handlers need. The FC build implements it on TableStore (store_tablestore.py)."""

    def get_key(self, uid: str) -> str | None: ...
    def set_key(self, uid: str, key: str) -> None: ...
    def add_reaction(self, uid: str, pid: str, emoji: str) -> None: ...
    def remove_reaction(self, uid: str, pid: str, emoji: str) -> None: ...
    def reactions_for(self, pids: list[str]) -> dict[str, dict[str, int]]: ...
    def mark_nonce(self, uid: str, nonce: str, expires_at: int) -> bool:
        """Records the nonce. False when it was already seen and has not expired."""
        ...


def canonical_message(action: str, uid: str, pid: str, emoji: str, ts: int, nonce: str) -> bytes:
    # Every field is a fixed-format token, so no field can shift into another.
    return "\n".join(["nsh-reaction-v1", action, uid, pid, emoji, str(ts), nonce]).encode("utf-8")


def read_message(uid: str, pids: str, ts: int, nonce: str) -> bytes:
    return "\n".join(["nsh-read-v1", uid, pids, str(ts), nonce]).encode("utf-8")


def _check_envelope(uid, ts, nonce, now: int):
    if not (isinstance(uid, str) and _DIGITS.match(uid)):
        return 400, {"error": "bad_uid"}
    if not isinstance(ts, int) or isinstance(ts, bool) or abs(now - ts) > WINDOW_SECONDS:
        return 401, {"error": "stale_timestamp"}
    if not isinstance(nonce, str) or not (8 <= len(nonce) <= 64):
        return 400, {"error": "bad_nonce"}
    return None


def handle_reaction(body: dict, now: int, store: Store) -> tuple[int, dict]:
    uid, pid, emoji = body.get("uid"), body.get("pid"), body.get("emoji")
    action, ts, nonce, sig = body.get("action"), body.get("ts"), body.get("nonce"), body.get("sig")

    if not (isinstance(pid, str) and _DIGITS.match(pid)):
        return 400, {"error": "bad_pid"}
    if not isinstance(emoji, str) or not emoji or len(emoji) > MAX_EMOJI_LENGTH:
        return 400, {"error": "bad_emoji"}
    if action not in ACTIONS:
        return 400, {"error": "bad_action"}
    bad = _check_envelope(uid, ts, nonce, now)
    if bad:
        return bad

    key = store.get_key(uid)
    if key is None:
        return 403, {"error": "not_bound"}
    if not isinstance(sig, str) or not verify(key, canonical_message(action, uid, pid, emoji, ts, nonce), sig):
        return 401, {"error": "bad_signature"}

    # Check the nonce only after the signature, so nobody unauthenticated can fill the nonce store.
    if not store.mark_nonce(uid, nonce, expires_at=ts + WINDOW_SECONDS):
        return 409, {"error": "replayed"}

    # add and remove are idempotent in the store, so a retried request does no harm.
    if action == "add":
        store.add_reaction(uid, pid, emoji)
    else:
        store.remove_reaction(uid, pid, emoji)
    return 200, {"ok": True}


def handle_counts(query: dict, now: int, store: Store) -> tuple[int, dict]:
    """GET /reactions. The query carries uid, pids (comma-separated), ts, nonce and sig."""
    uid, pids_param = query.get("uid"), query.get("pids", "")
    ts_raw, nonce, sig = query.get("ts"), query.get("nonce"), query.get("sig")

    pids = [p for p in pids_param.split(",") if p][:MAX_PIDS]
    if not pids or not all(_DIGITS.match(p) for p in pids):
        return 400, {"error": "bad_pids"}
    try:
        ts = int(ts_raw)
    except (TypeError, ValueError):
        return 400, {"error": "bad_ts"}
    bad = _check_envelope(uid, ts, nonce, now)
    if bad:
        return bad

    key = store.get_key(uid)
    if key is None:
        return 403, {"error": "not_bound"}
    if not isinstance(sig, str) or not verify(key, read_message(uid, pids_param, ts, nonce), sig):
        return 401, {"error": "bad_signature"}
    if not store.mark_nonce(uid, nonce, expires_at=ts + WINDOW_SECONDS):
        return 409, {"error": "replayed"}
    return 200, {"counts": store.reactions_for(pids)}
