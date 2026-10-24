"""
Deletes photos and voice notes whose keep-until date has passed.

Run daily from the host's cron:

    0 3 * * * cd /opt/fieldforce-manager && docker compose -f docker-compose.prod.yml exec -T backend python scripts/purge_media.py >> /var/log/fieldforce-purge.log 2>&1

Only files whose company is set to automatic retention are touched, and
only ones whose expires_at — written when the file was uploaded, under
whatever rule was in force then — is in the past. A company set to
"never" has no expires_at on anything, so it is invisible to this script
no matter how often it runs.

The row survives the file. A visit that shows "photo removed, 12 March"
is telling the truth about its own history; one that simply shows
nothing looks like the system lost it, and that is how people stop
believing a record.

Safe to run twice: purged rows are skipped, and a file already gone from
disk is not an error.

    python scripts/purge_media.py            # delete
    python scripts/purge_media.py --dry-run  # report only
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal  # noqa: E402
from app.models.visit_attachment import VisitAttachment  # noqa: E402
from app.core.media import delete_file  # noqa: E402


def main(dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = (
            db.query(VisitAttachment)
            .filter(
                VisitAttachment.expires_at.isnot(None),
                VisitAttachment.expires_at <= now,
                VisitAttachment.purged_at.is_(None),
            )
            .order_by(VisitAttachment.expires_at)
            .all()
        )

        if not due:
            print(f"{now:%Y-%m-%d %H:%M} — nothing due")
            return

        freed = 0
        removed = 0
        for a in due:
            freed += a.size_bytes or 0
            if dry_run:
                continue
            delete_file(a.url)
            a.purged_at = now
            removed += 1

        if dry_run:
            print(f"{now:%Y-%m-%d %H:%M} — would purge {len(due)} files, {freed / 1e6:.1f} MB")
            return

        db.commit()
        print(f"{now:%Y-%m-%d %H:%M} — purged {removed} files, freed {freed / 1e6:.1f} MB")
    finally:
        db.close()


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
