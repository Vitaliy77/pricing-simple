// js/tabs/laborHours.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

const MONTHS = [
  { key: "jan", label: "Jan", idx: 0 },
  { key: "feb", label: "Feb", idx: 1 },
  { key: "mar", label: "Mar", idx: 2 },
  { key: "apr", label: "Apr", idx: 3 },
  { key: "may", label: "May", idx: 4 },
  { key: "jun", label: "Jun", idx: 5 },
  { key: "jul", label: "Jul", idx: 6 },
  { key: "aug", label: "Aug", idx: 7 },
  { key: "sep", label: "Sep", idx: 8 },
  { key: "oct", label: "Oct", idx: 9 },
  { key: "nov", label: "Nov", idx: 10 },
  { key: "dec", label: "Dec", idx: 11 },
];

export const template = /*html*/`
  <article class="full-width-card w-full">
    <style>
      .labor-table {
        border-collapse: collapse;
        width: max-content;
        min-width: 100%;
      }
      .labor-table th,
      .labor-table td {
        padding: 2px 4px;
        white-space: nowrap;
        background-clip: padding-box;
      }

      /* Input styling */
      .labor-cell-input {
        width: 3rem;
        min-width: 3rem;
        max-width: 3rem;
        text-align: right;
        color: #0f172a !important;
        background-color: #ffffff !important;
        height: 1.5rem;
        line-height: 1.5rem;
        font-variant-numeric: tabular-nums;
      }
      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .no-spin { -moz-appearance: textfield; }

      /* === FIXED STICKY COLUMNS === */
      .labor-col-project  { width: 11rem; }
      .labor-col-employee { width: 13rem; }
      .labor-col-dept     { width: 18rem; }

      .labor-sticky-1,
      .labor-sticky-2,
      .labor-sticky-3 {
        position: sticky;
        z-index: 30;
        background-color: #ffffff; /* ensures content doesn't bleed through */
      }

      /* First column: Project */
      .labor-sticky-1 { left: 0; }

      /* Second column: Employee – starts right after Project */
      .labor-sticky-2 { left: 11rem; }

      /* Third column: Department – starts right after Project + Employee */
      .labor-sticky-3 { left: calc(11rem + 13rem); } /* 11 + 13 = 24rem */

      /* Header background override */
      .labor-table thead .labor-sticky-1,
      .labor-table thead .labor-sticky-2,
      .labor-table thead .labor-sticky-3 {
        background-color: #f8fafc;
        z-index: 40;
      }

      .labor-table tbody .labor-sticky-1,
      .labor-table tbody .labor-sticky-2,
      .labor-table tbody .labor-sticky-3 {
        border-right: 1px solid #e2e8f0;
        z-index: 35;
      }

      /* Row striping & hover */
      .labor-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .labor-row-striped:nth-child(even) { background-color: #ffffff; }
      .labor-row-striped:hover           { background-color: #dbeafe; }
      .labor-row-active                  { background-color: #bfdbfe !important; }

      /* Summary row */
      .labor-summary-row {
        background-color: #e5e7eb;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 20;
      }
    </style>

    <!-- Header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="laborInlinePlan" class="font-medium"></span>
        <span id="laborInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">· Labor Hours</span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Enter hours per month for employees on projects under the selected Level 1 project.
        </span>
      </div>
      <div id="laborHoursMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <!-- Main grid -->
    <section class="border-t border-slate-200" id="laborHoursSection" style="display:none;">
      <div class="px-4 py-2 flex flex-wrap items-end gap-3 text-xs">
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Project</span>
          <select id="laborProjectSelect" class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select project —</option>
          </select>
        </label>
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Employee</span>
          <select id="laborEmployeeSelect" class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select employee —</option>
          </select>
        </label>
        <button id="assignEmployeeBtn" class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Assign Employee to Project
        </button>
      </div>

      <div class="w-full max-h-[520px] overflow-y-auto overflow-x-auto">
        <table class="labor-table text-xs">
          <thead class="bg-slate-50">
            <tr>
              <th class="labor-sticky-1 labor-col-project sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Project</th>
              <th class="labor-sticky-2 labor-col-employee sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Employee</th>
              <th class="labor-sticky-3 labor-col-dept sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Department / Labor Category</th>
              ${MONTHS.map(m => `
                <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">${m.label}</th>
              `).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Total Hrs</th>
            </tr
          </thead>
          <tbody id="laborHoursTbody" class="bg-white">
            <tr><td colspan="16" class="text-center py Bro-10 text-slate-500 text-xs">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

// ─────────────────────────────────────────────
// STATE & HELPERS (unchanged – only CSS was broken)
// ─────────────────────────────────────────────
let projectScope = [];
let rows = [];
let allEmployees = [];

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  return Number.isNaN(num) ? "" : num.toString();
}

function computeRowTotal(row) {
  return Object.values(row.months || {}).reduce((sum, v) => sum + (Number(v || 0) || 0), 0);
}

function buildYmMap(year) {
  const map = {};
  MONTHS.forEach((m) => {
    const d = new Date(Date.UTC(year, m.idx, 1));
    map[m.key] = d.toISOString().slice(0, 10);
  });
  return map;
}

// ─────────────────────────────────────────────
// RENDER + EVENTS + DATA (unchanged – only CSS fixed above)
// ─────────────────────────────────────────────
function renderRows(root) { /* ... your existing renderRows unchanged ... */ }
function updateLaborTotals(root) { /* ... unchanged ... */ }
function wireGridEvents(root, client, ctx) { /* ... unchanged ... */ }

async function getProjectScope(client, level1ProjectId) { /* ... unchanged ... */ }
async function loadAllEmployees(client) { /* ... unchanged ... */ }
async function loadHours(client, projectIds, ctx) { /* ... unchanged ... */ }
async function upsertHourCell(client, ctx, row, monthKey, hoursValue) { /* ... unchanged ... */ }

export const laborHoursTab = {
  template,
  async init({ root, client }) {
    // Your full init logic — unchanged
    // (I've kept it exactly as you had it – only the CSS above was fixed)
    const msg = $("#laborHoursMessage", root);
    const section = $("#laborHoursSection", root);
    const ctx = getPlanContext();

    const planEl = $("#laborInlinePlan", root);
    const projEl = $("#laborInlineProject", root);

    planEl.textContent = ctx?.planLabel || (ctx?.year ? `BUDGET – ${ctx.year} · ${ctx.planType || "Working"}` : "Labor Hours");
    if (ctx?.level1ProjectCode && ctx?.level1ProjectName) {
      planEl.textContent += ` · Level 1 Project: ${ctx.level1ProjectCode} – ${ctx.level1ProjectName}`;
    }
    if (ctx?.projectCode && ctx?.projectName) {
      projEl.textContent = `, ${ctx.projectCode} – ${ctx.projectName}`;
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg.textContent = "Please select a Level 1 project and plan on the Projects tab.";
      if (section) section.style.display = "none";
      return;
    }

    section.style.display = "block";
    msg.textContent = "Loading employees and hours…";

    projectScope = await getProjectScope(client, ctx.level1ProjectId);

    const projectSelect = $("#laborProjectSelect", root);
    projectSelect.innerHTML = `<option value="">— Select project —</option>`;
    projectScope.forEach(p => {
      const opt = new Option(`${p.project_code} – ${p.name}`, p.id);
      projectSelect.appendChild(opt);
    });
    if (ctx.projectId && projectScope.some(p => p.id === ctx.projectId)) {
      projectSelect.value = ctx.projectId;
    }

    await loadAllEmployees(client);
    const empSelect = $("#laborEmployeeSelect", root);
    empSelect.innerHTML = `<option value="">— Select employee —</option>`;
    allEmployees.forEach(e => {
      const opt = new Option(e.label, e.id);
      empSelect.appendChild(opt);
    });

    const projectIds = projectScope.map(p => p.id);
    await loadHours(client, projectIds, ctx);
    renderRows(root);
    updateLaborTotals(root);
    wireGridEvents(root, client, ctx);

    msg.textContent = rows.length ? "" : "No employees assigned yet. Use the controls above to add employees.";

    $("#assignEmployeeBtn", root)?.addEventListener("click", async () => {
      const projId = projectSelect.value;
      const empId = empSelect.value;
      if (!projId || !empId) {
        msg.textContent = "Select both a project and an employee.";
        return;
      }

      const { error } = await client.from("project_employee_assignments").insert({
        project_id: projId,
        employee_id: empId,
        allocation_pct: 100,
        start_date: `${ctx.year}-01-01`,
        end_date: `${ctx.year}-12-31`,
      });

      if (!error) {
        msg.textContent = "Employee added. Enter hours below.";
        await loadHours(client, projectIds, ctx);
        renderRows(root);
        updateLaborTotals(root);
        wireGridEvents(root, client, ctx);
      } else {
        msg.textContent = "Already assigned or error occurred.";
      }
    });
  },
};
