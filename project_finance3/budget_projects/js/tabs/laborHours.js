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
  <article>
    <h3 style="margin-bottom:0.5rem;">Labor Hours</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;color:#475569;">
      Enter <strong>hours</strong> per month for employees on the selected project and plan.
      Cost will be calculated separately from hourly cost rates.
    </p>

    <p id="laborHoursMessage"
       style="min-height:1.25rem;font-size:0.85rem;color:#64748b;margin-bottom:0.5rem;"></p>

    <p id="laborHoursProjectLabel"
       style="font-size:0.85rem;color:#0f172a;margin-bottom:0.75rem;"></p>

    <section id="laborHoursSection" style="display:none;">
      <div style="margin-bottom:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button id="addEmployeeRowBtn" class="btn-primary">+ Add Employee</button>
      </div>

      <div class="full-width-card">
        <div class="cost-table-wrapper">
          <table class="cost-table">
            <thead>
              <tr>
                <th class="sticky-col">Employee</th>
                <th class="sticky-col-2">Department</th>
                <th class="sticky-col-3">Labor Category</th>
                ${MONTHS.map(m => `<th>${m.label}</th>`).join("")}
                <th>Total Hrs</th>
              </tr>
            </thead>
            <tbody id="laborHoursTbody">
              <tr>
                <td colspan="16" style="text-align:left;font-size:0.9rem;color:#64748b;">
                  Loading…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </article>
`;

// in-memory state: one row per employee
let rows = []; // [{ employee_id, full_name, department_name, labor_category, months: { ym: hours }, ymMap: {monthKey: ym} }]
let availableEmployees = []; // employees assigned to this project

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

// build ym for each month of the plan year
function buildYmMap(year) {
  const map = {};
  MONTHS.forEach((m) => {
    const monthIndex = m.idx; // 0-11
    const d = new Date(Date.UTC(year, monthIndex, 1));
    const ym = d.toISOString().slice(0, 10); // YYYY-MM-DD
    map[m.key] = ym;
  });
  return map;
}

async function loadAvailableEmployees(client, projectId) {
  // employees explicitly assigned to this project
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

  const list = [];
  (data || []).forEach((row) => {
    const e = row.employees;
    if (!e) return;
    list.push({
      id: e.id,
      full_name: e.full_name,
      department_name: e.department_name,
      labor_category: e.labor_categories?.labor_category || "",
    });
  });

  // unique by employee id
  const uniq = new Map();
  list.forEach((e) => uniq.set(e.id, e));
  return Array.from(uniq.values()).sort((a, b) =>
    a.full_name.localeCompare(b.full_name)
  );
}

async function loadHours(client, projectId, ctx) {
  const { year, versionId, planType } = ctx;
  const ymMap = buildYmMap(year);

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
      )
    `)
    .eq("project_id", projectId)
    .eq("plan_year", year)
    .eq("plan_version_id", versionId)
    .eq("plan_type", planType || "Working");

  if (error) {
    console.error("[laborHours] loadHours error", error);
    return [];
  }

  const byEmp = new Map(); // employee_id -> row
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
    const row = byEmp.get(empId);
    const ymStr = r.ym;
    row.months[ymStr] = Number(r.hours || 0);
  });

  // ensure all ym keys present
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
    tbody.innerHTML = `
      <tr>
        <td colspan="16" style="text-align:left;font-size:0.9rem;color:#64748b;">
          No labor hours yet. Use “+ Add Employee” to start.
        </td>
      </tr>
    `;
    return;
  }

  const optionList = availableEmployees
    .map(
      (e) => `
        <option value="${e.id}">${e.full_name}</option>
      `
    )
    .join("");

  tbody.innerHTML = "";

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = idx.toString();
    const total = computeTotal(row);

    const monthCells = MONTHS.map((m) => {
      const ym = row.ymMap[m.key];
      const val = row.months[ym];
      return `
        <td>
          <input
            class="cell-input cell-input-num"
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
      <td class="sticky-col">
        <select
          class="cell-input"
          data-row="${idx}"
          data-field="employee_id"
        >
          <option value="">— Select —</option>
          ${optionList}
        </select>
      </td>
      <td class="sticky-col-2">
        <input
          class="cell-input"
          data-row="${idx}"
          data-field="department_name"
          type="text"
          readonly
          value="${row.department_name || ""}"
        />
      </td>
      <td class="sticky-col-3">
        <input
          class="cell-input"
          data-row="${idx}"
          data-field="labor_category"
          type="text"
          readonly
          value="${row.labor_category || ""}"
        />
      </td>
      ${monthCells}
      <td class="text-right text-xs text-slate-600" data-total-row="${idx}">
        ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
    `;

    // set selected employee in dropdown
    const select = tr.querySelector('select[data-field="employee_id"]');
    if (select && row.employee_id) {
      select.value = row.employee_id;
    }

    tbody.appendChild(tr);
  });
}

