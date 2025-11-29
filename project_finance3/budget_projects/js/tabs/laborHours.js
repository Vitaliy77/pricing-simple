// js/tabs/laborHours.js
import { $, h } from "../lib/dom.js";
import { getSelectedProjectId, getPlanContext } from "../lib/projectContext.js";

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
  <article class="full-width-card p-6">
    <h3 class="text-2xl font-bold text-slate-900 mb-4">Labor Hours</h3>
    <p class="text-sm text-slate-600 mb-6">
      Enter <strong>hours</strong> per month for employees on the selected project and plan.
      Cost will be calculated separately from hourly cost rates.
    </p>

    <p id="laborHoursMessage" class="text-sm text-slate-600 mb-4 min-h-6"></p>
    <p id="laborHoursProjectLabel" class="text-sm font-medium text-slate-800 mb-6"></p>

    <section id="laborHoursSection" class="hidden">
      <div class="mb-6">
        <button id="addEmployeeRowBtn" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition">
          + Add Employee
        </button>
      </div>

      <div class="overflow-x-auto -mx-6">
        <div class="inline-block min-w-full align-middle">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr>
                <th class="cost-grid-sticky cost-col-1 px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Employee</th>
                <th class="cost-grid-sticky cost-col-2 px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Department</th>
                <th class="cost-grid-sticky cost-col-3 px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Labor Category</th>
                ${MONTHS.map(m => `<th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">${m.label}</th>`).join("")}
                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Total Hrs</th>
              </tr>
            </thead>
            <tbody id="laborHoursTbody" class="bg-white divide-y divide-slate-200">
              <tr><td colspan="16" class="text-center py-12 text-slate-500">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </article>
