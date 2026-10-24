import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css"; // same table/page look as Customers — no need to redefine it
import EmployeeFormModal from "../components/EmployeeFormModal";
import { listUsers, API_BASE_URL } from "../api/client";

export default function EmployeesPage({ token }) {
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState(null);
  const [modalMode, setModalMode] = useState(null); // null | "add" | employee object (edit)

  useEffect(() => {
    listUsers(token)
      .then(setEmployees)
      .catch((err) => setError(err.message));
  }, [token]);

  function handleSaved(saved) {
    setEmployees((prev) => {
      const exists = prev?.some((e) => e.id === saved.id);
      const next = exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...(prev || []), saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setModalMode(null);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Employees</h1>
          <p className={styles.sub}>Everyone with a login — admins, managers, and field agents.</p>
        </div>
        <button className={styles.addButton} onClick={() => setModalMode("add")}>
          Add employee
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {employees === null && !error && <p className={styles.state}>Loading employees…</p>}
      {employees && employees.length === 0 && <p className={styles.state}>No employees yet.</p>}

      {employees && employees.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joining date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td style={{ width: 1 }}>
                  {e.photo_url ? (
                    <img
                      src={`${API_BASE_URL}${e.photo_url}`}
                      alt=""
                      style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--surface)",
                        border: "1px solid var(--surface-border)",
                      }}
                    />
                  )}
                </td>
                <td className={styles.nameCell}>{e.name}</td>
                <td className={styles.muted}>{e.email}</td>
                <td className={styles.muted} style={{ textTransform: "capitalize" }}>
                  {e.role}
                </td>
                <td className={styles.muted}>{e.joining_date || "—"}</td>
                <td className={styles.muted}>{e.is_active ? "Active" : "Inactive"}</td>
                <td className={styles.editCell}>
                  <button className={styles.editButton} onClick={() => setModalMode(e)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalMode && (
        <EmployeeFormModal
          token={token}
          employee={modalMode === "add" ? null : modalMode}
          onClose={() => setModalMode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
