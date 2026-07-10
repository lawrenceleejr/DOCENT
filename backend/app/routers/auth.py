from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, UserOut
from app.security import (
    clear_auth_cookie,
    create_access_token,
    hash_password,
    set_auth_cookie,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, response: Response, db: DbSession):
    settings = get_settings()
    if settings.invite_code and body.invite_code != settings.invite_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid invite code"
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

    set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: DbSession):
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
    set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    clear_auth_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
