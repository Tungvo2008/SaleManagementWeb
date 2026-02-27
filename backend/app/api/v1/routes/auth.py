from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    decode_and_verify_jwt,
    hash_refresh_token,
    make_access_token,
    new_refresh_token,
    now_utc,
    refresh_expires_at,
    verify_password,
)
from app.db.deps import get_db
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import LoginIn, UserOut


router = APIRouter(prefix="/auth")


ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def _set_auth_cookies(*, response: Response, access_token: str, refresh_token: str, refresh_exp: datetime) -> None:
    cookie_kwargs = {
        "httponly": True,
        "samesite": settings.COOKIE_SAMESITE,
        "secure": bool(settings.COOKIE_SECURE),
        "path": "/",
        "domain": settings.COOKIE_DOMAIN,
    }
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        **cookie_kwargs,
        # client-side hint; server enforces exp in JWT
        max_age=int(settings.ACCESS_TOKEN_TTL_MINUTES) * 60,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        **cookie_kwargs,
        # Use max_age instead of expires to avoid timezone-aware datetime issues.
        # Server is the source of truth (DB expires_at).
        max_age=int(settings.REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key=ACCESS_COOKIE, path="/")
    response.delete_cookie(key=REFRESH_COOKIE, path="/")


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalars(select(User).where(User.username == payload.username)).first()
    if user is None or not user.is_active:
        raise HTTPException(401, "Invalid credentials")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    access = make_access_token(user_id=user.id, role=user.role, username=user.username)

    raw_refresh = new_refresh_token()
    exp = refresh_expires_at()
    rt = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=exp,
        revoked_at=None,
        last_used_at=None,
    )
    db.add(rt)
    db.commit()

    _set_auth_cookies(response=response, access_token=access, refresh_token=raw_refresh, refresh_exp=exp)
    return user


@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(401, "Missing refresh token")

    token_hash = hash_refresh_token(raw)
    rt = db.scalars(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
    if rt is None:
        raise HTTPException(401, "Invalid refresh token")
    if rt.revoked_at is not None:
        raise HTTPException(401, "Refresh token revoked")
    if now_utc() >= rt.expires_at:
        raise HTTPException(401, "Refresh token expired")

    user = db.get(User, rt.user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Invalid refresh token")

    # Rotate refresh token (good hygiene): revoke old, issue new.
    rt.revoked_at = now_utc()
    rt.last_used_at = now_utc()

    raw_refresh = new_refresh_token()
    exp = refresh_expires_at()
    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=exp,
        revoked_at=None,
        last_used_at=None,
    )
    db.add(new_rt)

    access = make_access_token(user_id=user.id, role=user.role, username=user.username)
    db.commit()

    _set_auth_cookies(response=response, access_token=access, refresh_token=raw_refresh, refresh_exp=exp)
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        token_hash = hash_refresh_token(raw)
        rt = db.scalars(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
        if rt is not None and rt.revoked_at is None:
            rt.revoked_at = now_utc()
            db.commit()

    _clear_auth_cookies(response)
    return {"ok": True}


def get_current_user(request: Request, db: Session) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(401, "Not authenticated")

    try:
        payload = decode_and_verify_jwt(token)
    except ValueError:
        raise HTTPException(401, "Invalid token")

    sub = payload.get("sub")
    if not sub or not str(sub).isdigit():
        raise HTTPException(401, "Invalid token")

    user = db.get(User, int(sub))
    if user is None or not user.is_active:
        raise HTTPException(401, "Invalid token")
    return user


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    return get_current_user(request, db)


def require_roles(*roles: str):
    allowed = {r.strip() for r in roles if r and r.strip()}

    def _dep(user: User = Depends(current_user)) -> User:
        if allowed and user.role not in allowed:
            raise HTTPException(403, "Forbidden")
        return user

    return _dep


require_admin = require_roles("admin")
require_pos = require_roles("admin", "cashier", "manager")
require_manager = require_roles("admin", "manager")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
