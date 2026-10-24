import { useState } from "react";
import styles from "./CustomerFormModal.module.css";
import { requestTaskApproval } from "../api/client";

export default function RequestApprovalModal({ token, routeId, onClose, onSent }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const saved = await requestTaskApproval(token, routeId, reason);
      onSent(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.heading}>Request approval</h2>
        <p className={styles.sub}>Explain why this task wasn't fully completed — your manager will review it.</p>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ra-reason">
              Reason
            </label>
            <textarea
              id="ra-reason"
              className={styles.input}
              style={{ minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
              placeholder="e.g. Shop was closed, client rescheduled, traffic delay…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={loading || !reason.trim()}>
              {loading ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
