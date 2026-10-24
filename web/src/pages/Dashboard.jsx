import { useEffect, useState } from "react";
import styles from "./Dashboard.module.css";
import { getDashboardSummary, listUsers } from "../api/client";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// A small inline-SVG donut chart — no charting library in this project's
// package.json, and these 4 pies are simple enough not to need one.
function PieChart({ segments, size = 130, strokeWidth = 26 }) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetAccum = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eee9db" strokeWidth={strokeWidth} />
        ) : (
          segments
            .filter((seg) => seg.value > 0)
            .map((seg) => {
              const fraction = seg.value / total;
              const dash = fraction * circumference;
              const el = (
                <circle
                  key={seg.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offsetAccum}
                />
              );
              offsetAccum += dash;
              return el;
            })
        )}
      </g>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.17} fontWeight="700" fill="#15291a">
        {total}
      </text>
    </svg>
  );
}

function PieLegend({ segments }) {
  return (
    <ul className={styles.legend}>
      {segments.map((seg) => (
        <li key={seg.label} className={styles.legendRow}>
          <span className={styles.legendDot} style={{ background: seg.color }} />
          <span className={styles.legendLabel}>{seg.label}</span>
          <span className={styles.legendValue}>{seg.value}</span>
        </li>
      ))}
    </ul>
  );
}

function PieCard({ title, segments, note }) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{title}</div>
      <div className={styles.cardBody}>
        <PieChart segments={segments} />
        <PieLegend segments={segments} />
      </div>
      {total === 0 && <p className={styles.emptyNote}>No data for this selection.</p>}
      {note && <p className={styles.cardNote}>{note}</p>}
    </div>
  );
}

export default function Dashboard({ user, token }) {
  const isAgent = user?.role === "agent";

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [agentNames, setAgentNames] = useState({});
  const [selectedAgentId, setSelectedAgentId] = useState(null); // null = whole org, for admin/manager
  const [summary, setSummary] = useState(undefined); // undefined = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAgent) return;
    listUsers(token, "agent")
      .then((users) => {
        const map = {};
        users.forEach((u) => (map[u.id] = u.name));
        setAgentNames(map);
      })
      .catch(() => {});
  }, [token, isAgent]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getDashboardSummary(token, { date: selectedDate, agentId: isAgent ? undefined : selectedAgentId })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedDate, selectedAgentId, isAgent]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Dashboard</h1>
          <p className={styles.sub}>
            {isAgent ? "Your activity at a glance." : "Your team's activity at a glance."}
          </p>
        </div>
      </div>

      <div className={styles.controlsRow}>
        <div className={styles.controlField}>
          <label className={styles.controlLabel} htmlFor="dashboard-date">
            📅 Date
          </label>
          <input
            id="dashboard-date"
            type="date"
            className={styles.dateInput}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        {!isAgent && (
          <div className={styles.controlField}>
            <label className={styles.controlLabel} htmlFor="dashboard-employee">
              👤 Employee
            </label>
            <select
              id="dashboard-employee"
              className={styles.dateInput}
              value={selectedAgentId || ""}
              onChange={(e) => setSelectedAgentId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Whole team</option>
              {Object.entries(agentNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {summary === undefined && !error && <p className={styles.state}>Loading…</p>}

      {summary && (
        <div className={styles.grid}>
          <PieCard
            title="Visit status"
            note={`For ${selectedDate}`}
            segments={[
              { label: "Pending", value: summary.visit_status.pending, color: "#F97316" },
              { label: "Checked in", value: summary.visit_status.checked_in, color: "#2b6a8a" },
              { label: "Completed", value: summary.visit_status.completed, color: "#2e7d32" },
              { label: "Missed", value: summary.visit_status.missed, color: "#b3482f" },
            ]}
          />

          <PieCard
            title="Deviation summary"
            note={`For ${selectedDate}`}
            segments={[
              { label: "Resolved", value: summary.deviations.resolved, color: "#2e7d32" },
              { label: "Unresolved", value: summary.deviations.unresolved, color: "#b3482f" },
            ]}
          />

          <PieCard
            title="Attendance"
            note="Right now"
            segments={[
              { label: "On duty", value: summary.attendance.on_duty, color: "#2e7d32" },
              { label: "Off duty", value: summary.attendance.off_duty, color: "#8a8578" },
            ]}
          />

          <div className={styles.card}>
            <div className={styles.cardTitle}>TA / Expense approvals</div>
            <div className={styles.splitBody}>
              <div className={styles.splitHalf}>
                <div className={styles.splitLabel}>Travel Allowance</div>
                <div className={styles.cardBody}>
                  <PieChart
                    size={100}
                    strokeWidth={20}
                    segments={[
                      { label: "Pending", value: summary.ta_status.pending, color: "#a06b1f" },
                      { label: "Approved", value: summary.ta_status.approved, color: "#1b5e20" },
                      { label: "Rejected", value: summary.ta_status.rejected, color: "#b3482f" },
                    ]}
                  />
                  <PieLegend
                    segments={[
                      { label: "Pending", value: summary.ta_status.pending, color: "#a06b1f" },
                      { label: "Approved", value: summary.ta_status.approved, color: "#1b5e20" },
                      { label: "Rejected", value: summary.ta_status.rejected, color: "#b3482f" },
                    ]}
                  />
                </div>
              </div>
              <div className={styles.splitHalf}>
                <div className={styles.splitLabel}>Expenses</div>
                <div className={styles.cardBody}>
                  <PieChart
                    size={100}
                    strokeWidth={20}
                    segments={[
                      { label: "Pending", value: summary.expense_status.pending, color: "#a06b1f" },
                      { label: "Approved", value: summary.expense_status.approved, color: "#1b5e20" },
                      { label: "Rejected", value: summary.expense_status.rejected, color: "#b3482f" },
                    ]}
                  />
                  <PieLegend
                    segments={[
                      { label: "Pending", value: summary.expense_status.pending, color: "#a06b1f" },
                      { label: "Approved", value: summary.expense_status.approved, color: "#1b5e20" },
                      { label: "Rejected", value: summary.expense_status.rejected, color: "#b3482f" },
                    ]}
                  />
                </div>
              </div>
            </div>
            <p className={styles.cardNote}>All-time totals, not limited to the selected date.</p>
          </div>
        </div>
      )}
    </div>
  );
}
