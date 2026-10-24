import { useEffect, useState } from "react";
import styles from "./CustomersPage.module.css";
import { listAttendance, listUsers } from "../api/client";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDuration(loginIso, logoutIso) {
  const end = logoutIso ? new Date(logoutIso) : new Date();
  const ms = end - new Date(loginIso);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export default function AttendancePage({ token }) {
  const [date, setDate] = useState(todayStr());
  const [records, setRecords] = useState(null);
  const [agentNames, setAgentNames] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    listUsers(token, "agent")
      .then((list) => {
        const map = {};
        list.forEach((u) => (map[u.id] = u.name));
        setAgentNames(map);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    listAttendance(token, { date })
      .then(setRecords)
      .catch((err) => setError(err.message));
  }, [token, date]);

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Attendance</h1>
          <p className={styles.sub}>Who logged in/out, and when — self-reported by each agent.</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid var(--surface-border)", borderRadius: 8 }}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {records === null && !error && <p className={styles.state}>Loading…</p>}
      {records && records.length === 0 && <p className={styles.state}>No attendance records for this date.</p>}

      {records && records.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Login</th>
              <th>Logout</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td className={styles.nameCell}>{agentNames[r.agent_id] || "No data available"}</td>
                <td className={styles.muted}>{new Date(r.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                <td className={styles.muted}>
                  {r.logout_time ? new Date(r.logout_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
                <td className={styles.muted}>{formatDuration(r.login_time, r.logout_time)}</td>
                <td>
                  <span
                    style={{
                      fontSize: "0.76rem",
                      fontWeight: 500,
                      padding: "3px 10px",
                      borderRadius: 999,
                      textTransform: "capitalize",
                      background: r.status === "on_duty" ? "#e3f1e4" : "#eef0ea",
                      color: r.status === "on_duty" ? "var(--emerald-deep)" : "var(--muted)",
                    }}
                  >
                    {r.status === "on_duty" ? "On duty" : "Off duty"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
