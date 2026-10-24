import styles from "./RouteIllustration.module.css";

// A stylized, abstract route winding between four stops — not a real map,
// just the idea of "a planned path with visits along it." The line draws
// itself in once on mount; the pins fade in along the way. No looping
// motion after that — one orchestrated moment, then it's still.
export default function RouteIllustration() {
  return (
    <svg
      className={styles.svg}
      viewBox="0 0 520 640"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden="true"
    >
      {/* Faint street grid — static, grounds the route in "a map" without competing
          with the one animated moment (the main path drawing in). */}
      <g className={styles.streets} aria-hidden="true">
        <line x1="0" y1="150" x2="520" y2="110" />
        <line x1="0" y1="330" x2="520" y2="370" />
        <line x1="0" y1="480" x2="520" y2="520" />
        <line x1="55" y1="0" x2="160" y2="640" />
        <line x1="300" y1="0" x2="250" y2="640" />
        <line x1="420" y1="0" x2="470" y2="640" />
      </g>

      <path
        className={styles.routePath}
        d="M70 560 C 140 520, 110 440, 190 410 C 280 375, 260 290, 340 250 C 400 220, 380 140, 450 90"
        stroke="var(--text-on-dark)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        className={styles.routeGlow}
        d="M70 560 C 140 520, 110 440, 190 410 C 280 375, 260 290, 340 250 C 400 220, 380 140, 450 90"
        stroke="var(--text-on-dark)"
        strokeOpacity="0.16"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Start and destination are the one accent moment — everything else stays green/white. */}
      <g className={styles.pin} style={{ "--delay": "0.9s" }}>
        <circle cx="70" cy="560" r="7" fill="var(--accent-gold)" />
        <circle cx="70" cy="560" r="13" stroke="var(--accent-gold)" strokeOpacity="0.4" />
      </g>
      <g className={styles.pin} style={{ "--delay": "1.3s" }}>
        <circle cx="190" cy="410" r="6" fill="var(--text-on-dark)" />
      </g>
      <g className={styles.pin} style={{ "--delay": "1.6s" }}>
        <circle cx="340" cy="250" r="6" fill="var(--text-on-dark)" />
      </g>
      <g className={styles.pin} style={{ "--delay": "1.9s" }}>
        <circle cx="450" cy="90" r="8" fill="var(--accent-gold)" />
        <circle cx="450" cy="90" r="15" stroke="var(--accent-gold)" strokeOpacity="0.4" />
      </g>
    </svg>
  );
}
