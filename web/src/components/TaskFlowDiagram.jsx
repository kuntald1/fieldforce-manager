import styles from "./TaskFlowDiagram.module.css";

const NODE_SPACING = 230;
const NODE_Y = 100;
const NODE_R = 30;
const VIEW_HEIGHT = 220;

function truncate(text, max = 18) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Pure illustration — no Mapbox tiles, no API calls, zero map-load cost.
// Shows the planned order as numbered stops connected by arrows that draw
// themselves in, left to right, one after another.
export default function TaskFlowDiagram({ startLabel, stopLabels }) {
  const labels = [startLabel || "Start", ...stopLabels];
  const width = Math.max(560, labels.length * NODE_SPACING + 80);

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${width} ${VIEW_HEIGHT}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Planned route: ${labels.join(" then ")}`}
      >
        {/* Decorative "map-like" texture — a static street-grid pattern,
            not real geography and not tied to actual coordinates. */}
        <g className={styles.texture} aria-hidden="true">
          {Array.from({ length: Math.ceil(width / 70) }).map((_, i) => (
            <line key={`v${i}`} x1={i * 70} y1="0" x2={i * 70} y2={VIEW_HEIGHT} />
          ))}
          {Array.from({ length: Math.ceil(VIEW_HEIGHT / 55) }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 55} x2={width} y2={i * 55} />
          ))}
          <line x1="0" y1="20" x2={width} y2={VIEW_HEIGHT - 30} className={styles.avenue} />
          <line x1="0" y1={VIEW_HEIGHT - 20} x2={width} y2="10" className={styles.avenue} />
        </g>

        {labels.map((label, i) => {
          if (i === 0) return null;
          const x1 = 40 + (i - 1) * NODE_SPACING + NODE_R;
          const x2 = 40 + i * NODE_SPACING - NODE_R;
          return (
            <line
              key={`arrow-${i}`}
              className={styles.arrow}
              style={{ "--delay": `${i * 0.35}s` }}
              x1={x1}
              y1={NODE_Y}
              x2={x2}
              y2={NODE_Y}
              markerEnd="url(#tfd-arrowhead)"
            />
          );
        })}

        <defs>
          <marker id="tfd-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1L9 5L1 9" fill="none" className={styles.arrowhead} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        {labels.map((label, i) => {
          const x = 40 + i * NODE_SPACING;
          const isStart = i === 0;
          const isEnd = i === labels.length - 1 && labels.length > 1;
          return (
            <g key={i} className={styles.node} style={{ "--delay": `${i * 0.35}s` }}>
              <circle
                cx={x}
                cy={NODE_Y}
                r={NODE_R}
                className={isStart ? styles.nodeStart : isEnd ? styles.nodeEnd : styles.nodeStop}
              />
              <text x={x} y={NODE_Y + 5} textAnchor="middle" className={styles.nodeNumber}>
                {isStart ? "S" : i}
              </text>
              <text x={x} y={NODE_Y + NODE_R + 22} textAnchor="middle" className={styles.nodeLabel}>
                {truncate(label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
