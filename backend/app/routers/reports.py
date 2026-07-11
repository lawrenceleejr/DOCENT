from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Query, Response
from sqlalchemy.orm import joinedload

from app.deps import CurrentUser, DbSession
from app.models import AudienceLevel, EventType, VenueType, Visit, VisitStatus
from app.routers.visits import _apply_sort, _filtered_query
from app.services import reports as R

router = APIRouter(prefix="/api/reports", tags=["reports"])

ReportFormat = Literal["json", "csv", "md", "pdf"]
ReportScope = Literal["mine", "all"]
StatusFilter = Literal["completed", "planned", "all"]


@router.get("/activities")
def activities_report(
    db: DbSession,
    user: CurrentUser,
    format: ReportFormat = "json",
    scope: ReportScope = "mine",
    status: StatusFilter = "completed",
    date_from: date | None = None,
    date_to: date | None = None,
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
):
    """Export a grant-ready outreach report in JSON / CSV / Markdown / PDF.

    Excludes private/subjective fields (descriptions, reflections, ratings,
    host contact details and notes) — just the factual activity record.
    """
    author_id = user.id if scope == "mine" else None
    status_filter = None if status == "all" else VisitStatus(status)

    query = _apply_sort(
        _filtered_query(
            date_from=date_from,
            date_to=date_to,
            venue_id=None,
            venue_type=venue_type,
            event_type=event_type,
            audience_level=audience_level,
            author_id=author_id,
            q=None,
            status=status_filter,
        ),
        "-visit_date",
    ).options(joinedload(Visit.author), joinedload(Visit.venue))
    visits = db.scalars(query).all()

    generated_at = datetime.now(timezone.utc)
    report = R.build_report(
        visits,
        scope=scope,
        generated_at=generated_at,
        date_from=date_from,
        date_to=date_to,
    )

    if format == "json":
        content: bytes = R.report_json(report)
    elif format == "csv":
        content = R.report_csv(report).encode("utf-8")
    elif format == "md":
        content = R.report_markdown(report).encode("utf-8")
    else:
        content = R.report_pdf(report)

    filename = R.report_filename(format, generated_at)
    return Response(
        content=content,
        media_type=R.CONTENT_TYPES[format],
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
