import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.visit import Visit
from app.models.visit_attachment import VisitAttachment
from app.models.organization import Organization
from app.models.customer import Customer
from app.models.route import DailyRoute
from app.models.enums import VisitStatus, AttachmentKind
from app.core.deps import get_current_user, require_role
from app.core.geo import haversine_distance_m
from app.core.task_completion import maybe_complete_route
from app.config import settings
from app.schemas.auth import CurrentUser
from app.schemas.visit import VisitOut, CheckOutRequest, VisitDetailsUpdate, VisitAttachmentOut
from app.core import media

router = APIRouter()

ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _get_own_visit_or_404(db: Session, visit_id: int, current_user: CurrentUser) -> Visit:
    """
    Agents can only act on their OWN assigned visits — not just same-org,
    but same-agent. This is a second isolation layer on top of
    organization_id, specific to this router.
    """
    visit = (
        db.query(Visit)
        .filter(
            Visit.id == visit_id,
            Visit.organization_id == current_user.organization_id,
            Visit.agent_id == current_user.user_id,
        )
        .first()
    )
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
    return visit


def _save_photo(visit_id: int, photo: UploadFile) -> str:
    ext = os.path.splitext(photo.filename or "")[1].lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported photo format '{ext}' — use jpg or png",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"visit{visit_id}_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(photo.file.read())

    return f"/uploads/visit_photos/{filename}"


# How far back a client may date a check-in. The agent app holds a
# check-in on the phone when there's no signal and sends it once there is
# (see pendingCheckInService.js), so the honest timestamp is when the
# agent stood at the door, not when the network came back. A whole day of
# slack covers any realistic blackout; beyond that the claim stops being
# credible, and a time in the future never is.
MAX_CHECK_IN_BACKDATE_SECONDS = 24 * 60 * 60


@router.post("/{visit_id}/check-in", response_model=VisitOut)
async def check_in(
    visit_id: int,
    latitude: float = Form(...),
    longitude: float = Form(...),
    check_in_time: datetime | None = Form(None),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    visit = _get_own_visit_or_404(db, visit_id, current_user)

    if visit.status != VisitStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Visit is already '{visit.status.value}' — cannot check in again",
        )

    customer = db.query(Customer).filter(Customer.id == visit.customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer for this visit no longer exists")

    distance_m = haversine_distance_m(latitude, longitude, customer.latitude, customer.longitude)

    if distance_m > customer.geofence_radius_m:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"You are {distance_m:.0f}m from {customer.name}, outside the "
                f"{customer.geofence_radius_m}m check-in radius. Move closer and try again."
            ),
        )

    photo_url = _save_photo(visit_id, photo) if photo else None

    # Note the distance above is measured against the coordinates the
    # client SENT, which for a held check-in are the ones captured when
    # the agent tapped — so the geofence still describes the moment of the
    # visit rather than wherever the phone was when the signal returned.
    now = datetime.now(timezone.utc)
    recorded_at = now
    if check_in_time is not None:
        claimed = check_in_time if check_in_time.tzinfo else check_in_time.replace(tzinfo=timezone.utc)
        age = (now - claimed).total_seconds()
        if 0 <= age <= MAX_CHECK_IN_BACKDATE_SECONDS:
            recorded_at = claimed

    visit.status = VisitStatus.checked_in
    visit.check_in_time = recorded_at
    visit.check_in_latitude = latitude
    visit.check_in_longitude = longitude
    visit.check_in_distance_m = round(distance_m, 1)
    visit.check_in_photo_url = photo_url

    # If this was the last unvisited stop on its route, the route is now
    # fully done — mark it Completed and auto-submit its TA request (the
    # agent app has no separate "Apply for TA" button any more; this is
    # the only path a TA request is created from, besides Force Task
    # Complete being approved).
    if visit.daily_route_id:
        route = db.query(DailyRoute).filter(DailyRoute.id == visit.daily_route_id).first()
        if route:
            maybe_complete_route(db, route)

    db.commit()
    db.refresh(visit)
    return visit


