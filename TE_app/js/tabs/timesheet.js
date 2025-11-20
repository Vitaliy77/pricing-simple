// js/tabs/timesheet.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>My Timesheet</h3>

    <section id="tsInfoSection" style="margin-bottom:0.5rem;">
      <p>Loading user…</p>
    </section>

    <section style="margin-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
      <button id="tsPrevWeek" type="button" class="btn-sm secondary">&larr; Previous week</button>
      <button id="tsNextWeek" type="button" class="btn-sm secondary">Next week &rarr;</button>
      <span id="tsWeekLabel" style="font-weight:600;"></span>
      <span id="tsStatusLabel" class="badge-status draft"></span>
      <small id="tsMsg" style="margin-left:auto;"></small>
    </section>

    <section id="tsGridSection">
      <p>Loading timesheet…</p>
    </section>

    <section style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center;">
      <button id="tsSave" type="button" class="btn-sm">Save (Draft)</button>
      <button id="tsSubmit" type="button" class="btn-sm">Submit for Approval</button>
    </section>
  </article>
`;

let rootEl = null;
let currentUser = null;
let currentEmployee = null;

let weekStartDate = null; // Date object (Monday)
let days = []; // [{dateStr, label}]
let projects = []; // assigned projects
let rows = []; // in-memory grid

let currentTimesheet = null; // {id, status}

/* ---------- Helpers ---------- */

const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#tsMsg", rootEl);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
}

function getWeekStart(d = new Date()) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = tmp.getUTCDay(); // 0=Sun..6=Sat
  const diff = (dow + 6) % 7; // 0 for Monday, 1 for Tue, ...
  tmp.setUTCDate(tmp.getUTCDate() - diff);
  return tmp;
}

function buildDays(weekStart) {
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "M",
      day: "numeric",
    });
    arr.push({ dateStr, label });
  }
  return arr;
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

/* ---------- Init ---------- */

export async function init(root) {
  rootEl = root;
  root.innerHTML = template;

  $("#tsPrevWeek", rootEl).addEventListener("click", () => shiftWeek(-7));
  $("#tsNextWeek", rootEl).addEventListener("click", () => shiftWeek(+7));
  $("#tsSave", rootEl).addEventListener("click", () => saveTimesheet(false));
  $("#tsSubmit", rootEl).addEventListener("click", () => saveTimesheet(true));

  await bootstrapUser();
}

async function bootstrapUser() {
  const info = $("#tsInfoSection", rootEl);

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    info.innerHTML = `<p>You are not signed in. Go to the "Sign in" tab first.</p>`;
    $("#tsGridSection", rootEl).innerHTML = "<p>No data.</p>";
    return;
  }

  currentUser = data.user;

  const email = (currentUser.email || "").toLowerCase();
  const { data: empRows, error: empErr } = await client
    .from("employees")
    .select("id,email,first_name,last_name,is_active")
    .eq("email", email)
    .limit(1);

  if (empErr) {
    console.error("[timesheet] employees error", empErr);
    info.innerHTML = `<p>Error loading employee record: ${empErr.message}</p>`;
    return;
  }

  currentEmployee = empRows?.[0] || null;
  if (!currentEmployee) {
    info.innerHTML = `<p>Your email (${email}) is not linked to an employee record. Contact admin.</p>`;
    $("#tsGridSection", rootEl).innerHTML = "<p>No data.</p>";
    return;
  }

  if (currentEmployee.is_active === false) {
    info.innerHTML = `<p>Your employee record is inactive. Contact admin.</p>`;
    $("#tsGridSection", rootEl).innerHTML = "<p>No data.</p>";
    return;
  }

  info.innerHTML = `
    <p>Employee: <strong>${currentEmployee.first_name} ${currentEmployee.last_name}</strong>
    (${email})</p>
  `;

  weekStartDate = getWeekStart(new Date());
  await loadWeek();
}

async function shiftWeek(deltaDays) {
  if (!weekStartDate) return;
  weekStartDate = new Date(weekStartDate);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() + deltaDays);
  await loadWeek();
}

/* ---------- Load week ---------- */

async function loadWeek() {
  if (!currentEmployee) return;

  const ws = weekStartDate.toISOString().slice(0, 10);
  days = buildDays(weekStartDate);
  $("#tsWeekLabel", rootEl).textContent = `Week of ${ws}`;

  msg("Loading…");
  $("#tsGridSection", rootEl).innerHTML = "<p>Loading…</p>";

  // 1) Load assigned projects
  const { data: asgRows, error: asgErr } = await client
    .from("project_assignments")
    .select("project_id,is_active")
    .eq("employee_id", currentEmployee.id)
    .eq("is_active", true);

  if (asgErr) {
    console.error("[timesheet] assignments error", asgErr);
    msg(asgErr.message, true);
    return;
  }

  const projectIds = (asgRows || []).map((a) => a.project_id);
  if (!projectIds.length) {
    $("#tsGridSection", rootEl).innerHTML =
      "<p>You are not assigned to any projects.</p>";
    msg("");
    currentTimesheet = null;
    rows = [];
    $("#tsStatusLabel", rootEl).textContent = "No timesheet";
    $("#tsStatusLabel", rootEl).className = "badge-status draft";
    return;
  }

  const { data: prjRows, error: prjErr } = await client
    .from("projects")
    .select("id,project_code,name,status,start_date,end_date")
    .in("id", projectIds);

  if (prjErr) {
    console.error("[timesheet] projects error", prjErr);
    msg(prjErr.message, true);
    return;
  }

  projects = prjRows || [];

  // 2) Load timesheet header
  const { data: tsRows, error: tsErr } = await client
    .from("timesheets")
    .select("id,employee_id,week_start,status")
    .eq("employee_id", currentEmployee.id)
    .eq("week_start", ws)
    .limit(1);

  if (tsErr) {
    console.error("[timesheet] timesheets error", tsErr);
    msg(tsErr.message, true);
    return;
  }

  currentTimesheet = tsRows?.[0] || null;

  const statusLabel = $("#tsStatusLabel", rootEl);
  if (currentTimesheet) {
    statusLabel.textContent = currentTimesheet.status || "draft";
    statusLabel.className = statusBadgeClass(currentTimesheet.status);
  } else {
    statusLabel.textContent = "draft";
    statusLabel.className = statusBadgeClass("draft");
  }

  // 3) Load lines (if any)
  let lineRows = [];
  if (currentTimesheet) {
    const { data: ln, error: lnErr } = await client
      .from("timesheet_lines")
      .select("project_id,work_date,hours")
      .eq("timesheet_id", currentTimesheet.id);

    if (lnErr) {
      console.error("[timesheet] lines error", lnErr);
      msg(lnErr.message, true);
      return;
    }
    lineRows = ln || [];
  }

  // Build in-memory rows
  const byProj = new Map();
  projects.forEach((p) => {
    const rec = {
      project_id: p.id,
      project_code: p.project_code,
      project_name: p.name,
      dayHours: {}, // dateStr -> number
    };
    days.forEach((d) => (rec.dayHours[d.dateStr] = 0));
    byProj.set(p.id, rec);
  });

  lineRows.forEach((ln) => {
    const proj = byProj.get(ln.project_id);
    if (!proj) return;
    const dateStr = ln.work_date?.slice(0, 10);
    if (!dateStr || !(dateStr in proj.dayHours)) return;
    proj.dayHours[dateStr] = Number(ln.hours || 0);
  });

  rows = Array.from(byProj.values());

  renderGrid();
  msg("");
}

/* ---------- Render grid ---------- */

function renderGrid() {
  const container = $("#tsGridSection", rootEl);
  if (!rows.length) {
    container.innerHTML =
      "<p>You are not assigned to any projects for this week.</p>";
    return;
  }

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
          <th style="text-align:right;" id="tsGrandTotal">0.00</th>
        </tr>
      </tfoot>
    </table>
  `);

  const tbody = tbl.querySelector("tbody");

  rows.forEach((row, idx) => {
    const tr = h("<tr></tr>");
    tr.innerHTML = `<td>${row.project_code} – ${row.project_name}</td>`;
    days.forEach((d) => {
      const val = row.dayHours[d.dateStr] ?? 0;
      const cell = h(
        `<td style="text-align:right;">
          <input type="number"
                 step="0.25"
                 min="0"
                 data-row="${idx}"
                 data-date="${d.dateStr}"
                 value="${val || ""}">
         </td>`
      );
      tr.appendChild(cell);
    });

    const totalCell = h(
      `<td class="total-col" data-row-total="${idx}" style="text-align:right;">0.00</td>`
    );
    tr.appendChild(totalCell);
    tbody.appendChild(tr);
  });

  container.innerHTML = "";
  container.appendChild(tbl);

  // Wire inputs
  tbody.querySelectorAll("input[type=number]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.dataset.row);
      const dateStr = inp.dataset.date;
      if (!rows[idx] || !dateStr) return;
      const v = inp.value;
      const n = v === "" ? 0 : Number(v);
      rows[idx].dayHours[dateStr] = isNaN(n) ? 0 : n;
      recomputeTotals();
    });
  });

  recomputeTotals();
}

