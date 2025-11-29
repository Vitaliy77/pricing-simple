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
  <article class="full-width-card">
    <!-- Compact inline header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="laborInlinePlan" class="font-medium"></span>
        <span id="laborInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Labor Hours
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Enter hours per month for all employees mapped to projects under the selected Level 1 project.
        </span>
      </div>
      <div
        id="laborHoursMessage"
        class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"
      ></div>
    </div>

    <section id="laborHoursSection" class="border-t border-slate-200" style="display:none;">
      <div class="px-4 py-2">
        <button id="addEmployeeRowBtn" class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Add Employee Row
        </button>
      </div>

      <div class="w-full max-h-[520px] overflow-auto overflow-x-auto">
        <table class="min-w-full text-xs table-fixed">
          <thead class="bg-slate-50">
            <tr>
              <th
                class="cost-grid-sticky cost-col-1 sticky top-0 z-30 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-3 py-1.5"
              >
                Project
              </th>
              <th
                class="cost-grid-sticky cost-col-2 sticky top-0 z-30 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-3 py-1.5"
              >
                Employee
              </th>
              <th
                class="cost-grid-sticky cost-col-3 sticky top-0 z-30 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-3 py-1.5"
              >
                Department / Labor Category
              </th>
              ${MONTHS.map(
                m => `
              <th class="sticky top-0 z-20 bg-slate-50 px-3 py-1.5 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                ${m.label}
              </th>`
              ).join("")}
              <th class="sticky top-0 z-20 bg-slate-50 px-3 py-1.5 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Total Hrs
              </th>
            </tr>
          </thead>
          <tbody id="laborHoursTbody" class="bg-white divide-y divide-slate-100">
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

// rows: one per (project, employee)
let rows = []; // { project_id, project_code, project_name, employee_id, full_name, department_name, labor_category, months: {ym: hours}, ymMap }
let projectScope = []; // [{ id, project_code, name }]
let availableEmployees = []; // [{ project_id, project_code, project_name, employee_id, full_name, department_name, labor_category }]

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  if (Number.isNaN(num)) return "";
  return num.toString();
}

function computeTotal(row) {
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

// project scope from Level 1: parent + all children
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

// Employees mapped to any project in scope
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

  // Unique by (project_id, employee_id)
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

// Existing hours from project_labor_hours
async function loadHours(client, projectIds, ctx) {
  if (!projectIds.length) return [];
  const { year, versionId, planType } = ctx;

  const { data, error } = await client
    .from("project_labor_hours")
    .select(`
      project_id,
      employee_id,
      plan_year,
      plan_version_id,
      plan_type,
      ym,
      hours,
      employees (
        full_name,
        department_name,
        labor_categories ( labor_category )
      ),
      projects (
        project_code,
        name
      )
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
  const byKey = new Map(); // key = project_id||employee_id

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

function renderRows(root) {
  const tbody = $("#laborHoursTbody", root);
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16" class="text-center py-10 text-slate-500 text-xs">
          No employees assigned yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = idx.toString();
    const total = computeTotal(row);

    const monthCells = MONTHS.map((m) => {
      const ym = row.ymMap[m.key];
      const val = row.months[ym];
      return `
        <td class="px-3 py-1 text-right">
          <input
            class="cell-input cell-input-num w-full text-right border border-slate-200 rounded-sm px-1 py-0.5"
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
      <td class="cost-grid-sticky cost-col-1 px-3 py-1 text-[11px] font-medium text-slate-900">
        ${row.project_code || ""}
      </td>
      <td class="cost-grid-sticky cost-col-2 px-3 py-1 text-[11px] text-slate-800">
        ${row.full_name || ""}
      </td>
      <td class="cost-grid-sticky cost-col-3 px-3 py-1 text-[11px] text-slate-600">
        ${row.department_name || ""}${
          row.labor_category ? ` · ${row.labor_category}` : ""
        }
      </td>
      ${monthCells}
      <td class="px-3 py-1 text-right text-[11px] font-semibold text-slate-900" data-total-row="${idx}">
        ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
    `;

    tbody.appendChild(tr);
  });
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

    // Level-1 scope
    projectScope = await getProjectScope(client, ctx.level1ProjectId);
    const projectIds = projectScope.map((p) => p.id);

    const ymMap = buildYmMap(ctx.year);

    availableEmployees = await loadAvailableEmployees(client, projectIds);
    rows = await loadHours(client, projectIds, ctx);

    // Ensure rows exist for all mapped employees
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

    // Add Employee Row: blank row (user can type hours, auto-saves per cell
    $("#addEmployeeRowBtn", root).addEventListener("click", () => {
      if (!projectScope.length) return;
      const firstProj = projectScope[0];
      const months = {};
      Object.values(ymMap).forEach((ym) => {
        months[ym] = null;
      });
      rows.push({
        project_id: firstProj.id,
        project_code: firstProj.project_code,
        project_name: firstProj.name,
        employee_id: null,
        full_name: "",
        department_name: "",
        labor_category: "",
        months,
        ymMap: { ...ymMap },
      });
      renderRows(root);
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

      const totalCell = root.querySelector(
        `[data-total-row="${rowIdx}"]`
      );
      if (totalCell) {
        totalCell.textContent = computeTotal(row).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });
      }

      await upsertHourCell(client, ctx, row, monthKey, numVal);
    });
  },
};
