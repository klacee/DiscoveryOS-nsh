"""FC HTTP entry point for the reactions API.

Routes (every reaction route is signed; see reactions.py):
  GET  /health                 -> {"ok": true}
  POST /bind/challenge         -> {"uid"} -> one-time nonce
  POST /bind/complete          -> {"uid", "nonce", "sig"} -> binds uid to the key in its profile
  GET  /reactions?uid&pids&ts&nonce&sig -> per-post emoji counts
  POST /reactions              -> signed add/remove

Environment:
  OTS_ENDPOINT   TableStore endpoint of the instance
  OTS_INSTANCE   instance name (nsh-reactions)

Credentials come from the function's role (FC context.credentials), never from env vars.
"""

import json
import os
import time

import tablestore as ots

import bind
from reactions import handle_counts, handle_reaction
from store_tablestore import TableStoreStore

_store = None


def _response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
        "isBase64Encoded": False,
        "body": json.dumps(payload, separators=(",", ":")),
    }


def _store_for(context):
    """The store, built once per instance from the function's own credentials."""
    global _store
    if _store is None:
        creds = context.credentials
        client = ots.OTSClient(
            os.environ["OTS_ENDPOINT"],
            creds.access_key_id,
            creds.access_key_secret,
            os.environ["OTS_INSTANCE"],
            sts_token=creds.security_token,
        )
        _store = TableStoreStore(client, now_fn=lambda: int(time.time()))
    return _store


def _parse_request(event):
    if isinstance(event, (bytes, str)):
        try:
            event = json.loads(event)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
    if not isinstance(event, dict):
        return None
    http = (event.get("requestContext") or {}).get("http") or {}
    method = http.get("method")
    path = http.get("path") or event.get("rawPath") or "/"
    query = event.get("queryParameters") or {}
    body = None
    raw = event.get("body")
    if raw:
        if event.get("isBase64Encoded"):
            return None
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            return None
    return {"method": method, "path": path, "query": query, "body": body}


_ROUTES = {"/reactions": {"GET", "POST"}, "/bind/challenge": {"POST"}, "/bind/complete": {"POST"}}


def handler(event, context):
    request = _parse_request(event)
    if request is None:
        return _response(400, {"error": "invalid_event"})

    method, path = request["method"], request["path"]
    now = int(time.time())

    if path == "/health":
        if method == "GET":
            return _response(200, {"ok": True})
        return _response(405, {"error": "method_not_allowed"})
    if path not in _ROUTES:
        return _response(404, {"error": "not_found"})
    if method not in _ROUTES[path]:
        return _response(405, {"error": "method_not_allowed"})

    try:
        if path == "/reactions" and method == "GET":
            status, payload = handle_counts(request["query"], now, _store_for(context))
        else:
            if not isinstance(request["body"], dict):
                return _response(400, {"error": "invalid_body"})
            body = request["body"]
            if path == "/reactions":
                status, payload = handle_reaction(body, now, _store_for(context))
            elif path == "/bind/challenge":
                status, payload = bind.start(body.get("uid"), now, _store_for(context))
            else:
                status, payload = bind.complete(body.get("uid"), body.get("nonce"), body.get("sig"), now, _store_for(context))
    except (ots.OTSServiceError, ots.OTSClientError):
        return _response(503, {"error": "storage_unavailable"})
    return _response(status, payload)
