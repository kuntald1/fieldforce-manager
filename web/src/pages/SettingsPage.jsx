import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css";
import { getOrganization, updateOrganization } from "../api/client";

export default function SettingsPage({ token }) {
  const [org, setOrg] = useState(null);
  const [kmRate, setKmRate] = useState("");
  const [deviationThreshold, setDeviationThreshold] = useState("");
  const [geofenceRadius, setGeofenceRadius] = useState("");
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null); // which field name just saved, for a brief confirmation
  const [savingField, setSavingField] = useState(null);

  useEffect(() => {
    getOrganization(token)
      .then((o) => {
        setOrg(o);
        setKmRate(String(o.km_rate));
        setDeviationThreshold(String(o.deviation_threshold_m));
        setGeofenceRadius(String(o.default_geofence_radius_m));
      })
      .catch((err) => setError(err.message));
  }, [token]);

  async function handleSave(field, value, parser = Number) {
    setSavingField(field);
    setError(null);
    setSaved(null);
    try {
      const updated = await updateOrganization(token, { [field]: parser(value) });
      setOrg(updated);
      setSaved(field);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Settings</h1>
          <p className={styles.sub}>Org-wide defaults — these used to be hardcoded, now admin-editable.</p>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!org && !error && <p className={styles.state}>Loading…</p>}

      {org && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 480 }}>
          <SettingRow
            label="Travel Allowance rate"
            help="Currency per km, used when a TA request is approved."
            value={kmRate}
            onChange={setKmRate}
            onSave={() => handleSave("km_rate", kmRate, Number)}
            saving={savingField === "km_rate"}
            justSaved={saved === "km_rate"}
            suffix="₹/km"
            step="0.5"
          />

          <SettingRow
            label="Deviation alert threshold"
            help="How far off the planned route (in meters) before a deviation alert fires."
            value={deviationThreshold}
            onChange={setDeviationThreshold}
            onSave={() => handleSave("deviation_threshold_m", deviationThreshold, (v) => parseInt(v, 10))}
            saving={savingField === "deviation_threshold_m"}
            justSaved={saved === "deviation_threshold_m"}
            suffix="meters"
            step="10"
          />

          <SettingRow
            label="Default check-in radius"
            help="Used for a new customer when its own radius isn't set explicitly."
            value={geofenceRadius}
            onChange={setGeofenceRadius}
            onSave={() => handleSave("default_geofence_radius_m", geofenceRadius, (v) => parseInt(v, 10))}
            saving={savingField === "default_geofence_radius_m"}
            justSaved={saved === "default_geofence_radius_m"}
            suffix="meters"
            step="10"
          />
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, help, value, onChange, onSave, saving, justSaved, suffix, step }) {
  return (
    <div style={{ border: "1px solid var(--surface-border)", borderRadius: 8, padding: 16 }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <p className={styles.sub} style={{ fontSize: "0.82rem", margin: "0 0 10px" }}>
        {help}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 110, padding: "6px 10px", border: "1px solid var(--surface-border)", borderRadius: 6 }}
        />
        <span className={styles.muted} style={{ fontSize: "0.85rem" }}>
          {suffix}
        </span>
        <button className={styles.editButton} onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {justSaved && <span style={{ color: "var(--emerald-deep)", fontSize: "0.82rem" }}>Saved</span>}
      </div>
    </div>
  );
}
