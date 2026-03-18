from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.config import settings


def _b64url_encode(raw: bytes) -> str:
    # JWT uses base64url without padding.
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    # Add padding back if needed.
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("ascii"))


# -------------------------
# Password hashing (stdlib)
# -------------------------
#
# In production, prefer passlib (bcrypt/argon2). Our environment is offline, so
# we use PBKDF2-HMAC-SHA256 from Python stdlib.

PBKDF2_ITERS = 260_000


def hash_password(password: str) -> str:
    if not isinstance(password, str) or not password:
        raise ValueError("password must be a non-empty string")

    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERS, dklen=32)

    salt_b64 = _b64url_encode(salt)
    dk_b64 = _b64url_encode(dk)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt_b64}${dk_b64}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters_s, salt_b64, dk_b64 = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters_s)
        salt = _b64url_decode(salt_b64)
        expected = _b64url_decode(dk_b64)
    except Exception:
        return False

    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters, dklen=len(expected))
    return hmac.compare_digest(dk, expected)


# -------------------------
# JWT (HS256, stdlib)
# -------------------------


@dataclass(frozen=True)
class JwtClaims:
    sub: str
    role: str
    exp: int
    iat: int
    iss: str


def encode_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = _b64url_encode(json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    p = _b64url_encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    data = f"{h}.{p}".encode("ascii")
    sig = hmac.new(settings.JWT_SECRET.encode("utf-8"), data, hashlib.sha256).digest()
    s = _b64url_encode(sig)
    return f"{h}.{p}.{s}"


def decode_and_verify_jwt(token: str) -> dict:
    try:
        h, p, s = token.split(".", 2)
    except ValueError as e:
        raise ValueError("invalid token format") from e

    # Verify signature first (don't trust header until signature is valid).
    data = f"{h}.{p}".encode("ascii")
    expected_sig = hmac.new(settings.JWT_SECRET.encode("utf-8"), data, hashlib.sha256).digest()
    got_sig = _b64url_decode(s)
    if not hmac.compare_digest(got_sig, expected_sig):
        raise ValueError("invalid token signature")

    header = json.loads(_b64url_decode(h))
    if header.get("alg") != "HS256" or header.get("typ") != "JWT":
        raise ValueError("unsupported token header")

    payload = json.loads(_b64url_decode(p))

    # Basic claims checks.
    if payload.get("iss") != settings.JWT_ISSUER:
        raise ValueError("invalid issuer")
    exp = payload.get("exp")
    if not isinstance(exp, int):
        raise ValueError("invalid exp")
    if int(time.time()) >= exp:
        raise ValueError("token expired")

    return payload


def make_access_token(*, user_id: int, role: str, username: str | None = None) -> str:
    now = int(time.time())
    exp = now + int(settings.ACCESS_TOKEN_TTL_MINUTES) * 60
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": exp,
        "iss": settings.JWT_ISSUER,
    }
    if username:
        payload["usr"] = username
    return encode_jwt(payload)


def now_utc() -> datetime:
    # Keep timestamps naive UTC to match how the rest of the project stores
    # DateTime in SQLite.
    return datetime.utcnow()


def refresh_expires_at() -> datetime:
    # Sliding idle timeout: while the user is active and keeps refreshing, the
    # session stays alive. If inactive longer than this window, refresh fails.
    return now_utc() + timedelta(minutes=int(settings.SESSION_IDLE_TTL_MINUTES))


def hash_refresh_token(token: str) -> str:
    # Store only a hash in DB (so DB leak doesn't leak valid refresh tokens).
    # Using a server-side secret as a pepper.
    raw = (settings.JWT_SECRET + ":" + token).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)
