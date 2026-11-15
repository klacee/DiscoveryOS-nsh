import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import bind
from marker import MARKER
from tests.test_core import MemoryStore, b64url, new_identity

# The shape of a real profile's self-introduction cell (captured from a public profile page).
PROFILE = """<table><tr><th>自我介绍:</th>
<td style="word-break:all">{bio}</td>
</tr></table>"""


def page_with_bio(bio: str) -> str:
    return PROFILE.format(bio=bio)


class BioParsingTests(unittest.TestCase):
    def test_bio_keeps_line_breaks_and_drops_tags(self):
        page = page_with_bio("Make Everyday Count^<br>\n<br>\nABC &amp; DEF")
        self.assertEqual(bind.bio_from_profile(page), "Make Everyday Count^\n\nABC & DEF")

    def test_missing_bio_cell(self):
        self.assertIsNone(bind.bio_from_profile("<html>no bio</html>"))


class BindFlowTests(unittest.TestCase):
    NOW = 1_800_000_000

    def setUp(self):
        self.store = MemoryStore()
        self.private, self.key = new_identity()
        self.profile_bio = f"Make Everyday Count^<br><br>{MARKER}{self.key}"

    def fetch_for(self, bio):
        return lambda uid: page_with_bio(bio)

    def challenge(self, uid="42"):
        status, payload = bind.start(uid, self.NOW, self.store)
        self.assertEqual(status, 200)
        return payload["nonce"]

    def sign(self, uid, nonce, private=None):
        return b64url((private or self.private).sign(bind.challenge_message(uid, nonce)))

    def test_bind_succeeds_and_stores_the_key_both_ways(self):
        nonce = self.challenge()
        status, _ = bind.complete("42", nonce, self.sign("42", nonce), self.NOW, self.store, self.fetch_for(self.profile_bio))
        self.assertEqual(status, 200)
        self.assertEqual(self.store.get_key("42"), self.key)
        self.assertEqual(self.store.uid_for_key(self.key), "42")

    def test_challenge_is_one_time(self):
        nonce = self.challenge()
        fetch = self.fetch_for(self.profile_bio)
        self.assertEqual(bind.complete("42", nonce, self.sign("42", nonce), self.NOW, self.store, fetch)[0], 200)
        self.assertEqual(bind.complete("42", nonce, self.sign("42", nonce), self.NOW, self.store, fetch)[0], 401)

    def test_key_not_in_bio_is_rejected(self):
        nonce = self.challenge()
        status, payload = bind.complete("42", nonce, self.sign("42", nonce), self.NOW, self.store, self.fetch_for("no key here"))
        self.assertEqual((status, payload["error"]), (422, "key_not_in_bio"))

    def test_signature_from_another_key_is_rejected(self):
        nonce = self.challenge()
        other, _ = new_identity()
        status, _ = bind.complete("42", nonce, self.sign("42", nonce, other), self.NOW, self.store, self.fetch_for(self.profile_bio))
        self.assertEqual(status, 401)
        self.assertIsNone(self.store.get_key("42"))

    def test_someone_elses_key_cannot_be_bound_to_another_uid(self):
        self.store.set_key("7", self.key)
        self.store.set_key_index(self.key, "7")
        nonce = self.challenge("42")
        status, payload = bind.complete("42", nonce, self.sign("42", nonce), self.NOW, self.store, self.fetch_for(self.profile_bio))
        self.assertEqual((status, payload["error"]), (409, "key_in_use"))

    def test_rotation_removes_the_old_key(self):
        nonce = self.challenge()
        fetch = self.fetch_for(self.profile_bio)
        bind.complete("42", nonce, self.sign("42", nonce), self.NOW, self.store, fetch)
        new_private, new_key = new_identity()
        bio = f"Make Everyday Count^<br><br>{MARKER}{new_key}"
        nonce2 = self.challenge()
        status, _ = bind.complete("42", nonce2, self.sign("42", nonce2, new_private), self.NOW, self.store, self.fetch_for(bio))
        self.assertEqual(status, 200)
        self.assertEqual(self.store.get_key("42"), new_key)
        self.assertIsNone(self.store.uid_for_key(self.key))

    def test_profile_fetch_failure_is_reported(self):
        nonce = self.challenge()

        def down(uid):
            raise OSError("network down")

        status, payload = bind.complete("42", nonce, self.sign("42", nonce), self.NOW, self.store, down)
        self.assertEqual((status, payload["error"]), (502, "profile_unavailable"))


if __name__ == "__main__":
    unittest.main()
