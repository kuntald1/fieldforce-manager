import { useEffect, useState } from "react";
import styles from "./TasksPage.module.css"; // forked from CustomersPage.module.css — its own width/spacing
import CreateTaskModal from "../components/CreateTaskModal";
import TaskDetailModal from "../components/TaskDetailModal";
import ConfirmModal from "../components/ConfirmModal";
import { listRoutes, listUsers, startRoute, endRoute, deleteRoute } from "../api/client";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysStr(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function TasksPage({ token }) {
  const [tasks, setTasks] = useState(null);
  const [agentNames, setAgentNames] = useState({});
  const [error, setError] = useState(null);
  const [modalMode, setModalMode] = useState(null); // null | "add" | task object (edit)
  const [viewing, setViewing] = useState(null); // task object, or null
  const [actingOnId, setActingOnId] = useState(null); // task id currently Start/End-ing
  const [deletingId, setDeletingId] = useState(null); // task id currently being deleted
  const [confirmTask, setConfirmTask] = useState(null); // task pending delete confirmation

  // Default window: today through the next 6 days (a 7-day range) — this
  // page is mainly about what's coming up for the team, not history, so
  // it looks forward rather than back. Employee defaults to "All".
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(addDaysStr(6));
  const [agentFilter, setAgentFilter] = useState("");

  useEffect(() => {
    listRoutes(token)
      .then(setTasks)
      .catch((err) => setError(err.message));
    listUsers(token, "agent")
      .then((users) => {
        const map = {};
        users.forEach((u) => (map[u.id] = u.name));
        setAgentNames(map);
      })
      .catch(() => {});
  }, [token]);

  function handleSaved(saved) {
    setTasks((prev) => {
      const exists = prev?.some((t) => t.id === saved.id);
      return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...(prev || [])];
    });
    setModalMode(null);
  }

  async function handleStart(taskId) {
    setActingOnId(taskId);
    setError(null);
    try {
      const updated = await startRoute(token, taskId);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setError(err.message);
    } finally {
      setActingOnId(null);
    }
  }

  async function handleEnd(taskId) {
    setActingOnId(taskId);
    setError(null);
    try {
      const updated = await endRoute(token, taskId);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setError(err.message);
    } finally {
      setActingOnId(null);
    }
  }

  async function confirmDelete() {
    if (!confirmTask) return;
    const taskId = confirmTask.id;
    setDeletingId(taskId);
    setError(null);
    try {
      await deleteRoute(token, taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setConfirmTask(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  // Filtered by the date range + employee picked above, sorted by date
  // then by employee name — a stable, predictable order instead of
  // whatever order the API happened to return rows in.
  const visibleTasks = (tasks || [])
    .filter((t) => (!startDate || t.route_date >= startDate) && (!endDate || t.route_date <= endDate))
    .filter((t) => !agentFilter || t.agent_id === Number(agentFilter))
    .sort((a, b) => {
      if (a.route_date !== b.route_date) return a.route_date < b.route_date ? -1 : 1;
      const nameA = agentNames[a.agent_id] || "";
      const nameB = agentNames[b.agent_id] || "";
      return nameA.localeCompare(nameB);
    });

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>Tasks</h1>
          <p className={styles.sub}>Routes assigned to your team, by date.</p>
        </div>
        <button className={styles.addButton} onClick={() => setModalMode("add")}>
          Create task
        </button>
      </div>

      <div className={styles.filterRow}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="tasks-from">
            From
          </label>
          <input
            id="tasks-from"
            type="date"
            className={styles.filterInput}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="tasks-to">
            To
          </label>
          <input
            id="tasks-to"
            type="date"
            className={styles.filterInput}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="tasks-agent">
            Employee
          </label>
          <select
            id="tasks-agent"
            className={styles.filterInput}
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
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
      {tasks === null && !error && <p className={styles.state}>Loading tasks…</p>}
      {tasks && tasks.length === 0 && <p className={styles.state}>No tasks yet. Create the first one.</p>}
      {tasks && tasks.length > 0 && visibleTasks.length === 0 && (
        <p className={styles.state}>No tasks match this date range / employee filter.</p>
      )}

      {visibleTasks.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Stops</th>
              <th>Planned distance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.map((t) => (
              <tr key={t.id}>
                <td className={styles.nameCell}>{agentNames[t.agent_id] || "No data available"}</td>
                <td className={styles.muted}>{t.route_date}</td>
                <td className={styles.muted} style={{ textTransform: "capitalize" }}>
                  {t.status}
                </td>
                <td>
                  <span
                    style={{
                      fontSize: "0.76rem",
                      fontWeight: 500,
                      padding: "3px 10px",
                      borderRadius: 999,
                      textTransform: "capitalize",
                      background: t.priority === "high" ? "#f6e2de" : t.priority === "low" ? "#eef0ea" : "#faf1de",
                      color: t.priority === "high" ? "var(--error)" : t.priority === "low" ? "var(--muted)" : "#a06b1f",
                    }}
                  >
                    {t.priority}
                  </span>
                </td>
                <td className={styles.muted}>{t.waypoint_order?.length ?? 0}</td>
                <td className={styles.muted}>{t.planned_distance_km ? `${t.planned_distance_km} km` : "—"}</td>
                <td className={styles.editCell} style={{ width: "auto", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className={styles.editButton} onClick={() => setViewing(t)}>
                    View
                  </button>
                  {t.status === "planned" && (
                    <>
                      <button className={styles.editButton} onClick={() => setModalMode(t)}>
                        Edit
                      </button>
                      <button className={styles.editButton} onClick={() => handleStart(t.id)} disabled={actingOnId === t.id}>
                        {actingOnId === t.id ? "Starting…" : "Start"}
                      </button>
                      <button
                        className={styles.editButton}
                        style={{ color: "var(--error)", borderColor: "var(--error)" }}
                        onClick={() => setConfirmTask(t)}
                        disabled={deletingId === t.id}
                      >
                        {deletingId === t.id ? "Deleting…" : "Delete"}
                      </button>
                    </>
                  )}
                  {t.status === "in_progress" && (
                    <button className={styles.editButton} onClick={() => handleEnd(t.id)} disabled={actingOnId === t.id}>
                      {actingOnId === t.id ? "Ending…" : "End"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalMode && (
        <CreateTaskModal
          token={token}
          task={modalMode === "add" ? null : modalMode}
          onClose={() => setModalMode(null)}
          onSaved={handleSaved}
        />
      )}

      {viewing && (
        <TaskDetailModal
          token={token}
          agentId={viewing.agent_id}
          agentName={agentNames[viewing.agent_id] || "No data available"}
          taskId={viewing.id}
          initialDate={viewing.route_date}
          onClose={() => setViewing(null)}
          canManualComplete
        />
      )}

      {confirmTask && (
        <ConfirmModal
          title="Delete this task?"
          message={`${agentNames[confirmTask.agent_id] || "This agent"}'s task on ${confirmTask.route_date} (${
            confirmTask.planned_distance_km ? `${confirmTask.planned_distance_km} km` : "no distance"
          }) will be permanently deleted. This can't be undone.`}
          confirmLabel={deletingId === confirmTask.id ? "Deleting…" : "Delete"}
          danger
          busy={deletingId === confirmTask.id}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmTask(null)}
        />
      )}
    </div>
  );
}
