import styles from "./RouteFlowCompact.module.css";

function truncate(text, max = 26) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Vertical version of the Task Flow View's diagram — sized for the Live
// Tracking sidebar's narrow column. Same zero-cost approach: pure SVG,
// no Mapbox tiles, no API call. If the route is a roundtrip, one more
// row loops back to "Start" at the bottom so the return leg is visible
// too, not just the outbound stops.
export default function RouteFlowCompact({ startLabel, stopLabels, roundtrip }) {
  const rows = [
    { label: startLabel || "Start", kind: "start" },
    ...stopLabels.map((label, i) => ({ label, kind: "stop", number: i + 1 })),
    ...(roundtrip ? [{ label: startLabel || "Start", kind: "return" }] : []),
  ];

  const rowHeight = 56;
  const height = rows.length * rowHeight;

  return (
    <div className={styles.wrap}>
      <svg className={styles.svg} viewBox={`0 0 260 ${height}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Planned stop order">
        {rows.map((row, i) => {
          if (i === 0) return null;
          const y1 = (i - 1) * rowHeight + 20;
          const y2 = i * rowHeight;
          return (
            <line
              key={`arrow-${i}`}
              className={row.kind === "return" ? styles.returnArrow : styles.arrow}
              style={{ "--delay": `${i * 0.3}s` }}
              x1="24"
              y1={y1}
              x2="24"
              y2={y2 - 4}
              markerEnd="url(#rfc-arrowhead)"
            />
          );
        })}
        <defs>
          <marker id="rfc-arrowhead" viewBox="0 0 10 10" refX="5" refY="8" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M1 1L9 5L1 9" fill="none" className={styles.arrowhead} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        {rows.map((row, i) => {
          const y = i * rowHeight;
          const isTerminal = row.kind === "start" || row.kind === "return";
          return (
            <g key={i} className={styles.node} style={{ "--delay": `${i * 0.3}s` }}>
              <circle cx="24" cy={y} r="16" className={row.kind === "return" ? styles.nodeReturn : isTerminal ? styles.nodeStart : styles.nodeStop} />
              <text x="24" y={y + 4} textAnchor="middle" className={styles.nodeNumber}>
                {isTerminal ? (row.kind === "return" ? "↩" : "S") : row.number}
              </text>
              <text x="52" y={y + 4} className={styles.nodeLabel}>
                {truncate(row.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
