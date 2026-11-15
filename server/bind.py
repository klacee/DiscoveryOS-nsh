"""Binding a forum uid to a public key kept in the user's 自我介绍 (self-introduction).

Flow (the client does its part, the server does this):
  1. start(uid): the server issues a one-time challenge nonce.
  2. The user sets 自我介绍 to their key with the marker (client-side, with the forum's captcha).
  3. complete(uid, nonce, sig): the server reads the profile anonymously, finds the key after the
     marker, checks the signature over the challenge (proof the client holds the private key),
     and binds uid -> key. The key must not already belong to another uid.
"""

import html
import re
import secrets
import urllib.request

from marker import extract_key
from signing import verify

CHALLENGE_TTL = 300
PROFILE_URL = "https://www.4d4y.com/forum/space.php?uid={uid}"
_DIGITS = re.compile(r"^[0-9]{1,20}$")
_BIO = re.compile(r"自我介绍:</th>\s*<td[^>]*>(.*?)</td>", re.S)


def bio_from_profile(page: str) -> str | None:
    """The 自我介绍 text of a profile page: <br> becomes a newline, tags and entities are removed."""
    match = _BIO.search(page)
    if not match:
        return None
    # Raw newlines in the HTML are layout whitespace; only <br> makes a line break.
    source = match.group(1).replace("\r", "").replace("\n", "")
    text = re.sub(r"<br\s*/?>", "\n", source, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text)


def challenge_message(uid: str, nonce: str) -> bytes:
    return "\n".join(["nsh-bind-v1", uid, nonce]).encode("utf-8")


def fetch_profile(uid: str) -> str:
    """The public profile page. 4d4y pages are GB18030-encoded."""
    request = urllib.request.Request(
        PROFILE_URL.format(uid=uid), headers={"User-Agent": "nsh-reactions/1.0"}
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read().decode("gb18030", errors="replace")


def start(uid, now: int, store) -> tuple[int, dict]:
    if not (isinstance(uid, str) and _DIGITS.match(uid)):
        return 400, {"error": "bad_uid"}
    nonce = secrets.token_urlsafe(24)
    store.put_challenge(uid, nonce, expires_at=now + CHALLENGE_TTL)
    return 200, {"nonce": nonce, "expiresIn": CHALLENGE_TTL}


def complete(uid, nonce, sig, now: int, store, fetch=fetch_profile) -> tuple[int, dict]:
    if not (isinstance(uid, str) and _DIGITS.match(uid)):
        return 400, {"error": "bad_uid"}
    if not isinstance(nonce, str) or not (16 <= len(nonce) <= 64):
        return 400, {"error": "bad_nonce"}
    if not isinstance(sig, str):
        return 400, {"error": "bad_signature"}

    # One-time: the challenge is consumed here, before anything else can fail.
    if not store.take_challenge(uid, nonce, now):
        return 401, {"error": "no_challenge"}

    try:
        page = fetch(uid)
    except OSError as err:
        # The reason is returned for diagnosis only; it holds no secrets.
        return 502, {"error": "profile_unavailable", "detail": f"{type(err).__name__}: {str(err)[:160]}"}
    bio = bio_from_profile(page)
    if bio is None:
        return 422, {"error": "bio_not_found"}
    key = extract_key(bio)
    if key is None:
        return 422, {"error": "key_not_in_bio"}
    if not verify(key, challenge_message(uid, nonce), sig):
        return 401, {"error": "bad_signature"}

    owner = store.uid_for_key(key)
    if owner is not None and owner != uid:
        return 409, {"error": "key_in_use"}
    old_key = store.get_key(uid)
    if old_key is not None and old_key != key:
        # Rotation: the old key stops working as soon as the binding points at the new one.
        store.delete_key_index(old_key)
    store.set_key(uid, key)
    store.set_key_index(key, uid)
    return 200, {"ok": True}
