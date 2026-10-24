import { useEffect, useState } from "react";
import { getCustomerHistory, API_BASE_URL } from "../api/client";

/**
 * Everything that has happened at one customer, newest first.
 *
 * Shared by the Scheduled Meetings screen and the Customer visit
 * frequency report, because both end in the same question — "fine, so
 * what actually happened there?" — and answering it twice in two places
 * is how two answers start to disagree.
 *
 * A purged attachment still gets a line. The file is gone under the
 * company's retention rule, but the fact that a photo was taken on that
 * day is itself part of the record, and a silent gap reads as the system
 * having lost something.
 */
export default function CustomerHistory({ token, customerId, customerName, startDate, endDate }) {
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerId) return;
    setVisits(null);
    setError(null);
    getCustomerHistory(token, customerId, startDate, endDate)
      .then(setVisits)
      .catch((err) => setError(err.message));
  }, [token, customerId, startDate, endDate]);

  if (!customerId) return null;
  if (error) return <p style={{ color: "var(--error)" }}>{error}</p>;
  if (visits === null) return <p style={{ color: "var(--muted)" }}>Loading history…</p>;
  if (visits.length === 0)
    return (
      <p style={{ color: "var(--muted)" }}>
        No visits to {customerName || "this customer"} in this date range.
      </p>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {visits.map((v) => (
        <VisitCard key={v.id} visit={v} />
      ))}
    </div>
  );
}

function VisitCard({ visit }) {
  const photos = (visit.attachments || []).filter((a) => a.kind === "photo");
  const audio = (visit.attachments || []).filter((a) => a.kind === "audio");
  // The check-in photo, which is not an attachment row. On older visits
  // it is the only picture there is, and on new ones it is the FIRST of
  // the company's allowance — the app sends photo one with the check-in
  // and the rest as attachments. So it is always shown; hiding it
  // whenever attachments existed would drop the main photo from every
  // visit where the agent took more than one.
  const checkInPhoto = visit.check_in_photo_url || null;

  return (
    <div
      style={{
        border: "1px solid var(--surface-border)",
        borderRadius: 10,
        padding: 16,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ color: "var(--ink)", fontSize: "0.98rem" }}>
          {visit.check_in_time ? new Date(visit.check_in_time).toLocaleString() : "No check-in time"}
        </strong>
        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          {visit.agent_name}
          {visit.check_in_distance_m != null && ` · ${Math.round(visit.check_in_distance_m)} m from the shop`}
        </span>
      </div>

      {visit.next_meeting_at && (
        <div style={{ marginTop: 8 }}>
          <span
            style={{
              fontSize: "0.78rem",
              fontWeight: 500,
              padding: "3px 10px",
              borderRadius: 999,
              background: "#e3f1e4",
              color: "var(--emerald-deep)",
            }}
          >
            Next meeting {new Date(visit.next_meeting_at).toLocaleString()}
          </span>
        </div>
      )}

      {visit.visit_notes && (
        <p
          style={{
            marginTop: 10,
            marginBottom: 0,
            color: "var(--ink)",
            fontSize: "0.92rem",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {visit.visit_notes}
        </p>
      )}

      {(photos.length > 0 || checkInPhoto) && (
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {checkInPhoto && <Thumb url={checkInPhoto} />}
          {photos.map((p) =>
            p.purged_at ? (
              <Removed key={p.id} at={p.created_at} what="Photo" />
            ) : (
              <Thumb key={p.id} url={p.url} />
            )
          )}
        </div>
      )}

      {audio.map((a) =>
        a.purged_at ? (
          <div key={a.id} style={{ marginTop: 12 }}>
            <Removed at={a.created_at} what="Voice note" />
          </div>
        ) : (
          <div key={a.id} style={{ marginTop: 12 }}>
            <audio controls preload="none" src={`${API_BASE_URL}${a.url}`} style={{ width: "100%", maxWidth: 420 }} />
            {a.duration_seconds != null && (
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", marginLeft: 8 }}>
                {formatDuration(a.duration_seconds)}
              </span>
            )}
          </div>
        )
      )}

      {photos.length === 0 && !checkInPhoto && audio.length === 0 && !visit.visit_notes && (
        <p style={{ marginTop: 10, marginBottom: 0, color: "var(--muted)", fontSize: "0.88rem" }}>
          Checked in, nothing else recorded.
        </p>
      )}
    </div>
  );
}

function Thumb({ url }) {
  return (
    <a href={`${API_BASE_URL}${url}`} target="_blank" rel="noreferrer">
      <img
        src={`${API_BASE_URL}${url}`}
        alt="Visit"
        style={{ width: 108, height: 108, objectFit: "cover", borderRadius: 8, border: "1px solid var(--surface-border)" }}
      />
    </a>
  );
}

/** The file is gone under the retention rule — say so rather than show
 * a broken image or, worse, nothing at all. */
function Removed({ at, what }) {
  return (
    <div
      style={{
        width: 108,
        height: 108,
        borderRadius: 8,
        border: "1px dashed var(--surface-border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: "0.72rem",
        padding: 8,
      }}
    >
      <span style={{ fontWeight: 600 }}>{what} removed</span>
      <span>taken {new Date(at).toLocaleDateString()}</span>
    </div>
  );
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}
