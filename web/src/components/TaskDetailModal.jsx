import { useEffect, useState } from "react";
import styles from "./CustomerFormModal.module.css"; // overlay/panel/field look
import TaskFlowDiagram from "./TaskFlowDiagram";
import { getAgentRouteForDate, getRouteById, listCustomers, manualCompleteVisit } from "../api/client";
import { reverseGeocodeLabel } from "../utils/mapboxGeocode";

const STATUS_BADGE = {
  completed: { background: "#e3f1e4", color: "var(--emerald-deep)" },
  checked_in: { background: "#e1eef5", color: "#2b6a8a" },
  pending: { background: "#faf1de", color: "#a06b1f" },
  missed: { background: "#f6e2de", color: "var(--error)" },
};

// canManualComplete: only true for the manager/admin view (TasksPage's
// "View") — an agent viewing their own plan (isSelf) never gets this,
// since marking your own stop "done" without a real check-in defeats
// the whole point of verification.
// taskId: the exact DailyRoute to show. An agent/date can now have more
// than one task, so "agent+date" alone is no longer enough to identify
// one — it's only used as a fallback when the date picker below is
// changed to browse a different day (in which case there's no specific
// task id to target, so it shows the first task found for that day, same
// as before this multi-task change).
export default function TaskDetailModal({ token, agentId, agentName, taskId, initialDate, onClose, isSelf = false, canManualComplete = false }) {
  const [date, setDate] = useState(initialDate);
  const [route, setRoute] = useState(null);
  const [customerNames, setCustomerNames] = useState({});
  const [startLabel, setStartLabel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [completingId, setCompletingId] = useState(null);

  useEffect(() => {
    listCustomers(token)
      .then((customers) => {
        const map = {};
        customers.forEach((c) => (map[c.id] = c.name));
        setCustomerNames(map);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStartLabel(null);

    const fetchRoute =
      taskId && date === initialDate ? getRouteById(token, taskId) : getAgentRouteForDate(token, agentId, date);

    fetchRoute
      .then(async (r) => {
        if (cancelled) return;
        setRoute(r);
        if (r?.start_location_name) {
          // The manager-given name — always preferred when it exists,
          // no network call needed.
          setStartLabel(r.start_location_name);
        } else if (r?.route_geometry?.coordinates?.length) {
          // Older task with no stored name — best-effort one-time text
          // lookup, not a map load — the cheap per-request geocoding
          // call, not the billed map widget this view deliberately avoids.
          const [lon, lat] = r.route_geometry.coordinates[0];
          const label = await reverseGeocodeLabel(lon, lat);
          if (!cancelled) setStartLabel(label || "Start");
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [token, agentId, date, taskId, initialDate]);

  const stopLabels = (route?.waypoint_order || []).map((id) => customerNames[id] || "Stop");
  const visitByCustomerId = {};
  (route?.visits || []).forEach((v) => {
    visitByCustomerId[v.customer_id] = v;
  });

  async function handleMarkComplete(visitId) {
    setCompletingId(visitId);
    setError(null);
    try {
      const updatedVisit = await manualCompleteVisit(token, visitId);
      setRoute((prev) => ({
        ...prev,
        visits: prev.visits.map((v) => (v.id === visitId ? updatedVisit : v)),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} style={{ maxWidth: 980 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 className={styles.heading} style={{ margin: 0 }}>
            {isSelf ? "Your plan" : `${agentName}'s plan`}
          </h2>
          <input type="date" className={styles.input} style={{ width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <p className={styles.sub}>A stylized view of the day's order — not a live map, so it never costs a map load.</p>

        {loading && <p className={styles.state}>Loading…</p>}
        {!loading && error && <p className={styles.error}>{error}</p>}
        {!loading && !error && !route && <p className={styles.state}>No task for this date.</p>}

        {!loading && !error && route && (
          <>
            <TaskFlowDiagram startLabel={startLabel} stopLabels={stopLabels} />

            {canManualComplete && (route.waypoint_order || []).length > 0 && (
              <div style={{ marginTop: 16, border: "1px solid var(--surface-border)", borderRadius: 8, padding: 14 }}>
                <p className={styles.sub} style={{ marginBottom: 10 }}>
                  No agent app yet — mark a stop done manually here once it's actually happened.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {route.waypoint_order.map((cid, i) => {
                    const visit = visitByCustomerId[cid];
                    const isPending = visit?.status === "pending";
                    return (
                      <div key={cid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: "0.88rem", color: "var(--ink)" }}>
                          {i + 1}. {customerNames[cid] || "Stop"}
                        </span>
                        {isPending ? (
                          <button
                            className={styles.cancel}
                            style={{ border: "1px solid var(--surface-border)", borderRadius: 6, padding: "6px 12px" }}
                            onClick={() => handleMarkComplete(visit.id)}
                            disabled={completingId === visit?.id}
                          >
                            {completingId === visit?.id ? "…" : "Mark complete"}
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.74rem",
                              fontWeight: 500,
                              padding: "3px 10px",
                              borderRadius: 999,
                              textTransform: "capitalize",
                              ...(STATUS_BADGE[visit?.status] || {}),
                            }}
                          >
                            {visit?.status || "—"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 24, marginTop: 16, fontSize: "0.9rem", color: "var(--muted)" }}>
              <span>
                Planned: <strong style={{ color: "var(--ink)" }}>{route.planned_distance_km} km</strong>
              </span>
              <span>
                Est. time: <strong style={{ color: "var(--ink)" }}>{route.planned_duration_min} min</strong>
              </span>
              <span style={{ textTransform: "capitalize" }}>
                Status: <strong style={{ color: "var(--ink)" }}>{route.status}</strong>
              </span>
            </div>
          </>
        )}

        <div className={styles.actions} style={{ marginTop: 20 }}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
