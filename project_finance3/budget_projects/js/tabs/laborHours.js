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

export const template = /*html*/ `
  <article class="full-width-card w-full">
    <!-- Local styles -->
    <style>
      .labor-table {
        border-collapse: collapse;
        width: 100%;
      }
      .labor-table th,
      .labor-table td {
        padding: 2px 4px;
        white-space: nowrap;
      }

      .labor-cell-input {
        min-width: 4.8rem; /* fits 1,000,000 */
        text-align: right;
      }
      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .no-spin {
        -moz-appearance: textfield;
      }

      /* Sticky columns for this tab only */
      .labor-sticky-1,
      .labor-sticky-2,
      .labor-sticky-3 {
        position: sticky;
        z-index: 30;
        background-color: inherit; /* keep row striping */
      }
      .labor-sticky-1 { left: 0; }
      .labor-sticky-2 { left: 9rem; }
      .labor-sticky-3 { left: 21rem; }

      .labor-col-project { min-width: 9rem; }
      .labor-col-employee { min-width: 12rem; }
      .labor-col-dept { min-width: 14rem; }

      /* striping + active row */
      .labor-row-striped:nth-child(odd) {
        background-color: #eff6ff; /* blue-50 */
      }
      .labor-row-striped:nth-child(even) {
        background-color: #ffffff;
      }
      .labor-row-striped:hover {
        background-color: #dbeafe; /* blue-100 */
      }
      .labor-row-active {
        background-color: #bfdbfe !important; /* blue-200 */
      }

      .labor-summary-row {
        background-color: #e5e7eb;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 20;
      }
    </style>

    <!-- Compact inline header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="laborInlinePlan" class="font-medium"></span>
        <span id="laborInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Labor Hours
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Enter hours per month for employees on projects under the selected Level 1 project.
        </span>
      </div>
      <div
        id="laborHoursMessage"
        class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"
      ></div>
    </div>

    <!-- Assignment controls -->
    <section class="border-t border-slate-200" id="laborHoursSection" style="display:none;">
      <div class="px-4 py-2 flex flex-wrap items-end gap-3 text-xs">
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Project</span>
          <select
            id="laborProjectSelect"
            class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">— Select project —</option>
          </select>
        </label>

        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Employee</span>
          <select
            id="laborEmployeeSelect"
            class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">— Select employee —</option>
          </select>
        </label>

        <button
          id="assignEmployeeBtn"
          class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white"
        >
          + Assign Employee to Project
        </button>
      </div>

      <div class="w-full max-h-[520px] overflow-auto overflow-x-auto">
        <table class="labor-table min-w-full text-xs table-fixed">
          <thead class="bg-slate-50">
            <tr>
              <th
                class="labor-sticky-1 labor-col-project sticky top-0 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider"
              >
                Project
              </th>
              <th
                class="labor-sticky-2 labor-col-employee sticky top-0 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider"
              >
                Employee
              </th>
              <th
                class="labor-sticky-3 labor-col-dept sticky top-0 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider"
              >
                Department / Labor Category
              </th>
              ${MONTHS.map(
                (m) => `
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                ${m.label}
              </th>`
              ).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Total Hrs
              </th>
            </tr>
          </thead>
          <tbody id="laborHoursTbody" class="bg-white">
            <tr>
              <td colspan="16" class="text-center py-10 text-slate-500 text-xs">
                Loading…
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let projectScope = []; // [{ id, project_code, name }]
let availableEmployees = []; // from project assignments
let allEmployees = []; // all employees for dropdown
let rows = []; // [{ project_id, project_code, project_name, employee_id, full_name, department_name, labor_category, months{ym}, ymMap }]

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  if (Number.isNaN(num)) return "";
  return num.toString();
}

function computeRowTotal(row) {
  return Object.values(row.months || {}).reduce((sum, v) => {
    const n = Number(v || 0);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);
}

function buildYmMap(year) {
  const map = {};
  MONTHS.forEach((m) => {
    const d = new Date(Date.UTC(year, m.idx, 1));
    const ym = d.toISOString().slice(0, 10);
    map[m.key] = ym;
  });
  return map;
}

// ─────────────────────────────────────────────
// LOADERS
// ─────────────────────────────────────────────

async function getProjectScope(client, level1ProjectId) {
  const { data: parent, error: parentError } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (parentError || !parent) {
    console.error("[laborHours] parent project error", parentError);
    return [];
  }

  const { data: children, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error) {
    console.error("[laborHours] children projects error", error);
    return [parent];
  }

  return [parent, ...(children || [])];
}

// all mapped employees from project_employee_assignments
async function loadAvailableEmployees(client, projectIds) {
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("project_employee_assignments")
    .select(`
      project_id,
      employees (
        id,
        full_name,
        department_name,
        labor_categories ( labor_category )
      ),
      projects ( project_code, name )
    `)
    .in("project_id", projectIds);

  if (error) {
    console.error("[laborHours] loadAvailableEmployees error", error);
    return [];
  }

  const list = [];
  (data || []).forEach((row) => {
    const e = row.employees;
    const p = row.projects;
    if (!e || !p) return;
    list.push({
      project_id: row.project_id,
      project_code: p.project_code,
      project_name: p.name,
      employee_id: e.id,
      full_name: e.full_name,
      department_name: e.department_name,
      labor_category: e.labor_categories?.labor_category || "",
    });
  });

  const keyMap = new Map();
  list.forEach((e) => {
    keyMap.set(`${e.project_id}||${e.employee_id}`, e);
  });

  return Array.from(keyMap.values()).sort((a, b) => {
    if (a.project_code === b.project_code) {
      return a.full_name.localeCompare(b.full_name);
    }
    return a.project_code.localeCompare(b.project_code);
  });
}

// all employees for dropdown
async function loadAllEmployees(client) {
  const { data, error } = await client
    .from("employees")
    .select(`
      id,
      full_name,
      department_name,
      employee_id,
      labor_categories ( labor_category )
    `)
    .order("full_name");

  if (error) {
    console.error("[laborHours] loadAllEmployees error", error);
    return [];
  }

  return (data || []).map((e) => ({
    id: e.id,
    full_name: e.full_name,
    department_name: e.department_name,
    employee_code: e.employee_id,
    labor_category: e.labor_categories?.labor_category || "",
  }));
}

// existing hours from project_labor_hours
async function loadHours(client, projectIds, ctx) {
  if (!projectIds.length) return [];
  const { year, versionId, planType } = ctx;

  const { data, error } = await client
    .from("project_labor_hours")
    .select(`
      project_id,
      employee_id,
      ym,
      hours,
      employees (
        full_name,
        department_name,
        labor_categories ( labor_category )
      ),
      projects ( project_code, name )
    `)
    .in("project_id", projectIds)
    .eq("plan_year", year)
    .eq("plan_version_id", versionId)
    .eq("plan_type", planType || "Working");

  if (error) {
    console.error("[laborHours] loadHours error", error);
    return [];
  }

  const ymMap = buildYmMap(year);
  const byKey = new Map();

  (data || []).forEach((r) => {
    const key = `${r.project_id}||${r.employee_id}`;
    if (!byKey.has(key)) {
      const emp = r.employees || {};
      const proj = r.projects || {};
      byKey.set(key, {
        project_id: r.project_id,
        project_code: proj.project_code || "",
        project_name: proj.name || "",
        employee_id: r.employee_id,
        full_name: emp.full_name || "",
        department_name: emp.department_name || "",
        labor_category: emp.labor_categories?.labor_category || "",
        months: {},
        ymMap: { ...ymMap },
      });
    }
    const row = byKey.get(key);
    row.months[r.ym] = Number(r.hours || 0);
  });

  const result = Array.from(byKey.values());
  result.forEach((row) => {
    Object.values(row.ymMap).forEach((ym) => {
      if (!(ym in row.months)) row.months[ym] = null;
    });
  });

  return result;
}

// ─────────────────────────────────────────────
// RENDERING & TOTALS
// ─────────────────────────────────────────────

function updateLaborTotals(root) {
  const summaryRow = root.querySelector("tr[data-summary-row='labor']");
  if (!summaryRow || !rows.length) return;

  const monthTotals = {};
  MONTHS.forEach((m) => (monthTotals[m.key] = 0));
  let grand = 0;

  rows.forEach((row) => {
    MONTHS.forEach((m) => {
      const ym = row.ymMap[m.key];
      const val = Number(row.months[ym] || 0);
      if (!Number.isNaN(val)) {
        monthTotals[m.key] += val;
        grand += val;
      }
    });
  });

  MONTHS.forEach((m) => {
    const cell = summaryRow.querySelector(`[data-total-col="${m.key}"]`);
    if (cell) {
      cell.textContent = monthTotals[m.key].toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
    }
  });

  const grandCell = summaryRow.querySelector('[data-total-col="all"]');
  if (grandCell) {
    grandCell.textContent = grand.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }
}

function renderRows(root) {
  const tbody = $("#laborHoursTbody", root);
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16" class="text-center py-10 text-slate-500 text-xs">
          No employees yet. Use the assignment controls above to add employees to projects.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = idx.toString();
    tr.className = "labor-row-striped";

    const total = computeRowTotal(row);

    const monthCells = MONTHS.map((m) => {
      const ym = row.ymMap[m.key];
      const val = row.months[ym];
      return `
        <td>
          <input
            class="cell-input cell-input-num labor-cell-input no-spin border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]"
            data-row="${idx}"
            data-month="${m.key}"
            type="number"
            step="0.01"
            value="${fmtNum(val)}"
          />
        </td>
      `;
    }).join("");

    tr.innerHTML = `
      <td class="labor-sticky-1 labor-col-project text-[11px] font-medium text-slate-900">
        ${row.project_code || ""}
      </td>
      <td class="labor-sticky-2 labor-col-employee text-[11px] text-slate-800">
        ${row.full_name || ""}
      </td>
      <td class="labor-sticky-3 labor-col-dept text-[11px] text-slate-600">
        ${row.department_name || ""}${
      row.labor_category ? ` · ${row.labor_category}` : ""
    }
      </td>
      ${monthCells}
      <td class="text-right text-[11px] font-semibold text-slate-900" data-total-row="${idx}">
        ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Summary row
  const summaryTr = document.createElement("tr");
  summaryTr.dataset.summaryRow = "labor";
  summaryTr.className = "labor-summary-row";
  const totalsLabel = `
    <td class="text-[11px] font-semibold text-slate-900">Totals</td>
    <td></td>
    <td></td>
  `;
  const monthTotalsCells = MONTHS.map(
    (m) => `
      <td class="text-right text-[11px]" data-total-col="${m.key}"></td>
    `
  ).join("");
  const grandTotalCell = `
    <td class="text-right text-[11px] font-semibold" data-total-col="all"></td>
  `;
  summaryTr.innerHTML = totalsLabel + monthTotalsCells + grandTotalCell;
  tbody.appendChild(summaryTr);

  updateLaborTotals(root);
}

