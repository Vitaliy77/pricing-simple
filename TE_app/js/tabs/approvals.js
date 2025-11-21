// js/tabs/approvals.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>Approvals</h3>

    <section id="apInfoSection" style="margin-bottom:0.5rem;">
      <p>Loading manager info…</p>
    </section>

    <section id="apListSection">
      <p>Loading timesheets to review…</p>
    </section>
  </article>
`;

let rootEl = null;
let currentUser = null;
let currentEmployee = null;
let teamEmployees = [];
let timesheets = [];

function msg(text, isErr = false) {
  if (!rootEl) return;
  const info = $("#apInfoSection", rootEl);
  const existing = info.querySelector("small.apMsg");
  let el = existing;
  if (!el) {
    el = document.createElement("small");
    el.className = "apMsg";
    el.style.marginLeft = "0.5rem";
    info.appendChild(el);
  }
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
}

export async function init(root) {
  rootEl = root;
  root.innerHTML = template;
  await bootstrapManager();
}

/* ---------- Load manager + team ---------- */

async function bootstrapManager() {
  const info = $("#apInfoSection", rootEl);
  const list = $("#apListSection", rootEl);

  // 1) Check auth
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    info.innerHTML = `<p>You are not signed in. Go to the "Sign in" tab first.</p>`;
    list.innerHTML = "<p>No data.</p>";
    return;
  }
  currentUser = data.user;
  const email = (currentUser.email || "").toLowerCase();

  // 2) Load current employee
  const { data: empRows, error: empErr } = await client
    .from("employees")
    .select("id, email, first_name, last_name, is_active")
    .eq("email", email)
    .limit(1);

  if (empErr) {
    console.error("[approvals] employees error", empErr);
    info.innerHTML = `<p>Error loading employee record: ${empErr.message}</p>`;
    list.innerHTML = "<p>No data.</p>";
    return;
  }

  currentEmployee = empRows?.[0] || null;
  if (!currentEmployee) {
    info.innerHTML = `<p>Your email (${email}) is not linked to an employee record. Contact admin.</p>`;
    list.innerHTML = "<p>No data.</p>";
    return;
  }

  if (currentEmployee.is_active === false) {
    info.innerHTML = `<p>Your employee record is inactive. Contact admin.</p>`;
    list.innerHTML = "<p>No data.</p>";
    return;
  }

  info.innerHTML = `
    <p>Manager: <strong>${currentEmployee.first_name} ${currentEmployee.last_name}</strong>
    (${email})</p>
  `;

  await loadTeamAndTimesheets();
}

/* ---------- Load team employees + their timesheets ---------- */

async function loadTeamAndTimesheets() {
  const list = $("#apListSection", rootEl);
  list.innerHTML = "<p>Loading team and timesheets…</p>";

  // 1) Team employees managed by currentEmployee
  const { data: teamRows, error: teamErr } = await client
    .from("employees")
    .select("id, first_name, last_name, email")
    .eq("manager_id", currentEmployee.id);

  if (teamErr) {
    console.error("[approvals] team load error", teamErr);
    list.innerHTML = `<p>Error loading team: ${teamErr.message}</p>`;
    return;
  }

  teamEmployees = teamRows || [];
  if (!teamEmployees.length) {
    list.innerHTML = "<p>You don't have any direct reports assigned as employees.</p>";
    return;
  }

  const idSet = teamEmployees.map((e) => e.id);
  // 2) Timesheets for these employees (non-draft)
  const { data: tsRows, error: tsErr } = await client
    .from("timesheets")
    .select("id, employee_id, week_start, status")
    .in("employee_id", idSet)
    .neq("status", "draft")
    .order("week_start", { ascending: false });

  if (tsErr) {
    console.error("[approvals] timesheets load error", tsErr);
    list.innerHTML = `<p>Error loading timesheets: ${tsErr.message}</p>`;
    return;
  }

  timesheets = tsRows || [];
  renderTimesheetList();
}

/* ---------- Render UI ---------- */

function renderTimesheetList() {
  const list = $("#apListSection", rootEl);

  if (!timesheets.length) {
    list.innerHTML = "<p>No submitted timesheets from your team yet.</p>";
    return;
  }

  const empById = new Map();
  teamEmployees.forEach((e) => empById.set(e.id, e));

  const tbl = h(`
    <table class="table-basic">
      <thead>
        <tr>
          <th>Employee</th>
          <th>Week starting</th>
          <th>Status</th>
          <th style="width:140px;">Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `);

  const tbody = tbl.querySelector("tbody");

  timesheets.forEach((ts) => {
    const emp = empById.get(ts.employee_id) || {};
    const tr = document.createElement("tr");

    const weekStr = ts.week_start?.slice(0, 10) || "";

    tr.innerHTML = `
      <td>${emp.first_name || "?"} ${emp.last_name || ""} <br><small>${emp.email || ""}</small></td>
      <td>${weekStr}</td>
      <td><span class="${statusBadgeClass(ts.status)}">${ts.status}</span></td>
      <td>
        <button type="button" class="btn-xs" data-action="approve" data-id="${ts.id}">Approve</button>
        <button type="button" class="btn-xs secondary" data-action="reject" data-id="${ts.id}">Reject</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  list.innerHTML = "";
  list.appendChild(tbl);

  // Wire buttons
  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (!id || !action) return;
      await updateStatus(id, action === "approve" ? "approved" : "rejected");
    });
  });
}

function statusBadgeClass(status) {
  switch ((status || "").toLowerCase()) {
    case "submitted":
      return "badge-status submitted";
    case "approved":
      return "badge-status approved";
    case "rejected":
      return "badge-status rejected";
    default:
      return "badge-status draft";
  }
}

/* ---------- Approve / Reject ---------- */

async function updateStatus(timesheetId, newStatus) {
  try {
    msg(`Updating status to ${newStatus}…`);
    const { data, error } = await client
      .from("timesheets")
      .update({ status: newStatus })
      .eq("id", timesheetId)
      .select("id, employee_id, week_start, status")
      .single();

    if (error) throw error;

    // Update local array
    const idx = timesheets.findIndex((t) => t.id === timesheetId);
    if (idx >= 0) timesheets[idx] = data;
    renderTimesheetList();
    msg(`Timesheet ${newStatus}.`);
  } catch (e) {
    console.error("[approvals] updateStatus error", e);
    msg(e.message || String(e), true);
  }
}

export const approvalsTab = { template, init };
