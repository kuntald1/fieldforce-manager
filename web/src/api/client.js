export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8011";

export async function login(email, password) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "That email or password doesn't match our records.");
  }
  return res.json(); // { access_token, token_type }
}

export async function getCurrentUser(token) {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Session expired — sign in again.");
  return res.json(); // { user_id, organization_id, role, name }
}

export async function listCustomers(token) {
  const res = await fetch(`${API_BASE_URL}/api/customers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load customers.");
  return res.json();
}

export async function createCustomer(token, payload) {
  const res = await fetch(`${API_BASE_URL}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not add this customer.");
  }
  return res.json();
}

export async function createUser(token, payload) {
  const res = await fetch(`${API_BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not add this employee.");
  }
  return res.json();
}

export async function updateUser(token, id, payload) {
  const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not update this employee.");
  }
  return res.json();
}

export async function uploadEmployeePhoto(token, userId, file) {
  const formData = new FormData();
  formData.append("photo", file);
  const res = await fetch(`${API_BASE_URL}/api/users/${userId}/photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets the multipart boundary itself
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not upload the photo.");
  }
  return res.json();
}

export async function getMyMenu(token) {
  const res = await fetch(`${API_BASE_URL}/api/menu/my-menu`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load menu.");
  return res.json();
}

export async function listUsers(token, role) {
  const url = new URL(`${API_BASE_URL}/api/users`);
  if (role) url.searchParams.set("role", role);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load team members.");
  return res.json();
}

export async function listLivePositions(token) {
  const res = await fetch(`${API_BASE_URL}/api/gps-pings/live`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load live positions.");
  return res.json();
}

export async function getGpsPingHistory(token, agentId, date) {
  const url = new URL(`${API_BASE_URL}/api/gps-pings/history`);
  url.searchParams.set("agent_id", agentId);
  if (date) url.searchParams.set("date", date);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load travel history.");
  return res.json();
}

export async function listRoutes(token, agentId, routeDate) {
  const url = new URL(`${API_BASE_URL}/api/routes`);
  if (agentId) url.searchParams.set("agent_id", agentId);
  if (routeDate) url.searchParams.set("route_date", routeDate);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load routes.");
  return res.json();
}

export async function listDeviationAlerts(token, resolved) {
  const url = new URL(`${API_BASE_URL}/api/deviation-alerts`);
  if (resolved !== undefined) url.searchParams.set("resolved", resolved);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load deviation alerts.");
  return res.json();
}

export async function updateRoute(token, id, payload) {
  const res = await fetch(`${API_BASE_URL}/api/routes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not update this task.");
  }
  return res.json();
}

export async function deleteRoute(token, id) {
  const res = await fetch(`${API_BASE_URL}/api/routes/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not delete this task.");
  }
}

export async function getRouteById(token, id) {
  const res = await fetch(`${API_BASE_URL}/api/routes/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load this task.");
  return res.json();
}

export async function startRoute(token, id) {
  const res = await fetch(`${API_BASE_URL}/api/routes/${id}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not start this task.");
  }
  return res.json();
}

export async function endRoute(token, id) {
  const res = await fetch(`${API_BASE_URL}/api/routes/${id}/end`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not end this task.");
  }
  return res.json();
}

export async function requestTaskApproval(token, routeId, reason) {
  const res = await fetch(`${API_BASE_URL}/api/routes/${routeId}/request-approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not send the approval request.");
  }
  return res.json();
}

export async function listTaskApprovals(token, statusFilter) {
  const url = new URL(`${API_BASE_URL}/api/task-approvals`);
  if (statusFilter) url.searchParams.set("status_filter", statusFilter);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load approval requests.");
  return res.json();
}

export async function reviewTaskApproval(token, requestId, decision, notes) {
  const res = await fetch(`${API_BASE_URL}/api/task-approvals/${requestId}/${decision}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ notes: notes || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not record the decision.");
  }
  return res.json();
}

export async function requestTravelAllowance(token, routeId) {
  const res = await fetch(`${API_BASE_URL}/api/routes/${routeId}/request-ta`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not send the TA request.");
  }
  return res.json();
}

export async function listTravelAllowances(token, statusFilter) {
  const url = new URL(`${API_BASE_URL}/api/travel-allowances`);
  if (statusFilter) url.searchParams.set("status_filter", statusFilter);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load TA requests.");
  return res.json();
}

export async function reviewTravelAllowance(token, requestId, decision, { approvedKm, notes } = {}) {
  const res = await fetch(`${API_BASE_URL}/api/travel-allowances/${requestId}/${decision}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ approved_km: approvedKm ?? null, notes: notes || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not record the decision.");
  }
  return res.json();
}

export async function attendanceLogin(token) {
  const res = await fetch(`${API_BASE_URL}/api/attendance/login`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not log in for duty.");
  }
  return res.json();
}

export async function attendanceLogout(token) {
  const res = await fetch(`${API_BASE_URL}/api/attendance/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not log out.");
  }
  return res.json();
}

export async function getCurrentAttendance(token) {
  const res = await fetch(`${API_BASE_URL}/api/attendance/current`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not check attendance status.");
  return res.json(); // null if not on duty
}

export async function listAttendance(token, { agentId, date } = {}) {
  const url = new URL(`${API_BASE_URL}/api/attendance`);
  if (agentId) url.searchParams.set("agent_id", agentId);
  if (date) url.searchParams.set("date", date);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load attendance.");
  return res.json();
}

export async function createExpense(token, payload) {
  const res = await fetch(`${API_BASE_URL}/api/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not submit the expense.");
  }
  return res.json();
}

export async function uploadExpensePhoto(token, expenseId, file) {
  const formData = new FormData();
  formData.append("photo", file);
  const res = await fetch(`${API_BASE_URL}/api/expenses/${expenseId}/photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not upload the bill photo.");
  }
  return res.json();
}

export async function listExpenses(token, { statusFilter } = {}) {
  const url = new URL(`${API_BASE_URL}/api/expenses`);
  if (statusFilter) url.searchParams.set("status_filter", statusFilter);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load expenses.");
  return res.json();
}

export async function reviewExpense(token, expenseId, decision) {
  const res = await fetch(`${API_BASE_URL}/api/expenses/${expenseId}/${decision}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not record the decision.");
  }
  return res.json();
}

export async function cancelExpense(token, expenseId) {
  const res = await fetch(`${API_BASE_URL}/api/expenses/${expenseId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not cancel this expense.");
  }
  return res.json();
}

export async function markExpensePaid(token, expenseId, { transactionId, photoFile } = {}) {
  const formData = new FormData();
  if (transactionId) formData.append("transaction_id", transactionId);
  if (photoFile) formData.append("photo", photoFile);
  const res = await fetch(`${API_BASE_URL}/api/expenses/${expenseId}/mark-paid`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not mark this expense as paid.");
  }
  return res.json();
}

export async function markTravelAllowancePaid(token, requestId, { transactionId, photoFile } = {}) {
  const formData = new FormData();
  if (transactionId) formData.append("transaction_id", transactionId);
  if (photoFile) formData.append("photo", photoFile);
  const res = await fetch(`${API_BASE_URL}/api/travel-allowances/${requestId}/mark-paid`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not mark this TA request as paid.");
  }
  return res.json();
}

async function getReport(token, path, params) {
  const url = new URL(`${API_BASE_URL}/api/reports/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load this report.");
  return res.json();
}

export const getAgentSummaryReport = (token, { startDate, endDate, agentId }) =>
  getReport(token, "agent-summary", { start_date: startDate, end_date: endDate, agent_id: agentId });

export const getTaExpenseSummaryReport = (token, { startDate, endDate, agentId }) =>
  getReport(token, "ta-expense-summary", { start_date: startDate, end_date: endDate, agent_id: agentId });

export const getDeviationHistoryReport = (token, { startDate, endDate, agentId }) =>
  getReport(token, "deviation-history", { start_date: startDate, end_date: endDate, agent_id: agentId });

export const getCustomerVisitFrequencyReport = (token, { startDate, endDate }) =>
  getReport(token, "customer-visit-frequency", { start_date: startDate, end_date: endDate });

export const getFinanceBreakdownReport = (token, { startDate, endDate, agentId }) =>
  getReport(token, "finance-breakdown", { start_date: startDate, end_date: endDate, agent_id: agentId });

export async function getDashboardSummary(token, { date, agentId } = {}) {
  const url = new URL(`${API_BASE_URL}/api/dashboard/summary`);
  if (date) url.searchParams.set("date", date);
  if (agentId) url.searchParams.set("agent_id", agentId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load the dashboard.");
  return res.json();
}

export async function getOrganization(token) {
  const res = await fetch(`${API_BASE_URL}/api/organization`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load organization settings.");
  return res.json();
}

export async function updateOrganization(token, fields) {
  const res = await fetch(`${API_BASE_URL}/api/organization`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(fields), // e.g. { km_rate } or { deviation_threshold_m, default_geofence_radius_m }
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not update settings.");
  }
  return res.json();
}

export async function manualCompleteVisit(token, visitId) {
  const res = await fetch(`${API_BASE_URL}/api/visits/${visitId}/manual-complete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not mark this stop complete.");
  }
  return res.json();
}

export async function createRoute(token, payload) {
  const res = await fetch(`${API_BASE_URL}/api/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not create this task.");
  }
  return res.json();
}

export async function getAgentRouteForDate(token, agentId, dateStr) {
  const url = new URL(`${API_BASE_URL}/api/routes`);
  url.searchParams.set("agent_id", agentId);
  url.searchParams.set("route_date", dateStr);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load the planned route.");
  const routes = await res.json();
  return routes[0] || null; // at most one route per agent per day
}

export async function getPingHistory(token, agentId, dateStr, routeId) {
  const url = new URL(`${API_BASE_URL}/api/gps-pings/history`);
  url.searchParams.set("agent_id", agentId);
  url.searchParams.set("date", dateStr);
  if (routeId != null) url.searchParams.set("route_id", routeId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load the travelled path.");
  return res.json();
}

export async function resolveDeviationAlert(token, id, notes) {
  const res = await fetch(`${API_BASE_URL}/api/deviation-alerts/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ notes: notes || null }),
  });
  if (!res.ok) throw new Error("Could not resolve this alert.");
  return res.json();
}

export async function updateCustomer(token, id, payload) {
  const res = await fetch(`${API_BASE_URL}/api/customers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not update this customer.");
  }
  return res.json();
}

// ---- Companies (superadmin only) ----------------------------------
// Tenant administration. Every other call in this file works inside ONE
// company — whichever the token says. These are the calls that work
// across companies, and the server rejects them for anyone who isn't a
// superadmin, so there's no role check to repeat here.

export async function listCompanies(token) {
  const res = await fetch(`${API_BASE_URL}/api/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load companies.");
  return res.json();
}

export async function createCompany(token, payload) {
  const res = await fetch(`${API_BASE_URL}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not create this company.");
  }
  return res.json();
}

export async function updateCompany(token, id, payload) {
  const res = await fetch(`${API_BASE_URL}/api/companies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not update this company.");
  }
  return res.json();
}

export async function listCompanyUsers(token, id) {
  const res = await fetch(`${API_BASE_URL}/api/companies/${id}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load this company's logins.");
  return res.json();
}

export async function createCompanyAdmin(token, id, payload) {
  const res = await fetch(`${API_BASE_URL}/api/companies/${id}/admins`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
    throw new Error(detail || "Could not create this admin login.");
  }
  return res.json();
}

// ---- Scheduled meetings and customer history ----
export async function listScheduledMeetings(token, { startDate, endDate, customerId, agentId } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (customerId) params.set("customer_id", customerId);
  if (agentId) params.set("agent_id", agentId);
  const res = await fetch(`${API_BASE_URL}/api/meetings/scheduled?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load scheduled meetings.");
  return res.json();
}

/** Every recorded visit to one customer, newest first, with its photos,
 * voice note and notes. Dates are optional — without them it returns the
 * whole history, which is what the history panel wants. */
export async function getCustomerHistory(token, customerId, startDate, endDate) {
  const params = new URLSearchParams({ customer_id: String(customerId) });
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const res = await fetch(`${API_BASE_URL}/api/meetings/history?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load this customer's history.");
  return res.json();
}

/** Re-issues the caller's token pointed at another company, so every
 * other call in this file returns that company's data without any of
 * them changing. Pass null to go back to the superadmin's own. */
export async function switchCompany(token, organizationId) {
  const res = await fetch(`${API_BASE_URL}/api/auth/switch-company`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ organization_id: organizationId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not switch company.");
  }
  return res.json(); // { access_token, token_type }
}