async function upsertHourCell(client, ctx, projectId, row, monthKey, hoursValue) {
  if (!row.employee_id) return; // nothing to persist yet

  const ym = row.ymMap[monthKey];
  if (!ym) return;

  const payload = {
    project_id: projectId,
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
    const labelEl = $("#laborHoursProjectLabel", root);
    const sectionEl = $("#laborHoursSection", root);

    const projectId = getSelectedProjectId();
    const ctx = getPlanContext();

    if (!projectId) {
      if (msgEl) msgEl.textContent = "No project selected. Please go to the Projects tab.";
      if (sectionEl) sectionEl.style.display = "none";
      return;
    }
    if (!ctx.year || !ctx.versionId) {
      if (msgEl) {
        msgEl.textContent =
          "Plan not fully selected. Please complete selection in the Projects tab.";
      }
      if (sectionEl) sectionEl.style.display = "none";
      return;
    }

    if (labelEl) {
      labelEl.textContent = `Labor hours for project ${projectId} · ${ctx.year} · ${
        ctx.planType || "Working"
      }`;
    }

    if (msgEl) msgEl.textContent = "Loading employees and hours…";

    const ymMap = buildYmMap(ctx.year);
    availableEmployees = await loadAvailableEmployees(client, projectId);
    rows = await loadHours(client, projectId, ctx);

    // any row missing ymMap? attach
    rows.forEach((r) => {
      if (!r.ymMap) r.ymMap = { ...ymMap };
    });

    if (sectionEl) sectionEl.style.display = "block";
    renderRows(root);
    if (msgEl) msgEl.textContent = "";

    // Add employee button
    $("#addEmployeeRowBtn", root).addEventListener("click", () => {
      const newRow = {
        employee_id: "",
        full_name: "",
        department_name: "",
        labor_category: "",
        months: {},
        ymMap: { ...ymMap },
      };
      Object.values(newRow.ymMap).forEach((ym) => {
        newRow.months[ym] = null;
      });
      rows.push(newRow);
      renderRows(root);
    });

    // Delegated events for select + inputs
    $("#laborHoursTbody", root).addEventListener("change", async (evt) => {
      const target = evt.target;
      const rowIdx = Number(target.dataset.row);
      if (Number.isNaN(rowIdx) || !rows[rowIdx]) return;
      const row = rows[rowIdx];

      // employee selection
      if (target.tagName === "SELECT" && target.dataset.field === "employee_id") {
        const empId = target.value || "";
        row.employee_id = empId;

        const emp = availableEmployees.find((e) => e.id === empId);
        row.full_name = emp?.full_name || "";
        row.department_name = emp?.department_name || "";
        row.labor_category = emp?.labor_category || "";

        // update readonly fields
        const tr = target.closest("tr");
        if (tr) {
          const deptInput = tr.querySelector('input[data-field="department_name"]');
          const catInput = tr.querySelector('input[data-field="labor_category"]');
          if (deptInput) deptInput.value = row.department_name || "";
          if (catInput) catInput.value = row.labor_category || "";
        }
        return;
      }

      // hour cell
      if (target.classList.contains("cell-input-num")) {
        const monthKey = target.dataset.month;
        const rawVal = target.value;
        const numVal =
          rawVal === "" ? null : Number.isNaN(Number(rawVal)) ? null : Number(rawVal);
        // update memory
        const ym = row.ymMap[monthKey];
        if (ym) row.months[ym] = numVal;
        // recompute total
        const totalCell = root.querySelector(
          `[data-total-row="${rowIdx}"]`
        );
        if (totalCell) {
          totalCell.textContent = computeTotal(row).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          });
        }
        // persist
        await upsertHourCell(client, ctx, projectId, row, monthKey, numVal);
      }
    });
  },
};
