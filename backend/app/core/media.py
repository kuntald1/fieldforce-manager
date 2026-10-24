"""
Where a visit's photos and voice notes are stored, and when they stop
being stored.

Everything about media on this system is governed by one number nobody
sees: a GPS ping is ~150 bytes, a shrunk photo ~150 KB, a three-minute
voice note ~1.4 MB. One voice note is roughly ten thousand pings. So the
limits here are not fussiness — they are what keeps a shared VPS from
filling in weeks instead of years.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile, status

from app.models.enums import AttachmentKind, MediaRetention
from app.models.organization import Organization

PHOTO_DIR = "uploads/visit_photos"
AUDIO_DIR = "uploads/visit_audio"

ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}
# m4a/aac is what both phone platforms record natively, so nothing has to
# be transcoded on a device that is already short of battery.
ALLOWED_AUDIO_EXTENSIONS = {".m4a", ".mp4", ".aac", ".mp3", ".3gp"}

# A ceiling the per-company settings sit under, so a mistyped setting
# (300 photos, 3000 seconds) cannot turn one visit into a gigabyte.
HARD_MAX_PHOTOS = 10
HARD_MAX_AUDIO_SECONDS = 600

# The app shrinks both before sending — a photo to 1000px, audio to a low
# bitrate — so anything far above these is a client that did not, or a
# file that is not what it claims to be.
MAX_PHOTO_BYTES = 4 * 1024 * 1024
MAX_AUDIO_BYTES = 12 * 1024 * 1024


def limits_for(org: Organization) -> tuple[int, int]:
    """(max photos per visit, max audio seconds) for this company, clamped
    to the hard ceilings above."""
    return (
        max(0, min(org.max_visit_photos or 0, HARD_MAX_PHOTOS)),
        max(0, min(org.max_audio_seconds or 0, HARD_MAX_AUDIO_SECONDS)),
    )


def expiry_for(org: Organization, kind: AttachmentKind) -> datetime | None:
    """
    When this file should be deleted, decided ONCE at upload time.

    Writing it on the row rather than working it out later in the purge
    job is deliberate: the setting is editable, and a photo taken under a
    three-month rule should not suddenly have six months — or be deleted
    tomorrow — because someone changed the rule afterwards. Each file
    carries the promise it was stored under.

    None means keep indefinitely.
    """
    if org.media_retention != MediaRetention.automatic:
        return None
    months = org.photo_retention_months if kind == AttachmentKind.photo else org.audio_retention_months
    if not months or months <= 0:
        return None
    # Calendar months are not a timedelta, and nothing here needs them to
    # be exact — "about three months from now" is the entire requirement,
    # and 30-day months keep the arithmetic honest about that.
    return datetime.now(timezone.utc) + timedelta(days=30 * months)


def save_upload(upload: UploadFile, kind: AttachmentKind, visit_id: int) -> tuple[str, int]:
    """Writes the file and returns (public url, size in bytes)."""
    ext = os.path.splitext(upload.filename or "")[1].lower()
    allowed = ALLOWED_PHOTO_EXTENSIONS if kind == AttachmentKind.photo else ALLOWED_AUDIO_EXTENSIONS
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported {kind.value} format '{ext}' — use {', '.join(sorted(allowed))}",
        )

    data = upload.file.read()
    cap = MAX_PHOTO_BYTES if kind == AttachmentKind.photo else MAX_AUDIO_BYTES
    if len(data) > cap:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"That {kind.value} is {len(data) // (1024 * 1024)} MB, over the {cap // (1024 * 1024)} MB limit.",
        )

    directory = PHOTO_DIR if kind == AttachmentKind.photo else AUDIO_DIR
    os.makedirs(directory, exist_ok=True)
    filename = f"visit{visit_id}_{uuid.uuid4().hex}{ext}"
    with open(os.path.join(directory, filename), "wb") as f:
        f.write(data)
    return f"/{directory}/{filename}", len(data)


def delete_file(url: str) -> bool:
    """Removes the file an attachment url points at. Returns whether a
    file was actually there — a missing one is not an error, since the
    purge job must be safe to run twice."""
    if not url:
        return False
    path = url.lstrip("/")
    # Both directories this module writes are under uploads/; refusing
    # anything else means a corrupted or hand-edited url can never make
    # the purge job delete somewhere it shouldn't.
    if not path.startswith("uploads/"):
        return False
    try:
        os.remove(path)
        return True
    except FileNotFoundError:
        return False
