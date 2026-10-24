import { useEffect, useState } from "react";
import styles from "./ReportsPage.module.css";
import CustomerHistory from "../components/CustomerHistory";
import { listScheduledMeetings, listCustomers, listUsers } from "../api/client";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The customer's side of the record, which the rest of the app does not
 * have a place for. Everywhere else is organised around the agent and
 * the task; this screen asks what has been promised to a customer and
 * what has already happened there.
 *
 * Both halves on one screen on purpose: the question "when are we going
 * back to them" and the question "what happened last time" are asked in
 * the same breath, and splitting them across two pages would mean
 * picking the same customer twice.
 */
export default function ScheduledMeetingsPage({ token }) {
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(daysFromNow(30));
  const [customerId, setCustomerId] = useState("");
  const [agentId, setAgentId] = useState("");

  const [meetings, setMeetings] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [agentNames, setAgentNames] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    listCustomers(token).then(setCustomers).catch(() => {});
    listUsers(token, "agent")
      .then((list) => {
        const map = {};
        list.forEach((u) => (map[u.id] = u.name));
        setAgentNames(map);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    setMeetings(null);
    setError(null);
    listScheduledMeetings(token, {
      startDate,
      endDate,
      customerId: customerId || undefined,
      agentId: agentId || undefined,
    })
      .then(setMeetings)
      .catch((err) => setError(err.message));
  }, [token, startDate, endDate, customerId, agentId]);

  const chosenCustomer = customers.find((c) => String(c.id) === String(customerId));

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Scheduled Meetings</h1>
          <p className={styles.sub}>
            What your team promised to go back for — and, for any one customer, everything that has happened there so far.
          </p>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sm-from">
            From
          </label>
          <input id="sm-from" type="date" className={styles.control} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sm-to">
            To
          </label>
          <input id="sm-to" type="date" className={styles.control} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sm-customer">
            Customer
          </label>
          <select id="sm-customer" className={styles.control} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">All</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sm-agent">
            Employee
          </label>
          <select id="sm-agent" className={styles.control} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">All</option>
            {Object.entries(agentNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {meetings === null && !error && <p className={styles.state}>Loading…</p>}

      {meetings && (
        <>
          <div className={styles.summary}>
            <div className={styles.figure}>
              <span className={styles.figureValue}>{meetings.length}</span>
              <span className={styles.figureLabel}>Meetings in this window</span>
            </div>
            <div className={styles.figure}>
              <span className={styles.figureValue}>{new Set(meetings.map((m) => m.customer_id)).size}</span>
              <span className={styles.figureLabel}>Customers to go back to</span>
            </div>
          </div>
          <p className={styles.summaryNote}>
            {startDate} to {endDate}
            {chosenCustomer ? ` — ${chosenCustomer.name}` : ""}
          </p>
        </>
      )}

      {meetings && meetings.length === 0 && (
        <p className={styles.state}>
          Nothing booked in this window. An agent sets these from the app when they finish a stop.
        </p>
      )}

      {meetings && meetings.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Customer</th>
                <th>Employee</th>
                <th>Last visited</th>
                <th>What they wrote</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.visit_id}>
                  <td className={`${styles.nameCell} ${styles.nowrap}`}>{new Date(m.next_meeting_at).toLocaleString()}</td>
                  <td>
                    {/* Picking the customer here fills the history below,
                        so the manager never has to go hunting for the
                        same name in the filter above. */}
                    <button
                      type="button"
                      onClick={() => setCustomerId(String(m.customer_id))}
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
                      {m.customer_name}
                    </button>
                  </td>
                  <td>{m.agent_name}</td>
                  <td className={styles.nowrap}>{m.visited_on ? new Date(m.visited_on).toLocaleDateString() : "—"}</td>
                  <td style={{ maxWidth: 320 }}>{m.visit_notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The history half. Hidden until a customer is picked, because
          "everything that ever happened at every customer" is not a
          question anyone asks. */}
      <div style={{ marginTop: 34 }}>
        <h2 style={{ fontSize: "1.15rem", color: "var(--ink)", margin: "0 0 4px" }}>
          {chosenCustomer ? `History — ${chosenCustomer.name}` : "History"}
        </h2>
        {!chosenCustomer && (
          <p className={styles.state} style={{ marginTop: 6 }}>
            Pick a customer above — from the filter or from a row — to see every visit there, with the photos, the voice
            note and whatever the agent wrote.
          </p>
        )}
        {chosenCustomer && (
          <>
            <p className={styles.summaryNote} style={{ marginTop: 6 }}>
              Every recorded visit, newest first — not limited to the date range above.
            </p>
            <div style={{ marginTop: 14 }}>
              <CustomerHistory token={token} customerId={chosenCustomer.id} customerName={chosenCustomer.name} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
