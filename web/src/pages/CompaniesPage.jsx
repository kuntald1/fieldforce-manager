import { useEffect, useState } from "react";
import styles from "./ReportsPage.module.css"; // shared ledger-style table, filter strip and badges
import { listCompanies, createCompany, updateCompany, listCompanyUsers, createCompanyAdmin } from "../api/client";

/**
 * Tenant administration — the only screen that looks across companies
 * rather than inside one. Everything else in the app is scoped to the
 * company the signed-in token belongs to.
 *
 * Switching INTO a company (to see its tasks, tracking and allowances)
 * is done from the top bar, not here: that changes what the whole app is
 * showing, so it belongs next to who-you-are, not inside one screen.
 */
export default function CompaniesPage({ token, onCompanySwitched }) {
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [usersByCompany, setUsersByCompany] = useState({});
  const [addingAdminFor, setAddingAdminFor] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [savingSettingsFor, setSavingSettingsFor] = useState(null);
  const [settingsError, setSettingsError] = useState(null);

  useEffect(() => {
    refresh();
  }, [token]);

  function refresh() {
    listCompanies(token)
      .then(setCompanies)
      .catch((err) => setError(err.message));
  }

  function toggleExpand(company) {
    if (expandedId === company.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(company.id);
    if (!usersByCompany[company.id]) {
      listCompanyUsers(token, company.id)
        .then((users) => setUsersByCompany((prev) => ({ ...prev, [company.id]: users })))
        .catch((err) => setError(err.message));
    }
  }

  async function handleSaveSettings(company, values) {
    setSavingSettingsFor(company.id);
    setSettingsError(null);
    try {
      const updated = await updateCompany(token, company.id, values);
      setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, ...updated } : c)));
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setSavingSettingsFor(null);
    }
  }

  async function handleToggleActive(company) {
    setBusyId(company.id);
    setError(null);
    try {
      const updated = await updateCompany(token, company.id, { is_active: !company.is_active });
      setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = companies ? companies.filter((c) => c.is_active).length : 0;
  const agentTotal = companies ? companies.reduce((s, c) => s + c.agent_count, 0) : 0;

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Companies</h1>
          <p className={styles.sub}>
            Each company is a separate world: its people, customers, tasks and allowances are visible only inside it.
          </p>
        </div>
        <button className={styles.exportButton} onClick={() => setShowAdd(true)}>
          Add company
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {companies === null && !error && <p className={styles.state}>Loading…</p>}
      {companies && companies.length === 0 && (
        <p className={styles.state}>No companies yet. Add the first one to get started.</p>
      )}

      {companies && companies.length > 0 && (
        <>
          <div className={styles.summary}>
            <div className={styles.figure}>
              <span className={styles.figureValue}>{companies.length}</span>
              <span className={styles.figureLabel}>Companies</span>
            </div>
            <div className={styles.figure}>
              <span className={styles.figureValue}>{activeCount}</span>
              <span className={styles.figureLabel}>Active</span>
            </div>
            <div className={styles.figure}>
              <span className={styles.figureValue}>{agentTotal}</span>
              <span className={styles.figureLabel}>Field agents in all</span>
            </div>
          </div>
          <p className={styles.summaryNote}>Select a row to see its logins.</p>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Plan</th>
                  <th className={styles.numeric}>Logins</th>
                  <th className={styles.numeric}>Agents</th>
                  <th className={styles.numeric}>TA rate</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <RowGroup
                    key={c.id}
                    company={c}
                    expanded={expandedId === c.id}
                    users={usersByCompany[c.id]}
                    busy={busyId === c.id}
                    onToggleExpand={() => toggleExpand(c)}
                    onToggleActive={() => handleToggleActive(c)}
                    onAddAdmin={() => setAddingAdminFor(c)}
                    onSaveSettings={(values) => handleSaveSettings(c, values)}
                    savingSettings={savingSettingsFor === c.id}
                    settingsError={savingSettingsFor === null ? settingsError : null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showAdd && (
        <AddCompanyModal
          token={token}
          onClose={() => setShowAdd(false)}
          onCreated={(company) => {
            setCompanies((prev) => [...(prev || []), company].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAdd(false);
          }}
        />
      )}

      {addingAdminFor && (
        <AddAdminModal
          token={token}
          company={addingAdminFor}
          onClose={() => setAddingAdminFor(null)}
          onCreated={(user) => {
            setUsersByCompany((prev) => ({
              ...prev,
              [addingAdminFor.id]: [...(prev[addingAdminFor.id] || []), user],
            }));
            setAddingAdminFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RowGroup({
  company,
  expanded,
  users,
  busy,
  onToggleExpand,
  onToggleActive,
  onAddAdmin,
  onSaveSettings,
  savingSettings,
  settingsError,
}) {
  return (
    <>
      <tr>
        <td className={styles.nameCell}>
          <button
            type="button"
            onClick={onToggleExpand}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              color: "var(--emerald-deep)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {company.name}
          </button>
        </td>
        <td>{company.subscription_plan || "—"}</td>
        <td className={styles.numeric}>{company.user_count}</td>
        <td className={styles.numeric}>{company.agent_count}</td>
        <td className={styles.numeric}>₹{company.km_rate}/km</td>
        <td>
          <span className={`${styles.badge} ${company.is_active ? styles.badgeGood : styles.badgeNeutral}`}>
            {company.is_active ? "Active" : "Suspended"}
          </span>
        </td>
        <td className={styles.nowrap} style={{ textAlign: "right" }}>
          <button type="button" onClick={onToggleActive} disabled={busy} className={styles.exportButton} style={smallButton}>
            {busy ? "…" : company.is_active ? "Suspend" : "Reactivate"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: "var(--surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 500, color: "var(--ink)" }}>Logins</span>
              <button type="button" className={styles.exportButton} style={smallButton} onClick={onAddAdmin}>
                Add admin login
              </button>
            </div>
            {!users && <span>Loading…</span>}
            {users && users.length === 0 && (
              <span>
                No logins yet — add an admin so someone can get in. Managers and agents are then added by that admin.
              </span>
            )}
            {users && users.length > 0 && (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {users.map((u) => (
                  <li key={u.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--ink)", minWidth: 160 }}>{u.name}</span>
                    <span style={{ minWidth: 220 }}>{u.email}</span>
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>{u.role}</span>
                    {!u.is_active && <span className={`${styles.badge} ${styles.badgeBad}`}>Deactivated</span>}
                  </li>
                ))}
              </ul>
            )}

            <MediaSettings
              company={company}
              saving={savingSettings}
              error={settingsError}
              onSave={onSaveSettings}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * What this company's agents may attach to a visit, and how long it is
 * kept.
 *
 * Here rather than on the company's own Settings screen because storage
 * is the platform's cost, not the client's: left to themselves every
 * client would choose ten photos and keep them forever, and the bill for
 * that arrives at Vorpet. A voice note is roughly ten thousand GPS
 * pings, so these four numbers decide when a server fills up.
 */
function MediaSettings({ company, saving, error, onSave }) {
  const [form, setForm] = useState({
    max_visit_photos: company.max_visit_photos,
    max_audio_seconds: company.max_audio_seconds,
    media_retention: company.media_retention,
    photo_retention_months: company.photo_retention_months ?? 6,
    audio_retention_months: company.audio_retention_months ?? 3,
  });

  const automatic = form.media_retention === "automatic";
  const dirty =
    form.max_visit_photos !== company.max_visit_photos ||
    form.max_audio_seconds !== company.max_audio_seconds ||
    form.media_retention !== company.media_retention ||
    (automatic &&
      (form.photo_retention_months !== company.photo_retention_months ||
        form.audio_retention_months !== company.audio_retention_months));

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div style={{ marginTop: 22, borderTop: "1px solid var(--surface-border)", paddingTop: 16 }}>
      <div style={{ fontWeight: 500, color: "var(--ink)", marginBottom: 2 }}>Photos and voice notes</div>
      <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: "var(--muted)" }}>
        What agents in this company may attach to a stop, and how long it is kept.
      </p>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", marginBottom: 4 }}>
            Photos per stop
          </span>
          <input
            type="number"
            min="0"
            max="10"
            value={form.max_visit_photos}
            onChange={(e) => set("max_visit_photos", Number(e.target.value))}
            style={{ ...input, width: 90 }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", marginBottom: 4 }}>
            Voice note, seconds
          </span>
          <input
            type="number"
            min="0"
            max="600"
            step="30"
            value={form.max_audio_seconds}
            onChange={(e) => set("max_audio_seconds", Number(e.target.value))}
            style={{ ...input, width: 110 }}
          />
        </label>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", paddingBottom: 9 }}>
          0 switches either of them off for this company.
        </span>
      </div>

      <div style={{ marginTop: 18 }}>
        <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", marginBottom: 6 }}>
          Deleting old files
        </span>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          {[
            ["never", "Never delete"],
            ["automatic", "Delete automatically"],
          ].map(([value, label]) => (
            <label key={value} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", cursor: "pointer" }}>
              <input
                type="radio"
                name={`retention-${company.id}`}
                value={value}
                checked={form.media_retention === value}
                onChange={() => set("media_retention", value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {automatic && (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", marginBottom: 4 }}>
              Delete photos after
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <input
                type="number"
                min="1"
                max="120"
                value={form.photo_retention_months}
                onChange={(e) => set("photo_retention_months", Number(e.target.value))}
                style={{ ...input, width: 80 }}
              />
              <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>months</span>
            </span>
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", marginBottom: 4 }}>
              Delete voice notes after
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <input
                type="number"
                min="1"
                max="120"
                value={form.audio_retention_months}
                onChange={(e) => set("audio_retention_months", Number(e.target.value))}
                style={{ ...input, width: 80 }}
              />
              <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>months</span>
            </span>
          </label>
        </div>
      )}

      {automatic && (
        <p style={{ margin: "12px 0 0", fontSize: "0.8rem", color: "var(--muted)", maxWidth: 620 }}>
          Counted from the day each file was uploaded, and fixed then — changing these numbers later does not move the
          date on anything already stored. The visit still shows that a photo or recording was there.
        </p>
      )}

      {error && <p style={{ color: "var(--error)", fontSize: "0.85rem", marginTop: 12 }}>{error}</p>}

      <button
        type="button"
        className={styles.exportButton}
        style={{ ...smallButton, marginTop: 16 }}
        disabled={!dirty || saving}
        onClick={() =>
          onSave(
            automatic
              ? form
              : {
                  max_visit_photos: form.max_visit_photos,
                  max_audio_seconds: form.max_audio_seconds,
                  media_retention: "never",
                }
          )
        }
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

const smallButton = { padding: "6px 12px", fontSize: "0.82rem" };

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(21, 41, 26, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 60,
};
const panel = {
  background: "var(--surface)",
  borderRadius: 10,
  padding: 28,
  width: "100%",
  maxWidth: 440,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};
const input = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--surface-border)",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: "0.92rem",
  background: "#fff",
};

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: "0.82rem", color: "var(--muted)", marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: "0.76rem", color: "var(--muted)", marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

function AddCompanyModal({ token, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    subscription_plan: "",
    km_rate: "10",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    admin_phone: "",
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createCompany(token, {
        name: form.name.trim(),
        subscription_plan: form.subscription_plan.trim() || null,
        km_rate: Number(form.km_rate),
        admin_name: form.admin_name.trim(),
        admin_email: form.admin_email.trim().toLowerCase(),
        admin_password: form.admin_password,
        admin_phone: form.admin_phone.trim() || null,
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.heading} style={{ fontSize: "1.4rem", marginBottom: 4 }}>
          Add company
        </h2>
        <p className={styles.sub} style={{ marginBottom: 20 }}>
          The company and its first admin are created together — a company with no login can't be used.
        </p>

        <form onSubmit={handleSubmit}>
          <Field label="Company name">
            <input style={input} value={form.name} onChange={set("name")} required minLength={2} />
          </Field>
          <Field label="Plan" hint="Your own label for this client's package. Optional.">
            <input style={input} value={form.subscription_plan} onChange={set("subscription_plan")} />
          </Field>
          <Field label="Travel allowance rate" hint="Rupees per km. The company's admin can change this later in Settings.">
            <input style={input} type="number" min="0" step="0.5" value={form.km_rate} onChange={set("km_rate")} required />
          </Field>

          <div style={{ borderTop: "1px solid var(--surface-border)", margin: "22px 0 18px" }} />

          <Field label="Admin name">
            <input style={input} value={form.admin_name} onChange={set("admin_name")} required minLength={2} />
          </Field>
          <Field label="Admin email" hint="This is what they sign in with, so it has to be unused across every company.">
            <input style={input} type="email" value={form.admin_email} onChange={set("admin_email")} required />
          </Field>
          <Field label="Admin phone">
            <input style={input} value={form.admin_phone} onChange={set("admin_phone")} />
          </Field>
          <Field label="Temporary password" hint="At least 6 characters. Pass it on and have them change it.">
            <input style={input} type="text" value={form.admin_password} onChange={set("admin_password")} required minLength={6} />
          </Field>

          {error && <p className={styles.error}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{ ...input, width: "auto", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="submit" className={styles.exportButton} disabled={saving}>
              {saving ? "Creating…" : "Create company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddAdminModal({ token, company, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createCompanyAdmin(token, company.id, {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || null,
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.heading} style={{ fontSize: "1.4rem", marginBottom: 4 }}>
          Add admin login
        </h2>
        <p className={styles.sub} style={{ marginBottom: 20 }}>
          For {company.name}. Managers and agents are added by this company's own admin, from Employees.
        </p>

        <form onSubmit={handleSubmit}>
          <Field label="Name">
            <input style={input} value={form.name} onChange={set("name")} required minLength={2} />
          </Field>
          <Field label="Email">
            <input style={input} type="email" value={form.email} onChange={set("email")} required />
          </Field>
          <Field label="Phone">
            <input style={input} value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Temporary password" hint="At least 6 characters.">
            <input style={input} type="text" value={form.password} onChange={set("password")} required minLength={6} />
          </Field>

          {error && <p className={styles.error}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{ ...input, width: "auto", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="submit" className={styles.exportButton} disabled={saving}>
              {saving ? "Creating…" : "Create login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
