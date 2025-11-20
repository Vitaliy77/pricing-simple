// js/tabs/timesheet-approvals.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>Timesheet Approvals</h3>

    <section id="apInfoSection" style="margin-bottom:0.5rem;">
      <p>Loading manager info…</p>
    </section>

    <section id="apListSection">
      <p>No data.</p>
    </section>

    <section id="apDetailSection" style="margin-top:0.75rem;">
      <h4 style="margin-bottom:0.3rem;">Selected timesheet</h4>
      <div id="apDetailBody">
        <p>Select a timesheet above to view details.</p>
      </div>
    </section>
  </article>
`;

let rootEl = null;
let currentUser = null;
let currentManager = null;
let directReports = []; // employees
let timesheets = []; // submitted timesheets
let selectedTs = null; // {id,...}

/* ---------- Helpers ---------- */

const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#apInfoSection small", rootEl) || null;
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
}

/* ---------- Init ---------- */

export async function init(root) {
  rootEl = root;
  root.innerHTML = template;

  await bootstrapManager();
}

async function bootstrapManager() {
  const info = $("#apInfoSection", rootEl);
  info.innerHTML = "<p>Checking sign-in…</p>";

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    info.innerHTML = "<p>Not signed in. Use the Sign in tab first.</p>";
    $("#apListSection", rootEl).innerHTML = "<p>No data.</p>";
    return;
  }

  currentUser = data.user;
  const email = (currentUser.email || "").toLowerCase();

  const { data: empRows, error: empErr } = await client
    .from("employees")
    .select("id,email,first_name,last_name,is_admin,is_active")
    .eq("email", email)
    .limit(1);

  if (empErr) {
    console.error("[approvals] employees error", empErr);
    info.innerHTML = `<p>Error loading employee record: ${empErr.message}</p>`;
    return;
  }

  currentManager = empRows?.[0] || null;
  if (!currentManager) {
    info.innerHTML = `<p>Your email (${email}) is not linked to an employee record. Contact admin.</p>`;
    return;
  }

  info.innerHTML = `
    <p>Manager: <strong>${currentManager.first_name} ${currentManager.last_name}</strong> (${email})</p>
  `;

  await loadApprovals();
}

/* ---------- Load approvals ---------- */

async function loadApprovals() {
  const listSec = $("#apListSection", rootEl);
  listSec.innerHTML = "<p>Loading timesheets…</p>";

  // Direct reports
  const { data: drRows, error: drErr } = await client
    .from("employees")
    .select("id,first_name,last_name,is_active")
    .eq("manager_id", currentManager.id);

  if (drErr) {
    console.error("[approvals] direct reports error", drErr);
    listSec.innerHTML = `<p>Error: ${drErr.message}</p>`;
    return;
  }

  directReports = drRows || [];
  if (!directReports.length) {
    listSec.innerHTML = "<p>You have no direct reports.</p>";
    return;
  }

  const ids = directReports.map((e) => e.id);

  // Submitted timesheets for direct reports
  const { data: tsRows, error: tsErr } = await client
    .from("timesheets")
    .select("id,employee_id,week_start,status")
    .in("employee_id", ids)
    .eq("status", "submitted")
    .order("week_start", { ascending: false });

  if (tsErr) {
    console.error("[approvals] timesheets error", tsErr);
    listSec.innerHTML = `<p>Error: ${tsErr.message}</p>`;
    return;
  }

  timesheets = tsRows || [];

  if (!timesheets.length) {
    listSec.innerHTML = "<p>No submitted timesheets from your team.</p>";
    $("#apDetailBody", rootEl).innerHTML =
      "<p>Select a timesheet above to view details.</p>";
    selectedTs = null;
    return;
  }

  renderTimesheetList();
}

/* ---------- Render list ---------- */

function renderTimesheetList() {
  const listSec = $("#apListSection", rootEl);

  const tbl = h(`
    <table class="data-grid compact-grid">
      <thead>
        <tr>
          <th>Employee</th>
          <th>Week start</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `);

  const tbody = tbl.querySelector("tbody");
  timesheets.forEach((ts) => {
    const emp = directReports.find((e) => e.id === ts.employee_id);
    const name = emp
      ? `${emp.first_name} ${emp.last_name}`
      : ts.employee_id;

    const tr = h("<tr></tr>");
    tr.innerHTML = `
      <td>${name}</td>
      <td>${ts.week_start}</td>
      <td><span class="badge-status submitted">submitted</span></td>
      <td>
        <button type="button" class="btn-sm secondary" data-id="${ts.id}">Open</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  listSec.innerHTML = "";
  listSec.appendChild(tbl);

  tbody.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const ts = timesheets.find((t) => t.id === id);
      if (ts) {
        selectedTs = ts;
        loadTimesheetDetail(ts);
      }
    });
  });
}

/* ---------- Detail view ---------- */

