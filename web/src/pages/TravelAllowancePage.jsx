import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css";
import { listTravelAllowances, listRoutes, listUsers, reviewTravelAllowance } from "../api/client";

const STATUS_BADGE = {
  pending: { background: "#faf1de", color: "#a06b1f" },
  approved: { background: "#e3f1e4", color: "var(--emerald-deep)" },
  rejected: { background: "#f6e2de", color: "var(--error)" },
};

export default function TravelAllowancePage({ token }) {
  const [requests, setRequests] = useState(null);
  const [routesById, setRoutesById] = useState({});
  const [agentNames, setAgentNames] = useState({});
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [actingOnId, setActingOnId] = useState(null);
  const [modifyKm, setModifyKm] = useState({}); // request id -> text input value

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
    listTravelAllowances(token)
      .then(setRequests)
      .catch((err) => setError(err.message));
  }

  async function handleDecision(id, decision) {
    setActingOnId(id);
    setError(null);
    try {
      const approvedKm = decision === "approve" && modifyKm[id] ? Number(modifyKm[id]) : undefined;
      const updated = await reviewTravelAllowance(token, id, decision, { approvedKm });
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
          <h1 className={styles.heading}>Travel Allowance</h1>
          <p className={styles.sub}>Planned vs. actual km for completed tasks, with payout once approved.</p>
        </div>
        <button className={styles.addButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show pending only" : "Show all"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {visibleRequests === null && !error && <p className={styles.state}>Loading…</p>}
      {visibleRequests && visibleRequests.length === 0 && (
        <p className={styles.state}>{showAll ? "No TA requests yet." : "No pending requests."}</p>
      )}

      {visibleRequests && visibleRequests.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Status</th>
              <th>Amount</th>
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
                  <td className={styles.muted}>{r.planned_km != null ? `${r.planned_km} km` : "—"}</td>
                  <td className={styles.muted}>{r.actual_km} km</td>
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
                  <td className={styles.muted}>{r.amount != null ? `₹${r.amount} (${r.approved_km} km)` : "—"}</td>
                  <td className={styles.editCell} style={{ width: "auto" }}>
                    {r.status === "pending" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder={`${r.actual_km}`}
                          value={modifyKm[r.id] || ""}
                          onChange={(e) => setModifyKm((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          style={{ width: 70, padding: "4px 6px", border: "1px solid var(--surface-border)", borderRadius: 6 }}
                          title="Leave blank to approve at actual km, or enter a different km to modify"
                        />
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
