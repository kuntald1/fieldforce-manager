import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css";
import ExpenseFormModal from "../components/ExpenseFormModal";
import { listExpenses, API_BASE_URL } from "../api/client";

const STATUS_BADGE = {
  pending: { background: "#faf1de", color: "#a06b1f" },
  approved: { background: "#e3f1e4", color: "var(--emerald-deep)" },
  rejected: { background: "#f6e2de", color: "var(--error)" },
};

export default function EmployeeExpensesPage({ token }) {
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    refresh();
  }, [token]);

  function refresh() {
    listExpenses(token)
      .then(setExpenses)
      .catch((err) => setError(err.message));
  }

  function handleSaved(saved) {
    setExpenses((prev) => [saved, ...(prev || [])]);
    setAdding(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>My Expenses</h1>
          <p className={styles.sub}>Travel, food, and other expenses you've submitted.</p>
        </div>
        <button className={styles.addButton} onClick={() => setAdding(true)}>
          Add expense
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {expenses === null && !error && <p className={styles.state}>Loading…</p>}
      {expenses && expenses.length === 0 && <p className={styles.state}>No expenses submitted yet.</p>}

      {expenses && expenses.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Description</th>
              <th>Bill</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td className={styles.nameCell}>{e.expense_date}</td>
                <td className={styles.muted} style={{ textTransform: "capitalize" }}>
                  {e.expense_type}
                </td>
                <td className={styles.muted}>₹{e.amount}</td>
                <td className={styles.muted}>{e.description || "—"}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && <ExpenseFormModal token={token} onClose={() => setAdding(false)} onSaved={handleSaved} />}
    </div>
  );
}
