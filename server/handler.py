"""FC HTTP entry point for the reactions API.

Routes:
  GET  /health                 -> {"ok": true}
  GET  /reactions?pids=1,2     -> per-post emoji counts
  POST /reactions              -> signed add/remove (see reactions.py)

Environment:
  OTS_ENDPOINT   TableStore endpoint of the instance
  OTS_INSTANCE   instance name (nsh-reactions)

Credentials come from the function's role (FC context.credentials), never from env vars.
"""

import json
import os
import time

import tablestore as ots

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
            instance_name=os.environ["OTS_INSTANCE"],
            credentials_provider=ots.StaticCredentialsProvider(
                creds.access_key_id, creds.access_key_secret, creds.security_token
            ),
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


def handler(event, context):
    request = _parse_request(event)
    if request is None:
        return _response(400, {"error": "invalid_event"})

    method, path = request["method"], request["path"]
    if path == "/health" and method == "GET":
        return _response(200, {"ok": True})

    if path == "/reactions" and method == "GET":
        pids = request["query"].get("pids", "")
        try:
            status, payload = handle_counts(pids, _store_for(context))
        except ots.OTSServiceError:
            return _response(503, {"error": "storage_unavailable"})
        return _response(status, payload)

    if path == "/reactions" and method == "POST":
        if not isinstance(request["body"], dict):
            return _response(400, {"error": "invalid_body"})
        try:
            status, payload = handle_reaction(request["body"], int(time.time()), _store_for(context))
        except ots.OTSServiceError:
            return _response(503, {"error": "storage_unavailable"})
        return _response(status, payload)

    if path in ("/health", "/reactions"):
        return _response(405, {"error": "method_not_allowed"})
    return _response(404, {"error": "not_found"})
