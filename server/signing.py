"""Ed25519 verification in pure Python (RFC 8032), so the function needs no native packages.

Only used to check short messages from clients, a few per second at most, so speed is not a concern.
"""

import base64
import hashlib

from marker import decode_key

_P = 2**255 - 19
_Q = 2**252 + 27742317777372353535851937790883648493
_D = (-121665 * pow(121666, _P - 2, _P)) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)


def _inv(x: int) -> int:
    return pow(x, _P - 2, _P)


def _recover_x(y: int, sign: int) -> int | None:
    if y >= _P:
        return None
    x2 = (y * y - 1) * _inv(_D * y * y + 1) % _P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _SQRT_M1 % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return x


# Points in extended coordinates (X, Y, Z, T).
_BY = 4 * _inv(5) % _P
_BX = _recover_x(_BY, 0)
_B = (_BX, _BY, 1, _BX * _BY % _P)
_IDENTITY = (0, 1, 1, 0)


def _add(p, q):
    a = (p[1] - p[0]) * (q[1] - q[0]) % _P
    b = (p[1] + p[0]) * (q[1] + q[0]) % _P
    c = 2 * p[3] * q[3] * _D % _P
    d = 2 * p[2] * q[2] % _P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


def _mul(s: int, p):
    result = _IDENTITY
    while s > 0:
        if s & 1:
            result = _add(result, p)
        p = _add(p, p)
        s >>= 1
    return result


def _equal(p, q) -> bool:
    # x1/z1 == x2/z2 and y1/z1 == y2/z2, without inverting.
    return (p[0] * q[2] - q[0] * p[2]) % _P == 0 and (p[1] * q[2] - q[1] * p[2]) % _P == 0


def _decode_point(data: bytes):
    if len(data) != 32:
        return None
    y = int.from_bytes(data, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % _P)


def verify_raw(public: bytes, message: bytes, signature: bytes) -> bool:
    if len(signature) != 64 or len(public) != 32:
        return False
    a_point = _decode_point(public)
    r_point = _decode_point(signature[:32])
    if a_point is None or r_point is None:
        return False
    s = int.from_bytes(signature[32:], "little")
    if s >= _Q:
        return False
    h = int.from_bytes(hashlib.sha512(signature[:32] + public + message).digest(), "little") % _Q
    return _equal(_mul(s, _B), _add(r_point, _mul(h, a_point)))


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
    return verify_raw(raw_key, message, signature)
