import { useState } from "react";
import styles from "./CustomerFormModal.module.css";
import AddressPicker from "./AddressPicker";
import { createCustomer, updateCustomer } from "../api/client";

// customer: null means "add" mode; passing an existing customer means "edit" mode.
export default function CustomerFormModal({ token, customer, onClose, onSaved }) {
  const isEdit = !!customer;

  const [name, setName] = useState(customer?.name || "");
  const [location, setLocation] = useState(
    isEdit ? { lat: customer.latitude, lng: customer.longitude, label: customer.address } : null
  );
  const [phone, setPhone] = useState(customer?.contact_phone || "");
  const [radius, setRadius] = useState(customer?.geofence_radius_m ?? 100);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!location) {
      setError("Enter a valid address — pick a suggestion or wait for it to resolve.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name,
        address: location.label,
        contact_phone: phone || null,
        geofence_radius_m: Number(radius),
        latitude: location.lat,
        longitude: location.lng,
      };
      const saved = isEdit ? await updateCustomer(token, customer.id, payload) : await createCustomer(token, payload);
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
        <h2 className={styles.heading}>{isEdit ? "Edit customer" : "Add customer"}</h2>
        <p className={styles.sub}>
          {isEdit
            ? "Changing the address looks up its location again — adjust the pin after if it's not quite right."
            : "We'll look up the address to pin its location for visits — you can fine-tune the pin after."}
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="c-name">
              Name
            </label>
            <input
              id="c-name"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <AddressPicker
            label="Address"
            initialText={customer?.address || ""}
            initialLocation={isEdit ? { lat: customer.latitude, lng: customer.longitude, label: customer.address } : undefined}
            onResolve={setLocation}
            required
            placeholder="Street, area, city"
          />

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="c-phone">
                Phone (optional)
              </label>
              <input id="c-phone" className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="c-radius">
                Check-in radius (m)
              </label>
              <input
                id="c-radius"
                type="number"
                min="10"
                step="10"
                className={styles.input}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? "Saving…" : isEdit ? "Save changes" : "Add customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