@router.patch("/{visit_id}/details", response_model=VisitOut)
def update_visit_details(
    visit_id: int,
    payload: VisitDetailsUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    """
    The optional extras from the app's details section: the agent's note
    and the date they agreed to come back.

    Separate from check-in, and deliberately forgiving about when it is
    called. The app lets these be filled in while standing at the door,
    or on the way to the next stop, or from a patch of signal an hour
    later — and a check-in must never be held up by an optional field.
    """
    visit = _get_own_visit_or_404(db, visit_id, current_user)

    if payload.visit_notes is not None:
        visit.visit_notes = payload.visit_notes.strip() or None
    if payload.clear_next_meeting:
        visit.next_meeting_at = None
    elif payload.next_meeting_at is not None:
        visit.next_meeting_at = payload.next_meeting_at

    db.commit()
    db.refresh(visit)
    return visit


@router.get("/{visit_id}/attachments", response_model=list[VisitAttachmentOut])
def list_visit_attachments(
    visit_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """An agent sees only their own visit's files; admin and manager see
    any in their company — the same self-scoping as everywhere else."""
    query = db.query(Visit).filter(Visit.id == visit_id, Visit.organization_id == current_user.organization_id)
    if current_user.role == "agent":
        query = query.filter(Visit.agent_id == current_user.user_id)
    visit = query.first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
    return visit.attachments


@router.post("/{visit_id}/attachments", response_model=VisitAttachmentOut, status_code=status.HTTP_201_CREATED)
async def add_visit_attachment(
    visit_id: int,
    kind: str = Form(...),
    duration_seconds: int | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    """
    One photo or one voice note, attached to a stop the agent visited.

    Uploaded one file per call rather than several at once: on a rural
    connection a single request carrying four photos either all arrives
    or all fails, and the one that fails takes the other three with it.
    One at a time means the offline queue can retry exactly what did not
    get through.

    The company's own limits are enforced here and not only in the app,
    because the app is the thing most likely to be out of date — a phone
    still running last month's build would otherwise quietly ignore a
    limit the superadmin set yesterday.
    """
    visit = _get_own_visit_or_404(db, visit_id, current_user)

    try:
        attachment_kind = AttachmentKind(kind)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="kind must be 'photo' or 'audio'",
        )

    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    max_photos, max_audio_seconds = media.limits_for(org)

    if attachment_kind == AttachmentKind.photo:
        if max_photos == 0:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Photos are switched off for this company.")
        existing = sum(1 for a in visit.attachments if a.kind == AttachmentKind.photo)
        if existing >= max_photos:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This stop already has {existing} photos, the most allowed is {max_photos}.",
            )
    else:
        if max_audio_seconds == 0:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Voice notes are switched off for this company.")
        # One recording per stop. A second one is almost always the agent
        # re-recording because the first went wrong, and keeping both
        # leaves whoever reads it later guessing which is the real one.
        existing_audio = next((a for a in visit.attachments if a.kind == AttachmentKind.audio), None)
        if existing_audio is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This stop already has a voice note. Delete it before adding another.",
            )
        if duration_seconds is not None and duration_seconds > max_audio_seconds:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"That recording is {duration_seconds}s, the most allowed is {max_audio_seconds}s.",
            )

    url, size = media.save_upload(file, attachment_kind, visit_id)
    attachment = VisitAttachment(
        organization_id=current_user.organization_id,
        visit_id=visit.id,
        kind=attachment_kind,
        url=url,
        size_bytes=size,
        duration_seconds=duration_seconds if attachment_kind == AttachmentKind.audio else None,
        expires_at=media.expiry_for(org, attachment_kind),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_visit_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """An agent may remove their own mistake; an admin or manager may
    remove anything in their company. Unlike the retention purge, this
    takes the row away too — nothing was recorded here worth keeping a
    marker for."""
    attachment = (
        db.query(VisitAttachment)
        .filter(
            VisitAttachment.id == attachment_id,
            VisitAttachment.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    if current_user.role == "agent":
        visit = db.query(Visit).filter(Visit.id == attachment.visit_id).first()
        if not visit or visit.agent_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    media.delete_file(attachment.url)
    db.delete(attachment)
    db.commit()


@router.post("/{visit_id}/check-out", response_model=VisitOut)
def check_out(
    visit_id: int,
    payload: CheckOutRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    visit = _get_own_visit_or_404(db, visit_id, current_user)

    if visit.status != VisitStatus.checked_in:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Visit must be checked in before it can be checked out (current status: '{visit.status.value}')",
        )

    visit.status = VisitStatus.completed
    visit.check_out_time = datetime.now(timezone.utc)
    if payload.visit_notes is not None:
        visit.visit_notes = payload.visit_notes

    db.commit()
    db.refresh(visit)
    return visit


@router.post("/{visit_id}/manual-complete", response_model=VisitOut)
def manual_complete_visit(
    visit_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    """
    Manual stand-in for the agent app's real check-in (GPS + geofence +
    photo) — same reasoning as the Start/End Task stand-ins: until that
    app exists, admin/manager need a way to mark a stop visited without
    the agent's own device. Deliberately does NOT fabricate GPS
    coordinates or a photo — check_in_latitude/longitude/distance_m and
    check_in_photo_url stay null, so it's never confused with a real,
    geofence-verified check-in later. Goes straight to "completed" (no
    separate check-out step) since there's nothing left to simulate once
    the visit is marked done this way.
    """
    visit = (
        db.query(Visit)
        .filter(Visit.id == visit_id, Visit.organization_id == current_user.organization_id)
        .first()
    )
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
    if visit.status != VisitStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Visit is already '{visit.status.value}' — cannot manually complete again",
        )

    now = datetime.now(timezone.utc)
    visit.status = VisitStatus.completed
    visit.check_in_time = now
    visit.check_out_time = now
    if not visit.visit_notes:
        visit.visit_notes = f"Manually marked complete by {current_user.name} (no agent app yet)."

    if visit.daily_route_id:
        route = db.query(DailyRoute).filter(DailyRoute.id == visit.daily_route_id).first()
        if route:
            maybe_complete_route(db, route)

    db.commit()
    db.refresh(visit)
    return visit


@router.get("/{visit_id}", response_model=VisitOut)
def get_visit(
    visit_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Managers/admins can view any visit in their org; agents only their own."""
    query = db.query(Visit).filter(Visit.id == visit_id, Visit.organization_id == current_user.organization_id)
    if current_user.role == "agent":
        query = query.filter(Visit.agent_id == current_user.user_id)
    visit = query.first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
    return visit


@router.get("", response_model=list[VisitOut])
def list_visits(
    daily_route_id: int | None = None,
    agent_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = db.query(Visit).filter(Visit.organization_id == current_user.organization_id)
    if current_user.role == "agent":
        query = query.filter(Visit.agent_id == current_user.user_id)  # agents never see others' visits
    elif agent_id is not None:
        query = query.filter(Visit.agent_id == agent_id)
    if daily_route_id is not None:
        query = query.filter(Visit.daily_route_id == daily_route_id)
    return query.order_by(Visit.sequence_order).all()