async function upsertHourCell(client, ctx, row, monthKey, hoursValue) {
  if (!row.employee_id || !row.project_id) return;

  const ym = row.ymMap[monthKey];
  if (!ym) return;

  const payload = {
    project_id: row.project_id,
    employee_id: row.employee_id,
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
    plan_type: ctx.planType || "Working",
    ym,
    hours: hoursValue === "" || hoursValue === null ? 0 : Number(hoursValue),
  };

  const { error } = await client
    .from("project_labor_hours")
    .upsert(payload, {
      onConflict: "project_id,employee_id,plan_version_id,plan_type,ym",
    });

  if (error) {
    console.error("[laborHours] upsertHourCell error", error);
  }
}

function wireRowHighlight(root) {
  const tbody = $("#laborHoursTbody", root);
  if (!tbody) return;

  const setActive = (tr) => {
    tbody
      .querySelectorAll("tr.labor-row-striped, tr.labor-summary-row")
      .forEach((row) => row.classList.remove("labor-row-active"));
    if (tr && tr.matches(".labor-row-striped")) {
      tr.classList.add("labor-row-active");
    }
  };

  tbody.addEventListener("focusin", (evt) => {
    const tr = evt.target.closest("tr");
    if (tr) setActive(tr);
  });

  tbody.addEventListener("click", (evt) => {
    const tr = evt.target.closest("tr");
    if (tr) setActive(tr);
  });
}

