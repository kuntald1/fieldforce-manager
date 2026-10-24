import { useState } from "react";
import styles from "./AddCustomerModal.module.css";
import { createCustomer } from "../api/client";

export default function AddCustomerModal({ token, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const customer = await createCustomer(token, {
        name,
        address,
        contact_phone: phone || null,
      });
      onCreated(customer);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.heading}>Add customer</h2>
        <p className={styles.sub}>We'll look up the address to pin its location for visits.</p>

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

          <div className={styles.field}>
            <label className={styles.label} htmlFor="c-address">
              Address
            </label>
            <input
              id="c-address"
              className={styles.input}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              placeholder="Street, area, city"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="c-phone">
              Phone (optional)
            </label>
            <input id="c-phone" className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? "Looking up address…" : "Add customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
