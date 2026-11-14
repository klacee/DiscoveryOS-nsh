"""Ed25519 verification of a client's signed request."""

import base64

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from marker import decode_key


def _b64url_decode(text: str) -> bytes | None:
    if not isinstance(text, str) or len(text) != 86:  # 64 bytes, unpadded
        return None
    try:
        raw = base64.urlsafe_b64decode(text + "==")
    except ValueError:
        return None
    return raw if len(raw) == 64 else None


def verify(public_key_text: str, message: bytes, signature_text: str) -> bool:
    raw_key = decode_key(public_key_text)
    signature = _b64url_decode(signature_text)
    if raw_key is None or signature is None:
        return False
    try:
        Ed25519PublicKey.from_public_bytes(raw_key).verify(signature, message)
    except InvalidSignature:
        return False
    return True
