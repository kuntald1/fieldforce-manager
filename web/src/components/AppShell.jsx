import styles from "./AppShell.module.css";
import AttendanceToggle from "./AttendanceToggle";

export default function AppShell({ token, user, onSignOut, navItems, currentPage, onNavigate, children }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.wordmark}>
          <span className={styles.dot} />
          FieldForce Manager
        </div>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`${styles.navItem} ${item.key === currentPage ? styles.navItemActive : ""}`}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className={styles.contentArea}>
        <header className={styles.topbar}>
          <div className={styles.userArea}>
            {user.role === "agent" && <AttendanceToggle token={token} />}
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userRole}>{user.role}</span>
            <button className={styles.signOut} onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
