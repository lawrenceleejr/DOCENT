from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import User
from app.ratelimit import login_rate_limit, register_rate_limit
from app.schemas import AuthConfig, LoginRequest, RegisterRequest, UserOut
from app.security import (
    clear_auth_cookie,
    create_access_token,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.services.settings import (
    effective_contact_email,
    effective_invite_code,
    effective_login_message,
    effective_map_center_lat,
    effective_map_center_lon,
    effective_site_name,
    public_page_enabled,
    user_directory_visible,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/config", response_model=AuthConfig)
def auth_config(db: DbSession) -> AuthConfig:
    """Public: instance-wide, non-sensitive config the login/register pages
    (and, once signed in, the rest of the app) need — sign-up status, contact
    info, and small branding/behavior overrides like the map's start point."""
    return AuthConfig(
        registration_enabled=bool(effective_invite_code(db)),
        contact_email=effective_contact_email(db) or None,
        site_name=effective_site_name(db) or None,
        public_page=public_page_enabled(db),
        login_message=effective_login_message(db) or None,
        map_center_lat=effective_map_center_lat(db),
        map_center_lon=effective_map_center_lon(db),
        user_directory_visible=user_directory_visible(db),
    )


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_rate_limit)],
)
def register(body: RegisterRequest, request: Request, response: Response, db: DbSession):
    invite_code = effective_invite_code(db)
    # An access code is always required. With none configured, sign-up is closed.
    if not invite_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is closed. Contact the administrator for access.",
        )
    if not body.invite_code or body.invite_code.strip() != invite_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing access code.",
        )

    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # First account ever created becomes the admin (bootstrap).
    is_first_user = db.scalar(select(func.count()).select_from(User)) == 0
    user = User(
        email=email,
        name=body.name,
        affiliation=body.affiliation,
        password_hash=hash_password(body.password),
        is_admin=is_first_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    set_auth_cookie(response, create_access_token(user.id), request)
    return user


@router.post("/login", response_model=UserOut, dependencies=[Depends(login_rate_limit)])
def login(body: LoginRequest, request: Request, response: Response, db: DbSession):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is deactivated"
        )
    set_auth_cookie(response, create_access_token(user.id), request)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    clear_auth_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
