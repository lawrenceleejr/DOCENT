# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Standing personal-network contacts at a venue — independent of any
logged visit. Community-visible (like everything else in DOCENT): anyone
signed in can see a connection, but only whoever added it, or an admin,
can edit or delete it."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbSession
from app.models import Connection, User, Venue
from app.schemas import ConnectionCreate, ConnectionOut, ConnectionUpdate

router = APIRouter(prefix="/api/connections", tags=["connections"])


def _require_owner_or_admin(connection: Connection, user: User) -> None:
    if connection.added_by_id != user.id and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only whoever added this connection or an admin can modify it",
        )


@router.get("", response_model=list[ConnectionOut])
def list_connections(venue_id: int, db: DbSession, _user: CurrentUser):
    return db.scalars(
        select(Connection).where(Connection.venue_id == venue_id).order_by(Connection.name)
    ).all()


@router.post("", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
def create_connection(body: ConnectionCreate, user: CurrentUser, db: DbSession):
    if not db.get(Venue, body.venue_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    connection = Connection(**body.model_dump(), added_by_id=user.id)
    db.add(connection)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A connection with this name already exists at this venue — edit it instead",
        )
    db.refresh(connection)
    return connection


@router.patch("/{connection_id}", response_model=ConnectionOut)
def update_connection(
    connection_id: int, body: ConnectionUpdate, user: CurrentUser, db: DbSession
):
    connection = db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    _require_owner_or_admin(connection, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(connection, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A connection with this name already exists at this venue",
        )
    db.refresh(connection)
    return connection


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(connection_id: int, user: CurrentUser, db: DbSession):
    connection = db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    _require_owner_or_admin(connection, user)
    db.delete(connection)
    db.commit()