async function loadTimesheetDetail(ts) {
  const body = $("#apDetailBody", rootEl);
  body.innerHTML = "<p>Loading details…</p>";

  const { data: lines, error: lnErr } = await client
    .from("timesheet_lines")
    .select("project_id,work_date,hours")
    .eq("timesheet_id", ts.id);

  if (lnErr) {
    console.error("[approvals] lines error", lnErr);
    body.innerHTML = `<p>Error: ${lnErr.message}</p>`;
    return;
  }

  // Load project info
  const projIds = Array.from(new Set((lines || []).map((l) => l.project_id)));
  let projects = [];
  if (projIds.length) {
    const { data: prjRows, error: prjErr } = await client
      .from("projects")
      .select("id,project_code,name")
      .in("id", projIds);
    if (prjErr) {
      console.error("[approvals] projects error", prjErr);
      body.innerHTML = `<p>Error: ${prjErr.message}</p>`;
      return;
    }
    projects = prjRows || [];
  }

  // Build days for that week
  const ws = new Date(ts.week_start + "T00:00:00Z");
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "M",
      day: "numeric",
    });
    days.push({ dateStr, label });
  }

  // Build grid: project -> day -> sum
  const byProj = new Map();
  projects.forEach((p) => {
    const rec = {
      project_id: p.id,
      code: p.project_code,
      name: p.name,
      dayHours: {},
    };
    days.forEach((d) => (rec.dayHours[d.dateStr] = 0));
    byProj.set(p.id, rec);
  });

  (lines || []).forEach((l) => {
    const proj = byProj.get(l.project_id);
    if (!proj) return;
    const dateStr = l.work_date?.slice(0, 10);
    if (!dateStr || !(dateStr in proj.dayHours)) return;
    proj.dayHours[dateStr] += Number(l.hours || 0);
  });

  const rows = Array.from(byProj.values());

  // Render
  const tbl = h(`
    <table class="timesheet-grid">
      <thead>
        <tr>
          <th class="proj-col">Project</th>
          ${days
            .map(
              (d) =>
                `<th style="text-align:right;">${d.label}</th>`
            )
            .join("")}
          <th class="total-col">Total</th>
        </tr>
      </thead>
      <tbody></tbody>
      <tfoot>
        <tr>
          <th>Totals</th>
          ${days
            .map(
              (d) =>
                `<th style="text-align:right;" data-day-total="${d.dateStr}">0.00</th>`
            )
            .join("")}
          <th style="text-align:right;" id="apGrandTotal">0.00</th>
        </tr>
      </tfoot>
    </table>
  `);

  const tbody = tbl.querySelector("tbody");

  rows.forEach((row) => {
    let rowSum = 0;
    const tr = h("<tr></tr>");
    tr.innerHTML = `<td>${row.code} – ${row.name}</td>`;

    days.forEach((d) => {
      const val = Number(row.dayHours[d.dateStr] || 0);
      rowSum += val;
      tr.appendChild(
        h(
          `<td style="text-align:right;">${
            val ? fmt2(val) : ""
          }</td>`
        )
      );
    });

    tr.appendChild(
      h(
        `<td class="total-col" style="text-align:right;">${fmt2(
          rowSum
        )}</td>`
      )
    );
    tbody.appendChild(tr);
  });

  // Totals
  let grand = 0;
  days.forEach((d) => {
    let sum = 0;
    rows.forEach((row) => {
      sum += Number(row.dayHours[d.dateStr] || 0);
    });
    const th = tbl.querySelector(`th[data-day-total="${d.dateStr}"]`);
    if (th) th.textContent = fmt2(sum);
    grand += sum;
  });
  const g = tbl.querySelector("#apGrandTotal");
  if (g) g.textContent = fmt2(grand);

  const emp = directReports.find((e) => e.id === ts.employee_id);
  const name = emp
    ? `${emp.first_name} ${emp.last_name}`
    : ts.employee_id;

  const header = h(`
    <div style="margin-bottom:0.4rem;display:flex;gap:0.5rem;align-items:center;">
      <div>
        <div><strong>${name}</strong></div>
        <div style="font-size:0.8rem;">Week of ${ts.week_start}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:0.35rem;">
        <button id="apApprove" type="button" class="btn-sm">Approve</button>
        <button id="apReject" type="button" class="btn-sm secondary">Reject</button>
      </div>
    </div>
  `);

  const wrapper = h(`<div></div>`);
  wrapper.appendChild(header);
  wrapper.appendChild(tbl);

  body.innerHTML = "";
  body.appendChild(wrapper);

  $("#apApprove", wrapper).addEventListener("click", () =>
    updateStatus(ts.id, "approved")
  );
  $("#apReject", wrapper).addEventListener("click", () =>
    updateStatus(ts.id, "rejected")
  );
}

async function updateStatus(tsId, newStatus) {
  try {
    const { error } = await client
      .from("timesheets")
      .update({ status: newStatus })
      .eq("id", tsId);
    if (error) throw error;
    await loadApprovals();
    $("#apDetailBody", rootEl).innerHTML =
      "<p>Status updated. Select another timesheet to view details.</p>";
  } catch (e) {
    console.error("[approvals] updateStatus error", e);
    const body = $("#apDetailBody", rootEl);
    body.innerHTML = `<p>Error updating status: ${e.message}</p>`;
  }
}

export const timesheetApprovalsTab = { template, init };
