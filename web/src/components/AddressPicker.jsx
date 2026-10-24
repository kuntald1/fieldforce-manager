import { lazy, Suspense, useEffect, useState } from "react";
import styles from "./CustomerFormModal.module.css";
import { forwardGeocode, suggestAddresses } from "../utils/mapboxGeocode";

const LocationPickerMap = lazy(() => import("./LocationPickerMap"));

// One address field: autocomplete dropdown, blur-geocode fallback, and a
// collapsed-by-default drag-to-adjust pin map. The exact same UX and edge
// cases (wrong-country matches, building nicknames Mapbox doesn't know)
// apply everywhere an address is typed — Customer address, Task start,
// Task end — so this is the one place that logic lives.
export default function AddressPicker({
  label,
  initialText = "",
  initialLocation, // {lat, lng, label} if already known at mount (edit mode with stored coordinates)
  onResolve, // called with {lat, lng, label} | null whenever resolution changes
  required = false,
  placeholder = "Start typing an address…",
}) {
  const [text, setText] = useState(initialText);
  // undefined = not checked yet, null = checked and not found, object = found
  const [resolved, setResolved] = useState(initialLocation ?? undefined);
  const [checking, setChecking] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  useEffect(() => {
    onResolve(resolved || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  function handleChange(value) {
    setText(value);
    setResolved(undefined);
    setShowSuggestions(true);
  }

  useEffect(() => {
    if (!showSuggestions || resolved !== undefined) return;
    const timer = setTimeout(async () => {
      setSuggestions(await suggestAddresses(text));
    }, 300);
    return () => clearTimeout(timer);
  }, [text, showSuggestions, resolved]);

  function pick(s) {
    setText(s.label);
    setResolved({ lat: s.lat, lng: s.lng, label: s.label });
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function handleBlur() {
    setTimeout(() => setShowSuggestions(false), 150); // let a suggestion's onMouseDown fire first
    if (!text.trim() || resolved !== undefined) return;
    setChecking(true);
    setResolved(await forwardGeocode(text));
    setChecking(false);
  }

  const inputId = `addr-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className={styles.field} style={{ position: "relative" }}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={styles.input}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={handleBlur}
        autoComplete="off"
        required={required}
        placeholder={placeholder}
      />

      {showSuggestions && suggestions.length > 0 && (
        <ul className={styles.suggestions}>
          {suggestions.map((s, i) => (
            <li key={i} onMouseDown={() => pick(s)} className={styles.suggestionItem}>
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {checking && <p className={styles.hint}>Checking address…</p>}
      {!checking && resolved && <p className={styles.hintSuccess}>📍 {resolved.label}</p>}
      {!checking && text.trim() && resolved === null && (
        <p className={styles.hintWarning}>
          Couldn't find this address — check spelling or add more detail (area, city).
        </p>
      )}

      {resolved && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className={styles.mapToggle} onClick={() => setMapExpanded((v) => !v)}>
            {mapExpanded ? "▾ Hide map" : "▸ Not quite right? Adjust on map"}
          </button>
          {mapExpanded && (
            <div style={{ marginTop: 8 }}>
              <Suspense fallback={null}>
                <LocationPickerMap
                  lat={resolved.lat}
                  lng={resolved.lng}
                  onChange={(newLat, newLng) => {
                    // Deliberately NOT re-reverse-geocoding here — keep
                    // whatever name was typed/picked. Dragging only
                    // fine-tunes the exact point; it shouldn't silently
                    // replace a real name with Mapbox's nearest (possibly
                    // unrelated) street address guess.
                    setResolved((prev) => ({ ...prev, lat: newLat, lng: newLng }));
                  }}
                />
              </Suspense>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
