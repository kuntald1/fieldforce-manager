import { useState } from "react";
import styles from "./CustomerFormModal.module.css"; // same overlay/panel/field look as the customer modal
import { createUser, updateUser, uploadEmployeePhoto, API_BASE_URL } from "../api/client";

const ROLES = ["admin", "manager", "agent"];

export default function EmployeeFormModal({ token, employee, onClose, onSaved }) {
  const isEdit = !!employee;

  const [name, setName] = useState(employee?.name || "");
  const [email, setEmail] = useState(employee?.email || "");
  const [phone, setPhone] = useState(employee?.phone || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(employee?.role || "agent");
  const [joiningDate, setJoiningDate] = useState(employee?.joining_date || "");
  const [isActive, setIsActive] = useState(employee?.is_active ?? true);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(employee?.photo_url ? `${API_BASE_URL}${employee.photo_url}` : null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file)); // local preview — replaced by the real uploaded URL after save
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let saved;
      if (isEdit) {
        saved = await updateUser(token, employee.id, {
          name,
          phone: phone || null,
          role,
          joining_date: joiningDate || null,
          is_active: isActive,
        });
      } else {
        saved = await createUser(token, {
          name,
          email,
          phone: phone || null,
          password,
          role,
          joining_date: joiningDate,
        });
      }

      // Separate step — the create/update call above is JSON, this one's
      // multipart, same reasoning as visit check-in photos being their
      // own endpoint rather than mixed into the JSON body.
      if (photoFile) {
        saved = await uploadEmployeePhoto(token, saved.id, photoFile);
      }

      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.heading}>{isEdit ? "Edit employee" : "Add employee"}</h2>
        <p className={styles.sub}>
          {isEdit ? "Update role, joining date, or active status." : "Creates a login for this person right away."}
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="e-name">
              Name
            </label>
            <input id="e-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="e-photo">
              Photo (optional)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt=""
                  style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--surface-border)" }}
                />
              )}
              <input id="e-photo" type="file" accept="image/jpeg,image/png" onChange={handlePhotoChange} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="e-email">
              Email
            </label>
            <input
              id="e-email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isEdit}
            />
          </div>

          {!isEdit && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="e-password">
                Password
              </label>
              <input
                id="e-password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="e-phone">
                Phone (optional)
              </label>
              <input id="e-phone" className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="e-role">
                Role
              </label>
              <select id="e-role" className={styles.input} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="e-joining">
              Joining date
            </label>
            <input
              id="e-joining"
              type="date"
              className={styles.input}
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
              required={!isEdit}
            />
          </div>

          {isEdit && (
            <div className={styles.field}>
              <label className={styles.label}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ marginRight: 8 }} />
                Active
              </label>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