// ─────────────────────────────────────────────
// MAIN TAB INIT
// ─────────────────────────────────────────────

export const laborHoursTab = {
  template,
  async init({ root, client }) {
    const msgEl = $("#laborHoursMessage", root);
    const sectionEl = $("#laborHoursSection", root);

    const ctx = getPlanContext();

    // Compact header text from global header
    const globalPlan =
      document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    const globalProject =
      document.querySelector("#currentProject")?.textContent?.trim() || "";
    const planSpan = $("#laborInlinePlan", root);
    const projSpan = $("#laborInlineProject", root);
    if (planSpan) planSpan.textContent = globalPlan;
    if (projSpan) {
      if (globalProject) {
        projSpan.textContent = `, ${globalProject}`;
      } else {
        projSpan.textContent = "";
      }
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      if (msgEl) {
        msgEl.textContent =
          "Please select a Level 1 project and plan first.";
      }
      if (sectionEl) sectionEl.style.display = "none";
      return;
    }

    if (msgEl) msgEl.textContent = "Loading projects, employees, and hours…";

    projectScope = await getProjectScope(client, ctx.level1ProjectId);
    const projectIds = projectScope.map((p) => p.id);

    // fill project dropdown
    const projSel = $("#laborProjectSelect", root);
    if (projSel) {
      projSel.innerHTML = '<option value="">— Select project —</option>';
      projectScope.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.project_code} – ${p.name}`;
        projSel.appendChild(opt);
      });
    }

    allEmployees = await loadAllEmployees(client);
    availableEmployees = await loadAvailableEmployees(client, projectIds);

    // employee dropdown (all employees)
    const empSel = $("#laborEmployeeSelect", root);
    if (empSel) {
      empSel.innerHTML = '<option value="">— Select employee —</option>';
      allEmployees.forEach((e) => {
        const opt = document.createElement("option");
        opt.value = e.id;
        opt.textContent = `${e.full_name} (${e.employee_code})`;
        empSel.appendChild(opt);
      });
    }

    const ymMap = buildYmMap(ctx.year);

    rows = await loadHours(client, projectIds, ctx);

    // Ensure mapped employees get rows even if they have no hours yet
    const existingKeys = new Set(
      rows.map((r) => `${r.project_id}||${r.employee_id}`)
    );

    availableEmployees.forEach((emp) => {
      const key = `${emp.project_id}||${emp.employee_id}`;
      if (!existingKeys.has(key)) {
        const months = {};
        Object.values(ymMap).forEach((ym) => {
          months[ym] = null;
        });
        rows.push({
          project_id: emp.project_id,
          project_code: emp.project_code,
          project_name: emp.project_name,
          employee_id: emp.employee_id,
          full_name: emp.full_name,
          department_name: emp.department_name,
          labor_category: emp.labor_category,
          months,
          ymMap: { ...ymMap },
        });
      }
    });

    if (sectionEl) sectionEl.style.display = "block";
    renderRows(root);
    if (msgEl) msgEl.textContent = "";

    // Assign Employee to Project (creates a row; hours saved once user types)
    $("#assignEmployeeBtn", root).addEventListener("click", () => {
      const projId = projSel?.value || "";
      const empId = empSel?.value || "";
      if (!projId || !empId) {
        if (msgEl) msgEl.textContent = "Select both project and employee.";
        return;
      }

      const proj = projectScope.find((p) => p.id === projId);
      const emp = allEmployees.find((e) => e.id === empId);
      if (!proj || !emp) return;

      const key = `${projId}||${empId}`;
      const exists = rows.some(
        (r) => r.project_id === projId && r.employee_id === empId
      );
      if (exists) {
        if (msgEl) msgEl.textContent =
          "This employee is already on that project.";
        return;
      }

      const months = {};
      Object.values(ymMap).forEach((ym) => {
        months[ym] = null;
      });

      rows.push({
        project_id: proj.id,
        project_code: proj.project_code,
        project_name: proj.name,
        employee_id: emp.id,
        full_name: emp.full_name,
        department_name: emp.department_name,
        labor_category: emp.labor_category,
        months,
        ymMap: { ...ymMap },
      });

      renderRows(root);
      if (msgEl) msgEl.textContent = "Employee added to project. Enter hours in the grid.";
    });

    // Change events for hour cells
    $("#laborHoursTbody", root).addEventListener("change", async (evt) => {
      const target = evt.target;
      if (!target.classList.contains("cell-input-num")) return;

      const rowIdx = Number(target.dataset.row);
      if (Number.isNaN(rowIdx) || !rows[rowIdx]) return;
      const row = rows[rowIdx];

      const monthKey = target.dataset.month;
      const rawVal = target.value;
      const numVal =
        rawVal === "" ? null : Number.isNaN(Number(rawVal)) ? null : Number(rawVal);

      const ym = row.ymMap[monthKey];
      if (ym) row.months[ym] = numVal;

      // ensure visible value in the cell
      target.value = numVal === null ? "" : numVal.toString();

      const totalCell = root.querySelector(
        `[data-total-row="${rowIdx}"]`
      );
      if (totalCell) {
        totalCell.textContent = computeRowTotal(row).toLocaleString(
          undefined,
          {
            maximumFractionDigits: 2,
          }
        );
      }

      updateLaborTotals(root);
      await upsertHourCell(client, ctx, row, monthKey, numVal);
    });

    wireRowHighlight(root);
  },
};