function recomputeTotals() {
  // Row totals
  rows.forEach((row, idx) => {
    let sum = 0;
    days.forEach((d) => {
      sum += Number(row.dayHours[d.dateStr] || 0);
    });
    const cell = rootEl.querySelector(`td[data-row-total="${idx}"]`);
    if (cell) cell.textContent = fmt2(sum);
  });

  // Column totals
  let grand = 0;
  days.forEach((d) => {
    let sum = 0;
    rows.forEach((row) => {
      sum += Number(row.dayHours[d.dateStr] || 0);
    });
    const th = rootEl.querySelector(`th[data-day-total="${d.dateStr}"]`);
    if (th) th.textContent = fmt2(sum);
    grand += sum;
  });

  const g = $("#tsGrandTotal", rootEl);
  if (g) g.textContent = fmt2(grand);
}

/* ---------- Save / Submit ---------- */

async function ensureTimesheetHeader(statusIfNew = "draft") {
  const ws = weekStartDate.toISOString().slice(0, 10);
  if (currentTimesheet) return currentTimesheet;

  const row = {
    employee_id: currentEmployee.id,
    week_start: ws,
    status: statusIfNew,
  };
  const { data, error } = await client
    .from("timesheets")
    .insert(row)
    .select("id,employee_id,week_start,status")
    .single();

  if (error) throw error;
  currentTimesheet = data;
  return currentTimesheet;
}

