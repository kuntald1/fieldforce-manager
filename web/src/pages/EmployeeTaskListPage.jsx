import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css"; // same table/page look as Tasks
import TaskDetailModal from "../components/TaskDetailModal";
import RequestApprovalModal from "../components/RequestApprovalModal";
import { listRoutes, listTaskApprovals, listTravelAllowances, requestTravelAllowance } from "../api/client";

const APPROVAL_BADGE = {
  pending: { text: "Approval: Pending", background: "#faf1de", color: "#a06b1f" },
  approved: { text: "Approval: Approved", background: "#e3f1e4", color: "var(--emerald-deep)" },
  rejected: { text: "Approval: Rejected", background: "#f6e2de", color: "var(--error)" },
};

const TA_BADGE = {
  pending: { text: "TA: Pending", background: "#faf1de", color: "#a06b1f" },
  approved: { text: "TA: Approved", background: "#e3f1e4", color: "var(--emerald-deep)" },
  rejected: { text: "TA: Rejected", background: "#f6e2de", color: "var(--error)" },
};

function isFullyDone(task) {
  if (!task.waypoint_order || task.waypoint_order.length === 0) return true;
  return task.waypoint_order.every((cid) => {
    const v = (task.visits || []).find((x) => x.customer_id === cid);
    return v && (v.status === "completed" || v.status === "checked_in");
  });
}

const PRIORITY_STYLE = {
  high: { background: "#f6e2de", color: "var(--error)" },
  medium: { background: "#faf1de", color: "#a06b1f" },
  low: { background: "#eef0ea", color: "var(--muted)" },
};

export default function EmployeeTaskListPage({ token, user }) {
  const [tasks, setTasks] = useState(null);
  const [approvalsByRoute, setApprovalsByRoute] = useState({}); // daily_route_id -> most recent request
  const [taByRoute, setTaByRoute] = useState({}); // daily_route_id -> most recent TA request
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null); // task object, or null
  const [requesting, setRequesting] = useState(null); // task id currently filling out an approval request for
  const [requestingTaId, setRequestingTaId] = useState(null); // task id currently sending a TA request for

  useEffect(() => {
    // Backend already scopes all of these to the caller's own data for
    // role "agent" regardless of any filters passed — nothing extra needed here.
    listRoutes(token)
      .then((list) => setTasks([...list].sort((a, b) => (a.route_date < b.route_date ? 1 : -1))))
      .catch((err) => setError(err.message));
    refreshApprovals();
    refreshTa();
  }, [token]);

  function refreshApprovals() {
    listTaskApprovals(token)
      .then((list) => {
        const map = {};
        list.forEach((r) => {
          // list comes back newest-first — keep only the first (latest) per route
          if (!map[r.daily_route_id]) map[r.daily_route_id] = r;
        });
        setApprovalsByRoute(map);
      })
      .catch(() => {});
  }

  function refreshTa() {
    listTravelAllowances(token)
      .then((list) => {
        const map = {};
        list.forEach((r) => {
          if (!map[r.daily_route_id]) map[r.daily_route_id] = r;
        });
        setTaByRoute(map);
      })
      .catch(() => {});
  }

  function handleSent(saved) {
    setApprovalsByRoute((prev) => ({ ...prev, [saved.daily_route_id]: saved }));
    setRequesting(null);
  }

  async function handleRequestTa(taskId) {
    setRequestingTaId(taskId);
    setError(null);
    try {
      const saved = await requestTravelAllowance(token, taskId);
      setTaByRoute((prev) => ({ ...prev, [saved.daily_route_id]: saved }));
    } catch (err) {
      setError(err.message);
    } finally {
      setRequestingTaId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>My Tasks</h1>
          <p className={styles.sub}>Everything assigned to you, by date.</p>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {tasks === null && !error && <p className={styles.state}>Loading your tasks…</p>}
      {tasks && tasks.length === 0 && <p className={styles.state}>No tasks assigned yet.</p>}

      {tasks && tasks.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Stops</th>
              <th>Planned distance</th>
              <th>Approval</th>
              <th>Travel Allowance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const approval = approvalsByRoute[t.id];
              const needsApproval = t.status !== "planned" && !isFullyDone(t);
              const ta = taByRoute[t.id];
              const canRequestTa = t.status === "completed";
              return (
              <tr key={t.id}>
                <td className={styles.nameCell}>{t.route_date}</td>
                <td className={styles.muted} style={{ textTransform: "capitalize" }}>
                  {t.status}
                </td>
                <td>
                  <span
                    style={{
                      fontSize: "0.76rem",
                      fontWeight: 500,
                      padding: "3px 10px",
                      borderRadius: 999,
                      textTransform: "capitalize",
                      ...(PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.medium),
                    }}
                  >
                    {t.priority}
                  </span>
                </td>
                <td className={styles.muted}>{t.waypoint_order?.length ?? 0}</td>
                <td className={styles.muted}>{t.planned_distance_km ? `${t.planned_distance_km} km` : "—"}</td>
                <td>
                  {approval ? (
                    <span
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 500,
                        padding: "3px 10px",
                        borderRadius: 999,
                        ...(APPROVAL_BADGE[approval.status] || {}),
                      }}
                    >
                      {APPROVAL_BADGE[approval.status]?.text || approval.status}
                    </span>
                  ) : needsApproval ? (
                    <button className={styles.editButton} onClick={() => setRequesting(t.id)}>
                      Request approval
                    </button>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
                <td>
                  {ta ? (
                    <span
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 500,
                        padding: "3px 10px",
                        borderRadius: 999,
                        ...(TA_BADGE[ta.status] || {}),
                      }}
                    >
                      {TA_BADGE[ta.status]?.text || ta.status}
                      {ta.status === "approved" && ta.amount != null ? ` · ₹${ta.amount}` : ""}
                    </span>
                  ) : canRequestTa ? (
                    <button
                      className={styles.editButton}
                      onClick={() => handleRequestTa(t.id)}
                      disabled={requestingTaId === t.id}
                    >
                      {requestingTaId === t.id ? "Sending…" : "Request TA"}
                    </button>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
                <td className={styles.editCell} style={{ width: "auto" }}>
                  <button className={styles.editButton} onClick={() => setViewing(t)}>
                    View
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {viewing && (
        <TaskDetailModal
          token={token}
          agentId={user.user_id}
          isSelf
          taskId={viewing.id}
          initialDate={viewing.route_date}
          onClose={() => setViewing(null)}
        />
      )}

      {requesting && (
        <RequestApprovalModal token={token} routeId={requesting} onClose={() => setRequesting(null)} onSent={handleSent} />
      )}
    </div>
  );
}
