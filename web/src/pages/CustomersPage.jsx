import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css";
import CustomerFormModal from "../components/CustomerFormModal";
import { listCustomers } from "../api/client";

export default function CustomersPage({ token, canEdit }) {
  const [customers, setCustomers] = useState(null);
  const [error, setError] = useState(null);
  const [modalMode, setModalMode] = useState(null); // null | "add" | customer object (edit)

  useEffect(() => {
    listCustomers(token)
      .then(setCustomers)
      .catch((err) => setError(err.message));
  }, [token]);

  function handleSaved(saved) {
    setCustomers((prev) => {
      const exists = prev?.some((c) => c.id === saved.id);
      const next = exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...(prev || []), saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setModalMode(null);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Customers</h1>
          <p className={styles.sub}>Shops and outlets your team visits.</p>
        </div>
        {canEdit && (
          <button className={styles.addButton} onClick={() => setModalMode("add")}>
            Add customer
          </button>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {customers === null && !error && <p className={styles.state}>Loading customers…</p>}
      {customers && customers.length === 0 && (
        <p className={styles.state}>No customers yet. Add the first one to start planning routes.</p>
      )}

      {customers && customers.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Phone</th>
              <th>Check-in radius</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td className={styles.nameCell}>{c.name}</td>
                <td className={styles.muted}>{c.address}</td>
                <td className={styles.muted}>{c.contact_phone || "—"}</td>
                <td className={styles.muted}>{c.geofence_radius_m}m</td>
                {canEdit && (
                  <td className={styles.editCell}>
                    <button className={styles.editButton} onClick={() => setModalMode(c)}>
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalMode && (
        <CustomerFormModal
          token={token}
          customer={modalMode === "add" ? null : modalMode}
          onClose={() => setModalMode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
