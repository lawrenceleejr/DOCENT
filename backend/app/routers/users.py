from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentUser, DbSession
from app.schemas import UserOut, UserUpdate
from app.security import hash_password, verify_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: CurrentUser, db: DbSession):
    if body.name is not None:
        user.name = body.name
    if body.affiliation is not None:
        user.affiliation = body.affiliation

    if body.new_password is not None:
        if not body.current_password or not verify_password(
            body.current_password, user.password_hash
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Current password is incorrect",
            )
        user.password_hash = hash_password(body.new_password)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user
