import { useState } from "react";
import styles from "./CustomerFormModal.module.css";
import { createExpense, uploadExpensePhoto } from "../api/client";

const EXPENSE_TYPES = ["travel", "food", "other"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseFormModal({ token, onClose, onSaved }) {
  const [expenseType, setExpenseType] = useState("travel");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Submit");

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setLoadingLabel("Submitting…");
      let saved = await createExpense(token, {
        expense_type: expenseType,
        amount: Number(amount),
        expense_date: expenseDate,
        description: description.trim() || null,
      });

      if (photoFile) {
        setLoadingLabel("Uploading bill photo…");
        saved = await uploadExpensePhoto(token, saved.id, photoFile);
      }

      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingLabel("Submit");
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.heading}>Add expense</h2>
        <p className={styles.sub}>Submit for approval — your manager will review it.</p>

        <form onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ex-type">
                Type
              </label>
              <select id="ex-type" className={styles.input} value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>
                {EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="ex-amount">
                Amount (₹)
              </label>
              <input
                id="ex-amount"
                type="number"
                min="0.01"
                step="0.01"
                className={styles.input}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ex-date">
              Date
            </label>
            <input
              id="ex-date"
              type="date"
              className={styles.input}
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ex-desc">
              Description (optional)
            </label>
            <input
              id="ex-desc"
              className={styles.input}
              placeholder="e.g. Auto fare to Esplanade"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ex-photo">
              Bill photo (optional)
            </label>
            <input id="ex-photo" type="file" accept="image/jpeg,image/png" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? loadingLabel : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
