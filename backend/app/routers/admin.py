from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentAdmin, DbSession
from app.models import User
from app.schemas import AdminUserUpdate, UserOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
def list_users(db: DbSession, _admin: CurrentAdmin):
    return db.scalars(select(User).order_by(User.created_at)).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: AdminUserUpdate, admin: CurrentAdmin, db: DbSession):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == admin.id and body.is_admin is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own admin access",
        )
    if user.id == admin.id and body.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    db.commit()
    db.refresh(user)
    return user
