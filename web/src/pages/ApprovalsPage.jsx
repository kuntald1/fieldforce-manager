import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css";
import { listTaskApprovals, listRoutes, listUsers, reviewTaskApproval } from "../api/client";

const STATUS_BADGE = {
  pending: { background: "#faf1de", color: "#a06b1f" },
  approved: { background: "#e3f1e4", color: "var(--emerald-deep)" },
  rejected: { background: "#f6e2de", color: "var(--error)" },
};

export default function ApprovalsPage({ token }) {
  const [requests, setRequests] = useState(null);
  const [routesById, setRoutesById] = useState({});
  const [agentNames, setAgentNames] = useState({});
  const [error, setError] = useState(null);
  const [actingOnId, setActingOnId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    refresh();
    listRoutes(token)
      .then((list) => {
        const map = {};
        list.forEach((r) => (map[r.id] = r));
        setRoutesById(map);
      })
      .catch(() => {});
    listUsers(token, "agent")
      .then((list) => {
        const map = {};
        list.forEach((u) => (map[u.id] = u.name));
        setAgentNames(map);
      })
      .catch(() => {});
  }, [token]);

  function refresh() {
    listTaskApprovals(token)
      .then((list) => setRequests(list))
      .catch((err) => setError(err.message));
  }

  async function handleDecision(id, decision) {
    setActingOnId(id);
    setError(null);
    try {
      const updated = await reviewTaskApproval(token, id, decision);
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(err.message);
    } finally {
      setActingOnId(null);
    }
  }

  const visibleRequests = requests ? (showAll ? requests : requests.filter((r) => r.status === "pending")) : null;

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Approvals</h1>
          <p className={styles.sub}>Tasks agents marked incomplete, with their reason — review and decide.</p>
        </div>
        <button className={styles.addButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show pending only" : "Show all"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {visibleRequests === null && !error && <p className={styles.state}>Loading…</p>}
      {visibleRequests && visibleRequests.length === 0 && (
        <p className={styles.state}>{showAll ? "No approval requests yet." : "No pending requests."}</p>
      )}

      {visibleRequests && visibleRequests.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Reason</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRequests.map((r) => {
              const route = routesById[r.daily_route_id];
              return (
                <tr key={r.id}>
                  <td className={styles.nameCell}>{agentNames[r.agent_id] || "No data available"}</td>
                  <td className={styles.muted}>{route?.route_date || "—"}</td>
                  <td className={styles.muted} style={{ maxWidth: 320 }}>
                    {r.reason}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 500,
                        padding: "3px 10px",
                        borderRadius: 999,
                        textTransform: "capitalize",
                        ...(STATUS_BADGE[r.status] || {}),
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className={styles.editCell} style={{ width: "auto" }}>
                    {r.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className={styles.editButton}
                          onClick={() => handleDecision(r.id, "approve")}
                          disabled={actingOnId === r.id}
                        >
                          {actingOnId === r.id ? "…" : "Approve"}
                        </button>
                        <button
                          className={styles.editButton}
                          onClick={() => handleDecision(r.id, "reject")}
                          disabled={actingOnId === r.id}
                        >
                          {actingOnId === r.id ? "…" : "Reject"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
