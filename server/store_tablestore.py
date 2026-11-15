"""TableStore implementation of the store the reaction handler needs.

Tables (see the setup notes in the handoff):
- bindings:  pk uid. Attribute: key (the Ed25519 public key, base64url).
- reactions: pk pid, ukey = "<uid>|<emoji>". Attributes: uid, emoji.
- nonces:    pk uid, nonce. Attribute: expires_at (unix seconds).
  The table's TTL is 86400 s (the console's minimum), so expired rows are
  ignored here and overwritten, not relied on being deleted.
"""

import tablestore as ots

from reactions import Store


def _is_condition_failure(err: ots.OTSServiceError) -> bool:
    # A failed condition is HTTP 412 (error code OTSConditionCheckFail).
    return getattr(err, "http_status", None) == 412 or getattr(err, "code", "") == "OTSConditionCheckFail"


class TableStoreStore(Store):
    def __init__(self, client: ots.OTSClient, now_fn):
        self.client = client
        self.now = now_fn

    # --- bindings -----------------------------------------------------------
    def get_key(self, uid: str) -> str | None:
        _, row, _ = self.client.get_row("bindings", [("uid", uid)], columns_to_get=["key"], max_version=1)
        if row is None:
            return None
        value = dict((c[0], c[1]) for c in row.attribute_columns).get("key")
        return value if isinstance(value, str) else None

    def set_key(self, uid: str, key: str) -> None:
        row = ots.Row([("uid", uid)], [("key", key)])
        self.client.put_row("bindings", row)

    # --- reactions ----------------------------------------------------------
    def add_reaction(self, uid: str, pid: str, emoji: str) -> None:
        row = ots.Row([("pid", pid), ("ukey", f"{uid}|{emoji}")], [("uid", uid), ("emoji", emoji)])
        # Adding twice is the same as adding once.
        self.client.put_row("reactions", row, condition=ots.Condition(ots.RowExistenceExpectation.IGNORE))

    def remove_reaction(self, uid: str, pid: str, emoji: str) -> None:
        row = ots.Row([("pid", pid), ("ukey", f"{uid}|{emoji}")])
        self.client.delete_row("reactions", row, ots.Condition(ots.RowExistenceExpectation.IGNORE))

    def reactions_for(self, pids: list[str]) -> dict[str, dict[str, int]]:
        out: dict[str, dict[str, int]] = {p: {} for p in pids}
        for pid in pids:
            start = [("pid", pid), ("ukey", ots.INF_MIN)]
            end = [("pid", pid), ("ukey", ots.INF_MAX)]
            while True:
                _, next_start, rows, next_token = self.client.get_range(
                    "reactions", "FORWARD", start, end, columns_to_get=["emoji"], limit=1000
                )
                for row in rows:
                    emoji = dict((c[0], c[1]) for c in row.attribute_columns).get("emoji")
                    if isinstance(emoji, str):
                        out[pid][emoji] = out[pid].get(emoji, 0) + 1
                if next_start is None:
                    break
                start = next_start
        return out

    # --- nonces -------------------------------------------------------------
    def mark_nonce(self, uid: str, nonce: str, expires_at: int) -> bool:
        pk = [("uid", uid), ("nonce", nonce)]
        now = self.now()
        # First use: the row must not exist.
        try:
            self.client.put_row(
                "nonces",
                ots.Row(pk, [("expires_at", expires_at)]),
                condition=ots.Condition(ots.RowExistenceExpectation.EXPECT_NOT_EXIST),
            )
            return True
        except ots.OTSServiceError as err:
            if not _is_condition_failure(err):
                raise
        # The row exists: it counts as used unless it has expired.
        _, row, _ = self.client.get_row("nonces", pk, columns_to_get=["expires_at"], max_version=1)
        old = dict((c[0], c[1]) for c in row.attribute_columns).get("expires_at") if row else None
        if isinstance(old, int) and old >= now:
            return False
        # Expired: take it over, but only if nobody else has changed it since we read it.
        cond = ots.Condition(
            ots.RowExistenceExpectation.EXPECT_EXIST,
            ots.SingleColumnCondition("expires_at", old, ots.ComparatorType.EQUAL),
        )
        try:
            self.client.put_row("nonces", ots.Row(pk, [("expires_at", expires_at)]), condition=cond)
            return True
        except ots.OTSServiceError as err:
            if _is_condition_failure(err):
                return False
            raise

    # --- bind challenges (in the nonces table, with a "bind:" prefix) ------
    def put_challenge(self, uid: str, nonce: str, expires_at: int) -> None:
        self.client.put_row(
            "nonces",
            ots.Row([("uid", uid), ("nonce", f"bind:{nonce}")], [("expires_at", expires_at)]),
            condition=ots.Condition(ots.RowExistenceExpectation.IGNORE),
        )

    def take_challenge(self, uid: str, nonce: str, now: int) -> bool:
        pk = [("uid", uid), ("nonce", f"bind:{nonce}")]
        _, row, _ = self.client.get_row("nonces", pk, columns_to_get=["expires_at"], max_version=1)
        if row is None:
            return False
        expires = dict((c[0], c[1]) for c in row.attribute_columns).get("expires_at")
        if not isinstance(expires, int) or expires < now:
            return False
        # Delete only if the row is still there, so two requests can't both take it.
        try:
            self.client.delete_row(
                "nonces", ots.Row(pk), ots.Condition(ots.RowExistenceExpectation.EXPECT_EXIST)
            )
            return True
        except ots.OTSServiceError as err:
            if _is_condition_failure(err):
                return False
            raise

    # --- key -> uid reverse index (in the bindings table, pk "k:<key>") ----
    def uid_for_key(self, key: str) -> str | None:
        _, row, _ = self.client.get_row("bindings", [("uid", f"k:{key}")], columns_to_get=["uid"], max_version=1)
        if row is None:
            return None
        value = dict((c[0], c[1]) for c in row.attribute_columns).get("uid")
        return value if isinstance(value, str) else None

    def set_key_index(self, key: str, uid: str) -> None:
        self.client.put_row("bindings", ots.Row([("uid", f"k:{key}")], [("uid", uid)]))

    def delete_key_index(self, key: str) -> None:
        self.client.delete_row(
            "bindings", ots.Row([("uid", f"k:{key}")]), ots.Condition(ots.RowExistenceExpectation.IGNORE)
        )
