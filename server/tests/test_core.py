import base64
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

import marker
from reactions import WINDOW_SECONDS, canonical_message, handle_counts, handle_reaction
from signing import verify


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def new_identity():
    private = Ed25519PrivateKey.generate()
    public_raw = private.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return private, b64url(public_raw)


class MemoryStore:
    def __init__(self):
        self.keys, self.reactions, self.nonces = {}, set(), {}

    def get_key(self, uid):
        return self.keys.get(uid)

    def set_key(self, uid, key):
        self.keys[uid] = key

    def add_reaction(self, uid, pid, emoji):
        self.reactions.add((uid, pid, emoji))

    def remove_reaction(self, uid, pid, emoji):
        self.reactions.discard((uid, pid, emoji))

    def reactions_for(self, pids):
        out = {p: {} for p in pids}
        for uid, pid, emoji in self.reactions:
            if pid in out:
                out[pid][emoji] = out[pid].get(emoji, 0) + 1
        return out

    def mark_nonce(self, uid, nonce, expires_at):
        k = (uid, nonce)
        if k in self.nonces:
            return False
        self.nonces[k] = expires_at
        return True


class MarkerTests(unittest.TestCase):
    def test_key_has_43_chars_and_round_trips(self):
        _, key = new_identity()
        self.assertEqual(len(key), 43)
        self.assertEqual(marker.extract_key(f"hi {marker.MARKER}{key}"), key)

    def test_embed_keeps_the_user_text_in_front(self):
        _, key = new_identity()
        self.assertEqual(marker.embed_key("Make Everyday Count^", key, 200), f"Make Everyday Count^ {marker.MARKER}{key}")

    def test_rotation_replaces_only_the_key_segment(self):
        _, old = new_identity()
        _, new = new_identity()
        bio = marker.embed_key("my bio", old, 200)
        self.assertEqual(marker.embed_key(bio, new, 200), f"my bio {marker.MARKER}{new}")

    def test_embed_rejects_text_over_the_limit(self):
        _, key = new_identity()
        with self.assertRaises(ValueError):
            marker.embed_key("x" * 200, key, 100)

    def test_non_canonical_or_wrong_length_keys_are_rejected(self):
        _, key = new_identity()
        self.assertIsNone(marker.extract_key(f"{marker.MARKER}{key[:-1]}"))
        self.assertIsNone(marker.extract_key(f"{marker.MARKER}{'+' * 43}"))  # not base64url
        # 43 chars whose last char carries nonzero padding bits: decodes, but is not the canonical form.
        self.assertIsNone(marker.decode_key(key[:-1] + ("B" if key[-1] != "B" else "C")))
        self.assertIsNone(marker.extract_key("no marker here"))


class SigningTests(unittest.TestCase):
    def test_valid_signature_verifies_and_tamper_fails(self):
        private, key = new_identity()
        msg = b"hello"
        sig = b64url(private.sign(msg))
        self.assertTrue(verify(key, msg, sig))
        self.assertFalse(verify(key, b"hellp", sig))


class ReactionTests(unittest.TestCase):
    NOW = 1_800_000_000

    def setUp(self):
        self.private, self.key = new_identity()
        self.store = MemoryStore()
        self.store.set_key("42", self.key)

    def signed(self, action="add", pid="1001", emoji="👍", ts=None, nonce="abcdefgh12", uid="42", private=None):
        ts = self.NOW if ts is None else ts
        msg = canonical_message(action, uid, pid, emoji, ts, nonce)
        sig = b64url((private or self.private).sign(msg))
        return {"uid": uid, "pid": pid, "emoji": emoji, "action": action, "ts": ts, "nonce": nonce, "sig": sig}

    def test_add_then_remove(self):
        self.assertEqual(handle_reaction(self.signed(), self.NOW, self.store)[0], 200)
        self.assertEqual(handle_counts("1001", self.store)[1]["counts"]["1001"], {"👍": 1})
        self.assertEqual(handle_reaction(self.signed("remove", nonce="zzzzzzzz12"), self.NOW, self.store)[0], 200)
        self.assertEqual(handle_counts("1001", self.store)[1]["counts"]["1001"], {})

    def test_replay_is_rejected(self):
        body = self.signed()
        self.assertEqual(handle_reaction(body, self.NOW, self.store)[0], 200)
        self.assertEqual(handle_reaction(body, self.NOW, self.store)[0], 409)

    def test_stale_timestamp_is_rejected(self):
        body = self.signed(ts=self.NOW - WINDOW_SECONDS - 1)
        self.assertEqual(handle_reaction(body, self.NOW, self.store)[0], 401)

    def test_wrong_key_is_rejected(self):
        other, _ = new_identity()
        body = self.signed(private=other)
        self.assertEqual(handle_reaction(body, self.NOW, self.store)[0], 401)

    def test_unbound_uid_is_rejected(self):
        body = self.signed(uid="99")
        self.assertEqual(handle_reaction(body, self.NOW, self.store)[0], 403)

    def test_changed_field_breaks_signature(self):
        body = self.signed()
        body["emoji"] = "🔥"
        self.assertEqual(handle_reaction(body, self.NOW, self.store)[0], 401)


if __name__ == "__main__":
    unittest.main()
