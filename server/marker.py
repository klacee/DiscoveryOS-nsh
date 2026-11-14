"""Finds and writes the public key inside a forum bio (自我介绍).

The key is appended after the user's own text as `nsh-pk:<key>`. The key is an Ed25519
public key: 32 bytes, encoded as unpadded base64url, so exactly 43 characters.
"""

import base64
import re

MARKER = "nsh-pk:"
KEY_CHARS = 43
_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")


def decode_key(text: str) -> bytes | None:
    """The 32 raw bytes of a base64url key, or None when the text is not one."""
    if not _KEY_RE.match(text):
        return None
    try:
        raw = base64.urlsafe_b64decode(text + "=")
    except ValueError:
        return None
    # Reject non-canonical encodings, so one key has exactly one textual form.
    if len(raw) != 32 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode() != text:
        return None
    return raw


def extract_key(bio: str) -> str | None:
    """The key from the last marker in the bio, or None when there is no valid one."""
    index = bio.rfind(MARKER)
    if index < 0:
        return None
    candidate = bio[index + len(MARKER) : index + len(MARKER) + KEY_CHARS]
    return candidate if decode_key(candidate) is not None else None


def embed_key(bio: str, key: str, max_length: int) -> str:
    """The bio with its key segment set to `key`; the user's own text is kept in front.

    Raises ValueError when the result would be longer than the forum allows.
    """
    if decode_key(key) is None:
        raise ValueError("not a valid key")
    base = bio[: bio.rfind(MARKER)] if extract_key(bio) is not None else bio
    base = base.rstrip()
    text = f"{base} {MARKER}{key}" if base else f"{MARKER}{key}"
    if len(text) > max_length:
        raise ValueError("bio would exceed the forum's length limit")
    return text