`;

// in-memory state
let rows = [];
let availableEmployees = [];

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  return Number.isNaN(num) ? "" : num.toString();
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
    map[m.key] = d.toISOString().slice(0, 10); // YYYY-MM-DD
  });
  return map;
}

async function loadAvailableEmployees(client, projectId) {
  const { data, error } = await client
    .from("project_employee_assignments")
    .select(`
      employee_id,
      employees ( id, full_name, department_name, labor_categories ( labor_category ) )
    `)
    .eq("project_id", projectId);

  if (error) {
    console.error("[laborHours] loadAvailableEmployees error", error);
    return [];
  }

  const uniq = new Map();
  (data || []).forEach((row) => {
    const e = row.employees;
    if (e) {
      uniq.set(e.id, {
        id: e.id,
        full_name: e.full_name || "",
        department_name: e.department_name || "",
        labor_category: e.labor_categories?.labor_category || "",
      });
    }
  });

  return Array.from(uniq.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function loadHours(client, projectId, ctx) {
  const { year, versionId, planType } = ctx;
  const ymMap = buildYmMap(year);

  const { data, error } = await client
    .from("project_labor_hours")
    .select(`
      project_id, employee_id, plan_year, plan_version_id, plan_type, ym, hours,
      employees ( full_name, department_name, labor_categories ( labor_category ) )
    `)
    .eq("project_id", projectId)
    .eq("plan_year", year)
    .eq("plan_version_id", versionId)
    .eq("plan_type", planType || "Working");

  if (error) {
    console.error("[laborHours] loadHours error", error);
    return [];
  }

  const byEmp = new Map();
  (data || []).forEach((r) => {
    const empId = r.employee_id;
    if (!byEmp.has(empId)) {
      const emp = r.employees || {};
      byEmp.set(empId, {
        employee_id: empId,
        full_name: emp.full_name || "",
        department_name: emp.department_name || "",
        labor_category: emp.labor_categories?.labor_category || "",
        months: {},
        ymMap: { ...ymMap },
      });
    }
    byEmp.get(empId).months[r.ym] = Number(r.hours || 0);
  });

  const result = Array.from(byEmp.values());
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
    tbody.innerHTML = `<tr><td colspan="16" class="text-center py-12 text-slate-500 text-sm">No employees assigned yet.</td></tr>`;
    return;
  }

  const optionList = availableEmployees.map(e => 
    `<option value="${e.id}">${e.full_name}</option>`
  ).join("");

  tbody.innerHTML = "";

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = idx;
    const total = computeTotal(row);

    const monthCells = MONTHS.map(m => {
      const ym = row.ymMap[m.key];
      const val = row.months[ym];
      return `
        <td class="px-1">
          <input class="w-16 px-2 py-1 text-right text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                 data-row="${idx}" data-month="${m.key}" type="number" step="0.01" value="${fmtNum(val)}">
        </td>
      `;
    }).join("");

    tr.innerHTML = `
      <td class="cost-grid-sticky cost-col-1 px-4 py-3">
        <select class="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-row="${idx}" data-field="employee_id">
          <option value="">— Select —</option>
          ${optionList}
        </select>
      </td>
      <td class="cost-grid-sticky cost-col-2 px-4 py-3 text-sm text-slate-700">${row.department_name || ""}</td>
      <td class="cost-grid-sticky cost-col-3 px-4 py-3 text-sm text-slate-600 italic">${row.labor_category || ""}</td>
      ${monthCells}
      <td class="px-4 py-3 text-right font-medium text-slate-900 bg-slate-50">${total.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
    `;

    const select = tr.querySelector('select[data-field="employee_id"]');
    if (select && row.employee_id) select.value = row.employee_id;

    tbody.appendChild(tr);
  });
}

async function upsertHourCell(client, ctx, projectId, row, monthKey, value) {
  if (!row.employee_id) return;
  const ym = row.ymMap[monthKey];
  if (!ym) return;

  const payload = {
    project_id: projectId,
    employee_id: row.employee_id,
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
    plan_type: ctx.planType || "Working",
    ym,
    hours: value === "" || value === null ? 0 : Number(value),
  };

  const { error } = await client
    .from("project_labor_hours")
    .upsert(payload, { onConflict: "project_id,employee_id,plan_version_id,plan_type,ym" });

  if (error) console.error("[laborHours] upsert error", error);
}

export const laborHoursTab = {
  template,
  async init({ root, client }) {
    const msgEl = $("#laborHoursMessage", root);
    const labelEl = $("#laborHoursProjectLabel", root);
    const sectionEl = $("#laborHoursSection", root);

    const projectId = getSelectedProjectId();
    const ctx = getPlanContext();

    if (!projectId || !ctx.year || !ctx.versionId) {
      msgEl && (msgEl.textContent = "Please select a project and plan first.");
      sectionEl && (sectionEl.classList.add("hidden"));
      return;
    }

    labelEl && (labelEl.textContent = `Labor hours · Project ${projectId} · ${ctx.year} · ${ctx.planType || "Working"}`);
    msgEl && (msgEl.textContent = "Loading employees and hours…");

    const ymMap = buildYmMap(ctx.year);

    availableEmployees = await loadAvailableEmployees(client, projectId);
    rows = await loadHours(client, projectId, ctx);

    // ——— REPLACED BLOCK ———
    const existingIds = new Set(rows.map(r => r.employee_id).filter(Boolean));

    // Ensure all existing rows have full ymMap + months
    rows.forEach((r) => {
      if (!r.ymMap) r.ymMap = { ...ymMap };
      Object.values(r.ymMap).forEach((ym) => {
        if (!(ym in r.months)) r.months[ym] = null;
      });
    });

    // AUTO-CREATE rows for employees who are assigned but have no hours yet
    availableEmployees.forEach((emp) => {
      if (!existingIds.has(emp.id)) {
        const months = {};
        Object.values(ymMap).forEach((ym) => {
          months[ym] = null;
        });
        rows.push({
          employee_id: emp.id,
          full_name: emp.full_name,
          department_name: emp.department_name,
          labor_category: emp.labor_category,
          months,
          ymMap: { ...ymMap },
        });
      }
    });
    // ——— END REPLACED BLOCK ———

    sectionEl && sectionEl.classList.remove("hidden");
    renderRows(root);
    msgEl && (msgEl.textContent = "");

    // Add row button
    $("#addEmployeeRowBtn", root)?.addEventListener("click", () => {
      const months = {};
      Object.values(ymMap).forEach((ym) => months[ym] = null);
      rows.push({
        employee_id: "", full_name: "", department_name: "", labor_category: "",
        months, ymMap: { ...ymMap }
      });
      renderRows(root);
    });

    // Event delegation
    $("#laborHoursTbody", root)?.addEventListener("change", async (e) => {
      const t = e.target;
      const rowIdx = Number(t.dataset.row);
      if (Number.isNaN(rowIdx) || !rows[rowIdx]) return;
      const row = rows[rowIdx];

      if (t.dataset.field === "employee_id") {
        const empId = t.value;
        row.employee_id = empId;
        const emp = availableEmployees.find(e => e.id === empId);
        if (emp) {
          row.full_name = emp.full_name;
          row.department_name = emp.department_name;
          row.labor_category = emp.labor_category;
        }
        renderRows(root);
        return;
      }

      if (t.dataset.month) {
        const monthKey = t.dataset.month;
        const val = t.value === "" ? null : Number(t.value);
        const ym = row.ymMap[monthKey];
        if (ym) row.months[ym] = val;
        renderRows(root);
        await upsertHourCell(client, ctx, projectId, row, monthKey, val);
      }
    });
  },
};
