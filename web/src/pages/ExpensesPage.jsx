import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css";
import { listExpenses, listUsers, reviewExpense, API_BASE_URL } from "../api/client";

const STATUS_BADGE = {
  pending: { background: "#faf1de", color: "#a06b1f" },
  approved: { background: "#e3f1e4", color: "var(--emerald-deep)" },
  rejected: { background: "#f6e2de", color: "var(--error)" },
};

export default function ExpensesPage({ token }) {
  const [expenses, setExpenses] = useState(null);
  const [agentNames, setAgentNames] = useState({});
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [actingOnId, setActingOnId] = useState(null);

  useEffect(() => {
    refresh();
    listUsers(token, "agent")
      .then((list) => {
        const map = {};
        list.forEach((u) => (map[u.id] = u.name));
        setAgentNames(map);
      })
      .catch(() => {});
  }, [token]);

  function refresh() {
    listExpenses(token)
      .then(setExpenses)
      .catch((err) => setError(err.message));
  }

  async function handleDecision(id, decision) {
    setActingOnId(id);
    setError(null);
    try {
      const updated = await reviewExpense(token, id, decision);
      setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err.message);
    } finally {
      setActingOnId(null);
    }
  }

  const visible = expenses ? (showAll ? expenses : expenses.filter((e) => e.status === "pending")) : null;
  const totalApproved = (expenses || []).filter((e) => e.status === "approved").reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Expenses</h1>
          <p className={styles.sub}>
            Submitted by your team — {totalApproved > 0 && `₹${totalApproved.toFixed(2)} approved so far.`}
          </p>
        </div>
        <button className={styles.addButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show pending only" : "Show all"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {visible === null && !error && <p className={styles.state}>Loading…</p>}
      {visible && visible.length === 0 && <p className={styles.state}>{showAll ? "No expenses yet." : "No pending expenses."}</p>}

      {visible && visible.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Bill</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id}>
                <td className={styles.nameCell}>{agentNames[e.agent_id] || "No data available"}</td>
                <td className={styles.muted}>{e.expense_date}</td>
                <td className={styles.muted} style={{ textTransform: "capitalize" }}>
                  {e.expense_type}
                </td>
                <td className={styles.muted}>₹{e.amount}</td>
                <td className={styles.muted}>
                  {e.bill_photo_url ? (
                    <a href={`${API_BASE_URL}${e.bill_photo_url}`} target="_blank" rel="noreferrer">
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span
                    style={{
                      fontSize: "0.76rem",
                      fontWeight: 500,
                      padding: "3px 10px",
                      borderRadius: 999,
                      textTransform: "capitalize",
                      ...(STATUS_BADGE[e.status] || {}),
                    }}
                  >
                    {e.status}
                  </span>
                </td>
                <td className={styles.editCell} style={{ width: "auto" }}>
                  {e.status === "pending" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className={styles.editButton} onClick={() => handleDecision(e.id, "approve")} disabled={actingOnId === e.id}>
                        {actingOnId === e.id ? "…" : "Approve"}
                      </button>
                      <button className={styles.editButton} onClick={() => handleDecision(e.id, "reject")} disabled={actingOnId === e.id}>
                        {actingOnId === e.id ? "…" : "Reject"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
