import { lazy, Suspense, useEffect, useState } from "react";
import Login from "./pages/Login";
import AppShell from "./components/AppShell";
import CustomersPage from "./pages/CustomersPage";
import EmployeesPage from "./pages/EmployeesPage";
import TasksPage from "./pages/TasksPage";
import EmployeeTaskListPage from "./pages/EmployeeTaskListPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import TravelAllowancePage from "./pages/TravelAllowancePage";
import SettingsPage from "./pages/SettingsPage";
import AttendancePage from "./pages/AttendancePage";
import EmployeeExpensesPage from "./pages/EmployeeExpensesPage";
import ExpensesPage from "./pages/ExpensesPage";
import ReportsPage from "./pages/ReportsPage";
import Dashboard from "./pages/Dashboard";
import CompaniesPage from "./pages/CompaniesPage";
import ScheduledMeetingsPage from "./pages/ScheduledMeetingsPage";
import { getCurrentUser, getMyMenu, switchCompany } from "./api/client";

// mapbox-gl is a large dependency only Live Tracking needs — code-split it
// so Customers (and Login) stay light for everyone else.
const TrackingPage = lazy(() => import("./pages/TrackingPage"));

// Maps a menu item's `key` (from the backend's role-permission table) to
// the component that renders it. "customers" is handled separately below
// since it needs the viewer's role for its canEdit prop; every other
// screen just needs the token. Adding a new screen later means adding one
// line here plus a MenuItem + MenuRolePermission row — not a hardcoded
// role check scattered through the UI.
const PAGE_COMPONENTS = {
  companies: (token) => <CompaniesPage token={token} />,
  dashboard: (token, user) => <Dashboard token={token} user={user} />,
  employees: (token) => <EmployeesPage token={token} />,
  tasks: (token) => <TasksPage token={token} />,
  my_tasks: (token, user) => <EmployeeTaskListPage token={token} user={user} />,
  approvals: (token) => <ApprovalsPage token={token} />,
  travel_allowance: (token) => <TravelAllowancePage token={token} />,
  settings: (token) => <SettingsPage token={token} />,
  attendance: (token) => <AttendancePage token={token} />,
  my_expenses: (token) => <EmployeeExpensesPage token={token} />,
  expenses: (token) => <ExpensesPage token={token} />,
  reports: (token) => <ReportsPage token={token} />,
  scheduled_meetings: (token) => <ScheduledMeetingsPage token={token} />,
  live_tracking: (token, user) => (
    <Suspense fallback={null}>
      <TrackingPage token={token} user={user} />
    </Suspense>
  ),
};

const TOKEN_KEY = "fieldforce_token";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(!!token);
  const [menuItems, setMenuItems] = useState(null);
  const [page, setPage] = useState(null);

  // A token in localStorage survives a page refresh, but `user` doesn't —
  // re-fetch /me once on mount so a refresh doesn't bounce someone back to
  // the login screen while their session is still valid.
  useEffect(() => {
    if (!token) return;
    getCurrentUser(token)
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setRestoring(false));
  }, [token]);

  // The sidebar is built from the server's answer to "what can this role
  // see" — not a client-side role check — so granting a role access to a
  // new screen is a database change, not a redeploy.
  useEffect(() => {
    if (!token || !user) return;
    getMyMenu(token)
      .then((items) => {
        setMenuItems(items);
        setPage((current) => current || items[0]?.key || null);
      })
      .catch(() => setMenuItems([]));
  }, [token, user]);

  function handleSignedIn(newToken, newUser) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  /**
   * Superadmin only. Swaps the token for one issued against another
   * company; because every screen reads its data through that token, the
   * whole app is then looking at that company. Setting token state is
   * enough to refresh everything — the effects above re-fetch /me and the
   * menu off it.
   */
  async function handleSwitchCompany(organizationId) {
    const { access_token } = await switchCompany(token, organizationId);
    localStorage.setItem(TOKEN_KEY, access_token);
    setUser(null);
    setToken(access_token);
  }

  function handleSignOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setMenuItems(null);
    setPage(null);
  }

  if (restoring) {
    return null; // brief, avoids a flash of the login form while /me resolves
  }

  if (token && user) {
    const navItems = menuItems || [];
    // CustomersPage's own add/edit controls still check role directly —
    // being able to SEE the screen (menu permission) is separate from
    // being able to EDIT within it (existing require_role on the API).
    const canEditCustomers = user.role === "admin" || user.role === "manager";

    return (
      <AppShell
        token={token}
        user={user}
        onSignOut={handleSignOut}
        navItems={navItems}
        currentPage={page}
        onNavigate={setPage}
        onSwitchCompany={handleSwitchCompany}
      >
        {page === "customers" ? (
          <CustomersPage token={token} canEdit={canEditCustomers} />
        ) : page && PAGE_COMPONENTS[page] ? (
          PAGE_COMPONENTS[page](token, user)
        ) : null}
      </AppShell>
    );
  }

  return <Login onSignedIn={handleSignedIn} />;
}
