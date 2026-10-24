import styles from "./RouteTimeline.module.css";

function formatTime(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL = {
  completed: "Completed",
  checked_in: "In Progress",
  pending: "Pending",
  missed: "Missed",
};

// startLabel: route.start_location_name (or null — shows "Start" plainly).
// stops: [{ name, status, check_in_time }] in visit order — status/time
// come straight from Visit rows, nothing invented. roundtrip: whether to
// show a closing "Return" row back to the start.
export default function RouteTimeline({ startLabel, stops, roundtrip }) {
  const rows = [
    { kind: "endpoint", label: startLabel || "Start" },
    ...stops.map((s, i) => ({ kind: "stop", number: i + 1, ...s })),
    ...(roundtrip ? [{ kind: "endpoint", label: startLabel || "Start", isReturn: true }] : []),
  ];

  return (
    <div className={styles.timeline}>
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const statusKey = row.kind === "stop" ? row.status : null;
        const done = statusKey === "completed" || statusKey === "checked_in";
        return (
          <div key={i} className={styles.item}>
            {!isLast && <span className={styles.connector} />}
            <span className={`${styles.circle} ${row.kind === "endpoint" ? styles.circleEndpoint : done ? styles.circleDone : styles.circlePending}`}>
              {row.kind === "endpoint" ? (row.isReturn ? "↩" : "S") : row.number}
            </span>
            <div className={styles.content}>
              <div className={styles.topRow}>
                <span className={styles.name}>
                  {row.label || row.name}
                  {row.kind === "endpoint" && (row.isReturn ? " (End)" : " (Start)")}
                </span>
                {row.kind === "stop" && (
                  <span className={`${styles.pill} ${styles["pill_" + statusKey]}`}>{STATUS_LABEL[statusKey] || statusKey}</span>
                )}
              </div>
              {row.kind === "stop" && formatTime(row.check_in_time) && (
                <span className={styles.time}>{formatTime(row.check_in_time)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