async function saveTimesheet(submitAfter) {
  if (!currentEmployee || !weekStartDate) return;
  try {
    msg("Saving…");

    await ensureTimesheetHeader(submitAfter ? "submitted" : "draft");
    const tsId = currentTimesheet.id;

    // Build insert rows
    const lines = [];
    rows.forEach((row) => {
      days.forEach((d) => {
        const v = Number(row.dayHours[d.dateStr] || 0);
        if (!v) return;
        lines.push({
          timesheet_id: tsId,
          project_id: row.project_id,
          work_date: d.dateStr,
          hours: v,
        });
      });
    });

    // Delete existing lines + insert new snapshot
    const del = await client
      .from("timesheet_lines")
      .delete()
      .eq("timesheet_id", tsId);
    if (del.error) throw del.error;

    if (lines.length) {
      const ins = await client.from("timesheet_lines").insert(lines);
      if (ins.error) throw ins.error;
    }

    // Update status if submitting
    if (submitAfter) {
      const upd = await client
        .from("timesheets")
        .update({ status: "submitted" })
        .eq("id", tsId)
        .select("id,employee_id,week_start,status")
        .single();
      if (upd.error) throw upd.error;
      currentTimesheet = upd.data;
    } else {
      const upd = await client
        .from("timesheets")
        .update({ status: "draft" })
        .eq("id", tsId)
        .select("id,employee_id,week_start,status")
        .single();
      if (upd.error) throw upd.error;
      currentTimesheet = upd.data;
    }

    const statusLabel = $("#tsStatusLabel", rootEl);
    statusLabel.textContent = currentTimesheet.status;
    statusLabel.className = statusBadgeClass(currentTimesheet.status);

    msg(submitAfter ? "Timesheet submitted for approval." : "Draft saved.");
  } catch (e) {
    console.error("[timesheet] save error", e);
    msg(e.message || String(e), true);
  }
}

export const timesheetTab = { template, init };
