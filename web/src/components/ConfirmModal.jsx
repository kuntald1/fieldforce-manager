import styles from "./CustomerFormModal.module.css"; // same overlay/panel look as every other modal in the app

// A small reusable "are you sure?" dialog, styled like the rest of the
// app's modals — replaces the browser's plain window.confirm() popup for
// destructive actions (e.g. deleting a task).
export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.panel} style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.heading} style={{ fontSize: "1.25rem" }}>
          {title}
        </h2>
        {message && <p className={styles.sub}>{message}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.submit}
            style={danger ? { background: "var(--error)" } : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
