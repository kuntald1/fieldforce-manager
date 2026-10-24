import { useEffect, useState } from "react";
import styles from "./ReportsPage.module.css";
import {
  listUsers,
  getAgentSummaryReport,
  getTaExpenseSummaryReport,
  getDeviationHistoryReport,
  getCustomerVisitFrequencyReport,
  getFinanceBreakdownReport,
} from "../api/client";
import { downloadCsv } from "../utils/csvExport";
import CustomerHistory from "../components/CustomerHistory";

const REPORT_TYPES = [
  { key: "agent_summary", label: "Agent daily summary" },
  { key: "ta_expense", label: "TA & Expense totals" },
  { key: "finance_breakdown", label: "Finance breakdown (Total → TA + Expense)" },
  { key: "deviation", label: "Deviation history" },
  { key: "customer_frequency", label: "Customer visit frequency" },
];

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
const km = (n) => `${Number(n || 0).toFixed(2)} km`;

// Small inline-SVG donut, same approach as Dashboard.jsx's PieChart — no
// charting library in this project, and one pie is simple enough not to
// need one. It sits inside the summary band rather than in a box of its
// own, so the split and the figures read as one statement instead of two.
function FinanceDonut({ taTotal, expenseTotal }) {
  const total = taTotal + expenseTotal;
  const size = 116;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    { label: "TA", value: taTotal, color: "#1b5e20" },
    { label: "Expense", value: expenseTotal, color: "#a06b1f" },
  ];
  let offsetAccum = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Travel allowance ${money(taTotal)}, expenses ${money(expenseTotal)}`}>
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
    </svg>
  );
}

function Badge({ tone, children }) {
  const cls =
    tone === "good" ? styles.badgeGood : tone === "warn" ? styles.badgeWarn : tone === "bad" ? styles.badgeBad : styles.badgeNeutral;
  return <span className={`${styles.badge} ${cls}`}>{children}</span>;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage({ token }) {
  const [reportType, setReportType] = useState("agent_summary");
  const [startDate, setStartDate] = useState(daysAgoStr(7));
  const [endDate, setEndDate] = useState(todayStr());
  const [agentId, setAgentId] = useState("");
  const [agentNames, setAgentNames] = useState({});
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  // "all" | "paid" | "unpaid" — only meaningful for finance breakdown,
  // the one report whose rows carry a payment state.
  const [paidFilter, setPaidFilter] = useState("all");
  // Which customer's history is open underneath the visit-frequency
  // report. A count of visits is the start of a question, not the answer
  // to one — "nine visits" is only interesting once you can see what
  // happened on those nine.
  const [openCustomer, setOpenCustomer] = useState(null);

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
    setError(null);
    setRows(null);
    const params = { startDate, endDate, agentId: agentId || undefined };
    const fetcher =
      reportType === "agent_summary"
        ? getAgentSummaryReport
        : reportType === "ta_expense"
        ? getTaExpenseSummaryReport
        : reportType === "finance_breakdown"
        ? getFinanceBreakdownReport
        : reportType === "deviation"
        ? getDeviationHistoryReport
        : getCustomerVisitFrequencyReport;
    fetcher(token, params)
      .then(setRows)
      .catch((err) => setError(err.message));
  }, [token, reportType, startDate, endDate, agentId]);

  // A payment filter left on from a previous report would silently hide
  // rows on the next one if that report ever gains an is_paid field.
  useEffect(() => {
    setPaidFilter("all");
    setOpenCustomer(null);
  }, [reportType]);

  const showPaidFilter = reportType === "finance_breakdown";
  const visibleRows =
    rows && showPaidFilter && paidFilter !== "all"
      ? rows.filter((r) => (paidFilter === "paid" ? r.is_paid : !r.is_paid))
      : rows;

  const columns = getColumns(reportType, agentNames, setOpenCustomer);
  const figures = visibleRows && visibleRows.length > 0 ? getFigures(reportType, visibleRows) : [];
  const hasTotals = columns.some((c) => c.total);

  function handleExport() {
    if (!visibleRows) return;
    const suffix = showPaidFilter && paidFilter !== "all" ? `_${paidFilter}` : "";
    downloadCsv(`${reportType}_${startDate}_to_${endDate}${suffix}.csv`, visibleRows, columns);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Reports</h1>
          <p className={styles.sub}>Aggregated from existing data — nothing here is a separate record of its own.</p>
        </div>
        <button className={styles.exportButton} onClick={handleExport} disabled={!visibleRows || visibleRows.length === 0}>
          Export CSV
        </button>
      </div>

      <div className={styles.filters}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="report-type">
            Report
          </label>
          <select id="report-type" className={styles.control} value={reportType} onChange={(e) => setReportType(e.target.value)}>
            {REPORT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="report-from">
            From
          </label>
          <input id="report-from" type="date" className={styles.control} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="report-to">
            To
          </label>
          <input id="report-to" type="date" className={styles.control} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        {reportType !== "customer_frequency" && (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="report-employee">
              Employee
            </label>
            <select id="report-employee" className={styles.control} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">All</option>
              {Object.entries(agentNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {showPaidFilter && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Payment</span>
            <div className={styles.segment}>
              {[
                { key: "all", label: "All" },
                { key: "paid", label: "Paid" },
                { key: "unpaid", label: "Not paid" },
              ].map((opt) => (
                <button key={opt.key} type="button" aria-pressed={paidFilter === opt.key} onClick={() => setPaidFilter(opt.key)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {rows === null && !error && <p className={styles.state}>Loading…</p>}
      {rows && rows.length === 0 && <p className={styles.state}>Nothing in this date range. Try widening the dates above.</p>}
      {rows && rows.length > 0 && visibleRows.length === 0 && (
        <p className={styles.state}>
          No {paidFilter === "paid" ? "paid" : "unpaid"} entries in this range. Switch Payment back to All to see the rest.
        </p>
      )}

      {/* The drill-down for Customer visit frequency. Sits under the
          table rather than in a modal so the row you clicked stays in
          view — the count and the story behind it read together. */}
      {reportType === "customer_frequency" && openCustomer && (
        <div style={{ marginTop: 30 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", color: "var(--ink)", margin: 0 }}>{openCustomer.name}</h2>
            <button
              type="button"
              onClick={() => setOpenCustomer(null)}
              style={{ background: "none", border: "none", font: "inherit", color: "var(--muted)", cursor: "pointer" }}
            >
              Close
            </button>
          </div>
          <p className={styles.summaryNote} style={{ marginTop: 4 }}>
            {startDate} to {endDate}
          </p>
          <div style={{ marginTop: 14 }}>
            <CustomerHistory
              token={token}
              customerId={openCustomer.id}
              customerName={openCustomer.name}
              startDate={startDate}
              endDate={endDate}
            />
          </div>
        </div>
      )}

      {visibleRows && visibleRows.length > 0 && (
        <>
          <div className={styles.summary}>
            {reportType === "finance_breakdown" && (
              <FinanceDonut
                taTotal={visibleRows.filter((r) => r.kind === "ta").reduce((s, r) => s + r.amount, 0)}
                expenseTotal={visibleRows.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amount, 0)}
              />
            )}
            {figures.map((f) => (
              <div key={f.label} className={styles.figure}>
                <span className={`${styles.figureValue} ${f.alert ? styles.figureValueAlert : ""}`}>{f.value}</span>
                <span className={styles.figureLabel}>{f.label}</span>
              </div>
            ))}
          </div>
          <p className={styles.summaryNote}>
            {reportType === "finance_breakdown" || reportType === "ta_expense"
              ? `Approved ${startDate} to ${endDate}, by approval date`
              : `${startDate} to ${endDate}`}
            {agentId && agentNames[agentId] ? ` — ${agentNames[agentId]}` : ""}
            {showPaidFilter && paidFilter !== "all" ? `, ${paidFilter === "paid" ? "paid only" : "unpaid only"}` : ""}
          </p>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.label} className={c.numeric ? styles.numeric : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c, ci) => (
                      <td
                        key={c.label}
                        className={[ci === 0 ? styles.nameCell : "", c.numeric ? styles.numeric : "", c.nowrap ? styles.nowrap : ""]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {c.render ? c.render(row) : typeof c.value === "function" ? c.value(row) : row[c.value]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {/* Ledger convention: the total belongs at the foot of the
                  column it totals, not in a separate box, so the eye runs
                  straight down from the figures to their sum. */}
              {hasTotals && (
                <tfoot>
                  <tr className={styles.totalRow}>
                    {columns.map((c, ci) => (
                      <td key={c.label} className={c.numeric ? styles.numeric : undefined}>
                        {c.total ? c.total(visibleRows) : ci === 0 ? "Total" : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const sum = (rows, pick) => rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0);

/** The two or three numbers that answer "what am I looking at" for each
 * report, before any row is read. Deliberately different per report: a
 * money report leads with money, the deviation report leads with how many
 * are still unresolved, because that's the one that needs acting on. */
function getFigures(reportType, rows) {
  if (reportType === "agent_summary") {
    return [
      { label: "Actual distance", value: km(sum(rows, (r) => r.actual_km)) },
      {
        label: "Visits completed",
        value: `${sum(rows, (r) => r.visits_completed)} / ${sum(rows, (r) => r.visits_total)}`,
      },
      {
        label: "Deviation alerts",
        value: String(sum(rows, (r) => r.deviation_count)),
        alert: sum(rows, (r) => r.deviation_count) > 0,
      },
    ];
  }
  if (reportType === "ta_expense") {
    return [
      { label: "Travel allowance", value: money(sum(rows, (r) => r.total_ta_amount)) },
      { label: "Expenses", value: money(sum(rows, (r) => r.total_expense_amount)) },
      { label: "Combined", value: money(sum(rows, (r) => r.total_combined)) },
    ];
  }
  if (reportType === "finance_breakdown") {
    const unpaid = rows.filter((r) => !r.is_paid);
    return [
      { label: "Travel allowance", value: money(sum(rows.filter((r) => r.kind === "ta"), (r) => r.amount)) },
      { label: "Expenses", value: money(sum(rows.filter((r) => r.kind === "expense"), (r) => r.amount)) },
      {
        label: `Still to pay (${unpaid.length})`,
        value: money(sum(unpaid, (r) => r.amount)),
        alert: unpaid.length > 0,
      },
    ];
  }
  if (reportType === "deviation") {
    const unresolved = rows.filter((r) => !r.resolved).length;
    const farthest = rows.reduce((m, r) => Math.max(m, r.distance_from_route_m || 0), 0);
    return [
      { label: "Alerts", value: String(rows.length) },
      { label: "Unresolved", value: String(unresolved), alert: unresolved > 0 },
      { label: "Farthest off route", value: `${Math.round(farthest)} m` },
    ];
  }
  return [
    { label: "Customers visited", value: String(rows.length) },
    { label: "Visits", value: String(sum(rows, (r) => r.visit_count)) },
  ];
}

function getColumns(reportType, agentNames, onOpenCustomer) {
  const agentCol = { label: "Employee", value: (r) => agentNames[r.agent_id] || "No data available" };
  // Which task a row belongs to, and where it started and ended — shared
  // by every report whose rows come from a task. An expense line has no
  // task, so it shows dashes.
  const taskCols = [
    { label: "Task ID", value: (r) => (r.task_id != null ? `#${r.task_id}` : "—"), nowrap: true },
    { label: "Start", value: (r) => r.start_name || "—" },
    { label: "End (last stop)", value: (r) => r.end_name || "—" },
  ];

  if (reportType === "agent_summary") {
    return [
      agentCol,
      { label: "Date", value: "date", nowrap: true },
      ...taskCols,
      { label: "Planned km", value: (r) => (r.planned_km != null ? r.planned_km : "—"), numeric: true },
      {
        label: "Actual km",
        value: "actual_km",
        numeric: true,
        total: (rows) => sum(rows, (r) => r.actual_km).toFixed(2),
      },
      { label: "Visits", value: (r) => `${r.visits_completed} / ${r.visits_total}`, numeric: true },
      {
        label: "Deviations",
        value: "deviation_count",
        numeric: true,
        total: (rows) => String(sum(rows, (r) => r.deviation_count)),
      },
      {
        label: "Approval",
        value: (r) => (r.approval_status ? capitalize(r.approval_status) : "—"),
        render: (r) =>
          r.approval_status ? (
            <Badge tone={r.approval_status === "approved" ? "good" : r.approval_status === "rejected" ? "bad" : "warn"}>
              {capitalize(r.approval_status)}
            </Badge>
          ) : (
            "—"
          ),
      },
      {
        label: "TA",
        value: (r) => {
          if (!r.ta_status) return "—";
          if (r.ta_status === "approved") {
            return `Approved — ${r.ta_approved_km ?? r.ta_claimed_km} km${r.ta_amount != null ? ` (₹${r.ta_amount})` : ""}`;
          }
          if (r.ta_status === "rejected") return `Rejected (claimed ${r.ta_claimed_km} km)`;
          return `Pending (${r.ta_claimed_km} km claimed)`;
        },
        render: (r) => {
          if (!r.ta_status) return "—";
          const tone = r.ta_status === "approved" ? "good" : r.ta_status === "rejected" ? "bad" : "warn";
          const detail =
            r.ta_status === "approved"
              ? `${r.ta_approved_km ?? r.ta_claimed_km} km${r.ta_amount != null ? ` · ₹${r.ta_amount}` : ""}`
              : `${r.ta_claimed_km} km claimed`;
          return (
            <>
              <Badge tone={tone}>{capitalize(r.ta_status)}</Badge>
              <div style={{ fontSize: "0.78rem", marginTop: 4 }}>{detail}</div>
            </>
          );
        },
      },
    ];
  }
  if (reportType === "ta_expense") {
    return [
      agentCol,
      {
        label: "TA approved (₹)",
        value: "total_ta_amount",
        numeric: true,
        total: (rows) => sum(rows, (r) => r.total_ta_amount).toFixed(2),
      },
      {
        label: "Expenses approved (₹)",
        value: "total_expense_amount",
        numeric: true,
        total: (rows) => sum(rows, (r) => r.total_expense_amount).toFixed(2),
      },
      {
        label: "Total (₹)",
        value: "total_combined",
        numeric: true,
        total: (rows) => sum(rows, (r) => r.total_combined).toFixed(2),
      },
    ];
  }
  if (reportType === "finance_breakdown") {
    return [
      agentCol,
      { label: "Date", value: "date", nowrap: true },
      ...taskCols,
      { label: "Kind", value: (r) => (r.kind === "ta" ? "Travel Allowance" : "Expense") },
      { label: "Detail", value: "detail" },
      {
        label: "Amount (₹)",
        value: "amount",
        numeric: true,
        total: (rows) => sum(rows, (r) => r.amount).toFixed(2),
      },
      {
        label: "Approved at",
        value: (r) => (r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : "—"),
        nowrap: true,
      },
      {
        label: "Paid",
        value: (r) => (r.is_paid ? `Paid${r.transaction_id ? ` · ${r.transaction_id}` : ""}` : "Not paid"),
        render: (r) =>
          r.is_paid ? (
            <>
              <Badge tone="good">Paid</Badge>
              {r.transaction_id && <div style={{ fontSize: "0.76rem", marginTop: 4 }}>{r.transaction_id}</div>}
            </>
          ) : (
            <Badge tone="neutral">Not paid</Badge>
          ),
      },
    ];
  }
  if (reportType === "deviation") {
    return [
      agentCol,
      ...taskCols,
      { label: "Detected at", value: (r) => new Date(r.detected_at).toLocaleString(), nowrap: true },
      {
        label: "Distance off route (m)",
        value: (r) => Math.round(r.distance_from_route_m),
        numeric: true,
      },
      {
        label: "Resolved",
        value: (r) => (r.resolved ? "Yes" : "No"),
        render: (r) => (r.resolved ? <Badge tone="good">Resolved</Badge> : <Badge tone="bad">Unresolved</Badge>),
      },
    ];
  }
  // customer_frequency
  return [
    {
      label: "Customer",
      value: "customer_name",
      // CSV still exports the plain name; only the on-screen cell is a
      // way in to that customer's visits.
      render: (r) => (
        <button
          type="button"
          onClick={() => onOpenCustomer({ id: r.customer_id, name: r.customer_name })}
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
          {r.customer_name}
        </button>
      ),
    },
    {
      label: "Visits",
      value: "visit_count",
      numeric: true,
      total: (rows) => String(sum(rows, (r) => r.visit_count)),
    },
  ];
}
