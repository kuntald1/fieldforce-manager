import { useEffect, useState } from "react";
import styles from "./CustomerFormModal.module.css"; // field/input/checklist styles, shared
import layout from "./CreateTaskModal.module.css"; // this modal's own wider, two-column layout
import AddressPicker from "./AddressPicker";
import { listUsers, listCustomers, createCustomer, createRoute, updateRoute } from "../api/client";
import { reverseGeocodeLabel } from "../utils/mapboxGeocode";

const SAME_POINT_EPSILON = 0.0005; // ~50m — matches Live Tracking's "is this a roundtrip" check

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// task: null means "create" mode; passing an existing task means "edit" mode.
export default function CreateTaskModal({ token, task, onClose, onSaved }) {
  const isEdit = !!task;

  const [agents, setAgents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [agentId, setAgentId] = useState(task?.agent_id ?? "");
  const [routeDate, setRouteDate] = useState(task?.route_date || todayStr());
  const [startLocationName, setStartLocationName] = useState(task?.start_location_name || "");
  const [startLocation, setStartLocation] = useState(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(task?.waypoint_order || []);
  const [roundtrip, setRoundtrip] = useState(true);
  const [priority, setPriority] = useState(task?.priority || "medium");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState(isEdit ? "Save changes" : "Create task");

  // A stop can come from an existing customer (checklist, unchanged) OR be
  // typed fresh as a name + address right here. Each new one becomes a
  // real Customer row on submit (createCustomer — same path as the
  // Customers page), so it's reusable as a checklist item next time, not
  // a one-off that disappears after this task.
  const [newStopName, setNewStopName] = useState("");
  const [newStopLocation, setNewStopLocation] = useState(null);
  const [newStopKey, setNewStopKey] = useState(0); // forces AddressPicker to reset after each add
  const [pendingStops, setPendingStops] = useState([]); // [{tempId, name, location}]

  const [startPrefill, setStartPrefill] = useState(null);
  const [prefillingStart, setPrefillingStart] = useState(isEdit);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    listUsers(token, "agent").then(setAgents).catch(() => {});
    listCustomers(token).then(setCustomers).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!isEdit || !task.route_geometry?.coordinates?.length) {
      setPrefillingStart(false);
      return;
    }
    const coords = task.route_geometry.coordinates;
    const [startLon, startLat] = coords[0];
    const [endLon, endLat] = coords[coords.length - 1];
    const isLoop = Math.abs(startLon - endLon) < SAME_POINT_EPSILON && Math.abs(startLat - endLat) < SAME_POINT_EPSILON;
    setRoundtrip(isLoop);

    reverseGeocodeLabel(startLon, startLat).then((label) => {
      const text = label || `${startLat.toFixed(5)}, ${startLon.toFixed(5)}`;
      const loc = { lat: startLat, lng: startLon, label: text };
      setStartPrefill(loc);
      setStartLocation(loc);
      setPrefillingStart(false);
    });
  }, [isEdit, task]);

  // Shared by both "Use current location" and "Start from a customer" —
  // reuses the same AddressPicker-remount trick the edit-mode prefill
  // already relies on (key={startPrefill ? "prefilled" : "empty"}), so the
  // address field's text updates along with startLocation instead of the
  // two drifting out of sync.
  function applyStartLocation(loc) {
    setStartPrefill(loc);
    setStartLocation(loc);
  }

  function handleUseCurrentLocation() {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("Current location isn't available in this browser.");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const label = (await reverseGeocodeLabel(longitude, latitude)) || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        applyStartLocation({ lat: latitude, lng: longitude, label });
        setGettingLocation(false);
      },
      (err) => {
        setLocationError(err.message || "Couldn't get current location — check the browser's location permission.");
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // A single start point, so a dropdown (pick exactly one) rather than
  // checkboxes (which imply picking several) — same customer list already
  // loaded for the Stops checklist on the right.
  function handleStartFromCustomer(e) {
    const id = e.target.value;
    e.target.value = ""; // reset back to the placeholder once applied
    if (!id) return;
    const c = customers.find((cust) => String(cust.id) === id);
    if (!c || c.latitude == null || c.longitude == null) return;
    applyStartLocation({ lat: c.latitude, lng: c.longitude, label: c.name });
    if (!startLocationName.trim()) setStartLocationName(c.name);
  }

  function toggleCustomer(id) {
    setSelectedCustomerIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function handleAddNewStop() {
    if (!newStopName.trim() || !newStopLocation) return;
    setPendingStops((prev) => [...prev, { tempId: Date.now(), name: newStopName.trim(), location: newStopLocation }]);
    setNewStopName("");
    setNewStopLocation(null);
    setNewStopKey((k) => k + 1); // remounts the AddressPicker below, clearing its text too
  }

  function removePendingStop(tempId) {
    setPendingStops((prev) => prev.filter((s) => s.tempId !== tempId));
  }

  // The only sequence we actually know is the one from the LAST save
  // (task.waypoint_order) — OSRM always picks the shortest-distance
  // order automatically; nothing here lets a manager force a specific
  // order (e.g. for a client's fixed appointment time) yet. So this is
  // "here's the order it was last optimized to," not a live preview of
  // what it'll become after this edit — that's only known once saved.
  const sequenceMap = isEdit && task.waypoint_order ? Object.fromEntries(task.waypoint_order.map((id, i) => [id, i + 1])) : {};
  const sortedCustomers = [...customers].sort((a, b) => {
    const aSeq = sequenceMap[a.id] ?? Infinity;
    const bSeq = sequenceMap[b.id] ?? Infinity;
    return aSeq - bSeq;
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!agentId) return setError("Choose an employee.");
    if (!startLocation) return setError("Enter a valid start location.");
    if (selectedCustomerIds.length === 0 && pendingStops.length === 0) return setError("Choose or add at least one stop.");

    setLoading(true);
    try {
      let allCustomerIds = [...selectedCustomerIds];

      if (pendingStops.length > 0) {
        setLoadingLabel("Saving new stops…");
        for (const stop of pendingStops) {
          const created = await createCustomer(token, {
            name: stop.name,
            address: stop.location.label,
            latitude: stop.location.lat,
            longitude: stop.location.lng,
          });
          allCustomerIds.push(created.id);
        }
      }

      setLoadingLabel(isEdit ? "Re-optimizing route…" : "Optimizing route…");
      const payload = {
        agent_id: Number(agentId),
        route_date: routeDate,
        start_latitude: startLocation.lat,
        start_longitude: startLocation.lng,
        start_location_name: startLocationName.trim() || null,
        priority,
        customer_ids: allCustomerIds,
        roundtrip,
      };
      const saved = isEdit ? await updateRoute(token, task.id, payload) : await createRoute(token, payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingLabel(isEdit ? "Save changes" : "Create task");
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={layout.panel} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className={layout.header}>
          <h2 className={styles.heading}>{isEdit ? "Edit task" : "Create task"}</h2>
          <p className={styles.sub}>
            {isEdit
              ? "Only possible before the employee has checked in anywhere or sent a GPS ping for this date."
              : "Assign one or more stops to an employee for a specific date."}
          </p>
        </div>

        <div className={layout.body}>
          <div className={layout.grid}>
            {/* Left column: who/when/where it starts */}
            <div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="t-agent">
                    Employee
                  </label>
                  <select
                    id="t-agent"
                    className={styles.input}
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    required
                  >
                    <option value="">Select…</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="t-date">
                    Date
                  </label>
                  <input
                    id="t-date"
                    type="date"
                    className={styles.input}
                    value={routeDate}
                    onChange={(e) => setRouteDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="t-priority">
                  Priority
                </label>
                <select id="t-priority" className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="t-start-name">
                  Start location name
                </label>
                <input
                  id="t-start-name"
                  className={styles.input}
                  placeholder="e.g. Office, Mani Casadona HQ"
                  value={startLocationName}
                  onChange={(e) => setStartLocationName(e.target.value)}
                />
              </div>

              {prefillingStart ? (
                <p className={styles.hint}>Loading current start location…</p>
              ) : (
                <>
                  <div className={styles.field} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={styles.mapToggle}
                      style={{ border: "1px solid var(--surface-border)", borderRadius: 6, padding: "8px 14px" }}
                      onClick={handleUseCurrentLocation}
                      disabled={gettingLocation}
                    >
                      {gettingLocation ? "Getting location…" : "📍 Use current location"}
                    </button>
                    <select
                      className={styles.input}
                      style={{ maxWidth: 220 }}
                      defaultValue=""
                      onChange={handleStartFromCustomer}
                    >
                      <option value="">Or start from a customer…</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {locationError && <p className={styles.hintWarning}>{locationError}</p>}

                  <AddressPicker
                    key={startPrefill ? "prefilled" : "empty"}
                    label="Start location address"
                    initialText={startPrefill?.label || ""}
                    initialLocation={startPrefill || undefined}
                    onResolve={setStartLocation}
                    required
                    placeholder="e.g. Sector V Metro, Kolkata"
                  />
                </>
              )}

              <div className={styles.field}>
                <label className={styles.label}>
                  <input
                    type="checkbox"
                    checked={roundtrip}
                    onChange={(e) => setRoundtrip(e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Return to start location at the end
                </label>
              </div>
            </div>

            {/* Right column: where it goes */}
            <div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Stops ({selectedCustomerIds.length + pendingStops.length} selected)
                </label>
                {isEdit && (
                  <p className={styles.hint}>
                    Numbers show the order from the last save — OSRM always picks the shortest path automatically;
                    there's no way yet to force a specific order (e.g. for a client's fixed appointment time).
                  </p>
                )}
                <div className={styles.checklist}>
                  {customers.length === 0 && pendingStops.length === 0 && (
                    <p className={styles.state}>No customers yet — add a stop below.</p>
                  )}
                  {sortedCustomers.map((c) => (
                    <label key={c.id} className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.includes(c.id)}
                        onChange={() => toggleCustomer(c.id)}
                      />
                      {selectedCustomerIds.includes(c.id) && sequenceMap[c.id] && (
                        <span className={layout.seqBadge}>{sequenceMap[c.id]}</span>
                      )}
                      {c.name}
                    </label>
                  ))}
                  {pendingStops.map((s) => (
                    <div key={s.tempId} className={styles.checkRow} style={{ justifyContent: "space-between" }}>
                      <span>
                        <strong>{s.name}</strong> — {s.location.label}
                      </span>
                      <button type="button" className={styles.mapToggle} onClick={() => removePendingStop(s.tempId)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className={styles.field}
                style={{ border: "1px dashed var(--surface-border)", borderRadius: 8, padding: 14 }}
              >
                <label className={styles.label}>Add a stop by address</label>
                <input
                  className={styles.input}
                  placeholder="Stop name (e.g. Ghosh Store)"
                  value={newStopName}
                  onChange={(e) => setNewStopName(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                <AddressPicker key={newStopKey} label="Address" onResolve={setNewStopLocation} placeholder="Street, area, city" />
                <button
                  type="button"
                  className={styles.cancel}
                  style={{ border: "1px solid var(--surface-border)", borderRadius: 6, padding: "8px 16px" }}
                  onClick={handleAddNewStop}
                  disabled={!newStopName.trim() || !newStopLocation}
                >
                  + Add this stop
                </button>
                <p className={styles.hint}>This also creates a reusable customer entry on the Customers page.</p>
              </div>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={layout.footer}>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className={styles.submit} disabled={loading || prefillingStart}>
            {loading ? loadingLabel : isEdit ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
