import { useEffect, useState } from "react";
import styles from "./AttendanceToggle.module.css";
import { getCurrentAttendance, attendanceLogin, attendanceLogout } from "../api/client";

// Agent-only — shown in the topbar on every page so duty status is
// always visible and changeable without navigating anywhere.
export default function AttendanceToggle({ token }) {
  const [current, setCurrent] = useState(undefined); // undefined = loading, null = off duty, object = on duty
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getCurrentAttendance(token)
      .then(setCurrent)
      .catch(() => setCurrent(null));
  }, [token]);

  async function handleToggle() {
    setBusy(true);
    setError(null);
    try {
      if (current) {
        await attendanceLogout(token);
        setCurrent(null);
      } else {
        const session = await attendanceLogin(token);
        setCurrent(session);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (current === undefined) return null; // avoid a flash before the initial check resolves

  return (
    <div className={styles.wrap}>
      {error && <span className={styles.error}>{error}</span>}
      <span className={`${styles.dot} ${current ? styles.dotOn : styles.dotOff}`} />
      <span className={styles.label}>{current ? "On duty" : "Off duty"}</span>
      <button className={styles.button} onClick={handleToggle} disabled={busy}>
        {busy ? "…" : current ? "Log out" : "Log in"}
      </button>
    </div>
  );
}
