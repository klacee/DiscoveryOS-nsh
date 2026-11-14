import json
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handler
from tests.test_core import MemoryStore, canonical_message, b64url, new_identity


def http_event(method, path, body=None, query=None):
    return {
        "requestContext": {"http": {"method": method, "path": path}},
        "queryParameters": query or {},
        "body": json.dumps(body) if body is not None else None,
        "isBase64Encoded": False,
    }


class Ctx:
    pass


class HandlerTests(unittest.TestCase):
    def setUp(self):
        handler._store = MemoryStore()
        self.private, self.key = new_identity()
        handler._store.set_key("42", self.key)

    def call(self, event):
        resp = handler.handler(event, Ctx())
        return resp["statusCode"], json.loads(resp["body"])

    def test_health(self):
        self.assertEqual(self.call(http_event("GET", "/health")), (200, {"ok": True}))

    def test_unknown_route_and_wrong_method(self):
        self.assertEqual(self.call(http_event("GET", "/nope"))[0], 404)
        self.assertEqual(self.call(http_event("PUT", "/reactions"))[0], 405)

    def test_invalid_event(self):
        self.assertEqual(handler.handler("not json", Ctx())["statusCode"], 400)

    def test_signed_add_then_counts(self):
        body_ts = int(time.time())
        msg = canonical_message("add", "42", "1001", "👍", body_ts, "abcdefgh12")
        body = {
            "uid": "42", "pid": "1001", "emoji": "👍", "action": "add",
            "ts": body_ts, "nonce": "abcdefgh12", "sig": b64url(self.private.sign(msg)),
        }
        self.assertEqual(self.call(http_event("POST", "/reactions", body))[0], 200)
        status, payload = self.call(http_event("GET", "/reactions", query={"pids": "1001"}))
        self.assertEqual(status, 200)
        self.assertEqual(payload["counts"]["1001"], {"👍": 1})

    def test_post_with_non_object_body_is_rejected(self):
        event = http_event("POST", "/reactions")
        event["body"] = json.dumps(["not", "an", "object"])
        self.assertEqual(self.call(event)[0], 400)


if __name__ == "__main__":
    unittest.main()
