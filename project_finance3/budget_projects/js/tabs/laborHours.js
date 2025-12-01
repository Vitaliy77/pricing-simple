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

      /* smaller, right-aligned entry cells */
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
      .no-spin {
        -moz-appearance: textfield;
      }

      /* Fixed widths for sticky columns */
      .labor-col-project { width: 11rem; }
      .labor-col-employee { width: 13rem; }
      .labor-col-dept { width: 18rem; }

      .labor-sticky-1,
      .labor-sticky-2,
      .labor-sticky-3 {
        position: sticky;
        z-index: 30;
      }
      .labor-sticky-1 { left: 0; }
      .labor-sticky-2 { left: 11rem; }
      /* nudge a bit so Jan doesn't sit under the last sticky col */
      .labor-sticky-3 { left: 25rem; }

      /* opaque sticky backgrounds */
      .labor-table thead .labor-sticky-1,
      .labor-table thead .labor-sticky-2,
      .labor-table thead .labor-sticky-3 {
        background-color: #f8fafc;
        z-index: 40;
      }
      .labor-table tbody .labor-sticky-1,
      .labor-table tbody .labor-sticky-2,
      .labor-table tbody .labor-sticky-3 {
        background-color: #ffffff;
        z-index: 35;
        border-right: 1px solid #e2e8f0;
      }

      /* striping + active row */
      .labor-row-striped:nth-child(odd) {
        background-color: #eff6ff;
      }
      .labor-row-striped:nth-child(even) {
        background-color: #ffffff;
      }
      .labor-row-striped:hover {
        background-color: #dbeafe;
      }
      .labor-row-active {
        background-color: #bfdbfe !important;
      }

      .labor-summary-row {
        background-color: #e5e7eb;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 20;
      }
    </style>

    <!-- Compact header -->
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
          class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm
                 bg-blue-600 hover:bg-blue-700 text-white"
        >
          + Assign Employee to Project
        </button>
      </div>

      <div class="w-full max-h-[520px] overflow-y-auto overflow-x-auto">
        <table class="labor-table text-xs">
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
              ${MONTHS
                .map(
                  (m) => `
                <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                  ${m.label}
                </th>`
                )
                .join("")}
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
let projectScope = [];      // [{id, project_code, name}]
let rows = [];              // grid rows
let allEmployees = [];      // for dropdown

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  return Number.isNaN(num) ? "" : num.toString();
}

function computeRowTotal(row) {
  return Object.values(row.months || {}).reduce(
    (sum, v) => sum + (Number(v || 0) || 0),
    0
  );
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
// RENDER GRID
// ─────────────────────────────────────────────
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
    tr.dataset.rowIndex = idx;
    tr.className = "labor-row-striped";
    const total = computeRowTotal(row);

    const monthCells = MONTHS.map((m) => {
      const ym = row.ymMap[m.key];
      const val = row.months[ym];
      return `
        <td class="text-right">
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

  // Summary row at the bottom
  const summaryTr = document.createElement("tr");
  summaryTr.dataset.summaryRow = "labor";
  summaryTr.className = "labor-summary-row";
  summaryTr.innerHTML = `
    <td class="text-[11px] font-semibold text-slate-900" colspan="3">Totals</td>
    ${MONTHS.map(
      (m) =>
        `<td class="text-right text-[11px]" data-total-col="${m.key}"></td>`
    ).join("")}
    <td class="text-right text-[11px] font-semibold" data-total-col="all"></td>
  `;
  tbody.appendChild(summaryTr);
}

function updateLaborTotals(root) {
  const summaryRow = root.querySelector("tr[data-summary-row='labor']");
  if (!summaryRow || !rows.length) return;

  const monthTotals = {};
  MONTHS.forEach((m) => (monthTotals[m.key] = 0));
  let grand = 0;

  rows.forEach((row) => {
    MONTHS.forEach((m) => {
      const val = Number(row.months[row.ymMap[m.key]] || 0);
      if (!Number.isNaN(val)) {
        monthTotals[m.key] += val;
        grand += val;
      }
    });
  });

  MONTHS.forEach((m) => {
    const cell = summaryRow.querySelector(`[data-total-col="${m.key}"]`);
    if (cell)
      cell.textContent = monthTotals[m.key].toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
  });

  const grandCell = summaryRow.querySelector('[data-total-col="all"]');
  if (grandCell)
    grandCell.textContent = grand.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
}

// wire up events after render
function wireGridEvents(root, client, ctx) {
  const tbody = $("#laborHoursTbody", root);
  if (!tbody) return;

  // cell edits
  tbody.querySelectorAll("input[data-row][data-month]").forEach((inp) => {
    inp.addEventListener("change", async (e) => {
      const rowIdx = Number(e.target.dataset.row);
      const monthKey = e.target.dataset.month;
      if (Number.isNaN(rowIdx) || !monthKey) return;

      const row = rows[rowIdx];
      if (!row) return;
      const ym = row.ymMap[monthKey];

      const raw = e.target.value;
      const val =
        raw === "" || raw === null ? null : Number.parseFloat(raw || "0");
      row.months[ym] = Number.isNaN(val) ? null : val;

      // update row total
      const totalCell = root.querySelector(`[data-total-row="${rowIdx}"]`);
      if (totalCell)
        totalCell.textContent = computeRowTotal(
          row
        ).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });

      updateLaborTotals(root);
      await upsertHourCell(client, ctx, row, monthKey, row.months[ym]);
    });
  });

  // row highlight
  tbody.querySelectorAll("tr.labor-row-striped").forEach((tr) => {
    tr.addEventListener("click", () => {
      tbody
        .querySelectorAll("tr.labor-row-striped")
        .forEach((r) => r.classList.remove("labor-row-active"));
      tr.classList.add("labor-row-active");
    });
  });
}

// ─────────────────────────────────────────────
// DATA LOAD HELPERS
// ─────────────────────────────────────────────
async function getProjectScope(client, level1ProjectId) {
  if (!level1ProjectId) return [];

  const { data: parent, error: pErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (pErr || !parent) {
    console.error("[LaborHours] load parent project error", pErr);
    return [];
  }

  const { data: children, error: cErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (cErr) {
    console.error("[LaborHours] load child projects error", cErr);
    return [parent];
  }

  return [parent, ...(children || [])];
}

async function loadAllEmployees(client) {
  const { data, error } = await client
    .from("employees")
    .select("id, full_name, employee_id")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[LaborHours] load employees error", error);
    allEmployees = [];
    return;
  }

  allEmployees =
    data?.map((e) => ({
      id: e.id,
      label: `${e.full_name} (${e.employee_id})`,
    })) || [];
}

async function loadHours(client, projectIds, ctx) {
  rows = [];
  if (!projectIds?.length) return;

  // 1) assignments
  const { data: assignData, error: assignErr } = await client
    .from("project_employee_assignments")
    .select("project_id, employee_id")
    .in("project_id", projectIds);

  if (assignErr) {
    console.error("[LaborHours] assignments error", assignErr);
    return;
  }

  if (!assignData?.length) {
    rows = [];
    return;
  }

  const employeeIds = [
    ...new Set(assignData.map((a) => a.employee_id).filter(Boolean)),
  ];

  // 2) employees
  const { data: empData, error: empErr } = await client
    .from("employees")
    .select("id, full_name, department_name, labor_category_id")
    .in("id", employeeIds);

  if (empErr) {
    console.error("[LaborHours] employees error", empErr);
    return;
  }

  // 3) labor categories
  const { data: lcData, error: lcErr } = await client
    .from("labor_categories")
    .select("id, labor_category");

  if (lcErr) {
    console.error("[LaborHours] labor_categories error", lcErr);
    return;
  }

  const laborCatMap = new Map(
    (lcData || []).map((l) => [l.id, l.labor_category])
  );

  // 4) projects
  const { data: projData, error: projErr } = await client
    .from("projects")
    .select("id, project_code")
    .in("id", projectIds);

  if (projErr) {
    console.error("[LaborHours] projects error", projErr);
    return;
  }

  const projMap = new Map(
    (projData || []).map((p) => [p.id, p.project_code])
  );

  // 5) existing hours
  const { data: hoursData, error: hoursErr } = await client
    .from("labor_hours")
    .select("project_id, employee_id, ym, hours")
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (hoursErr) {
    console.error("[LaborHours] labor_hours error", hoursErr);
    return;
  }

  const hoursMap = new Map(); // key -> { ym: hours }
  (hoursData || []).forEach((r) => {
    const key = `${r.project_id}|${r.employee_id}`;
    let months = hoursMap.get(key);
    if (!months) {
      months = {};
      hoursMap.set(key, months);
    }
    months[r.ym] = Number(r.hours || 0);
  });

  const empMap = new Map((empData || []).map((e) => [e.id, e]));
  const ymMap = buildYmMap(ctx.year);

  rows =
    assignData
      ?.map((a) => {
        const emp = empMap.get(a.employee_id);
        if (!emp) return null;

        const key = `${a.project_id}|${a.employee_id}`;
        const monthValues = { ...(hoursMap.get(key) || {}) };

        // ensure all months exist
        Object.values(ymMap).forEach((ym) => {
          if (!(ym in monthValues)) monthValues[ym] = null;
        });

        return {
          project_id: a.project_id,
          employee_id: a.employee_id,
          project_code: projMap.get(a.project_id) || "",
          full_name: emp.full_name,
          department_name: emp.department_name,
          labor_category: laborCatMap.get(emp.labor_category_id) || "",
          ymMap,
          months: monthValues,
        };
      })
      .filter(Boolean) || [];
}

// upsert/delete one cell in labor_hours
async function upsertHourCell(client, ctx, row, monthKey, hoursValue) {
  const ym = row.ymMap[monthKey];
  if (!ym) return;

  if (hoursValue === null || hoursValue === undefined || hoursValue === "") {
    // delete row for that month
    const { error } = await client
      .from("labor_hours")
      .delete()
      .eq("project_id", row.project_id)
      .eq("employee_id", row.employee_id)
      .eq("ym", ym)
      .eq("plan_year", ctx.year)
      .eq("plan_version_id", ctx.versionId)
      .eq("plan_type", ctx.planType || "Working");
    if (error) console.error("[LaborHours] delete hour error", error);
    return;
  }

  const v = Number(hoursValue);
  if (Number.isNaN(v)) return;

  const { error } = await client.from("labor_hours").upsert(
    {
      project_id: row.project_id,
      employee_id: row.employee_id,
      ym,
      hours: v,
      plan_year: ctx.year,
      plan_version_id: ctx.versionId,
      plan_type: ctx.planType || "Working",
    },
    {
      onConflict:
        "project_id,employee_id,ym,plan_year,plan_version_id,plan_type",
    }
  );

  if (error) console.error("[LaborHours] upsert hour error", error);
}

// ─────────────────────────────────────────────
// MAIN INIT
// ─────────────────────────────────────────────
export const laborHoursTab = {
  template,
  async init({ root, client }) {
    const msg = $("#laborHoursMessage", root);
    const section = $("#laborHoursSection", root);
    const ctx = getPlanContext();

    const planEl = $("#laborInlinePlan", root);
    const projEl = $("#laborInlineProject", root);

    planEl.textContent =
      ctx?.planLabel ||
      (ctx?.year
        ? `BUDGET – ${ctx.year} · ${ctx.planType || "Working"}`
        : "Labor Hours");
    if (ctx?.level1ProjectCode && ctx?.level1ProjectName) {
      planEl.textContent += ` · Level 1 Project: ${ctx.level1ProjectCode} – ${ctx.level1ProjectName}`;
    }
    if (ctx?.projectCode && ctx?.projectName) {
      projEl.textContent = `, ${ctx.projectCode} – ${ctx.projectName}`;
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg.textContent =
        "Please select a Level 1 project and plan on the Projects tab.";
      if (section) section.style.display = "none";
      return;
    }

    section.style.display = "block";
    msg.textContent = "Loading employees and hours…";

    // 1) load project scope and populate project dropdown
    projectScope = await getProjectScope(client, ctx.level1ProjectId);
    const projectSelect = $("#laborProjectSelect", root);
    projectSelect.innerHTML = `<option value="">— Select project —</option>`;
    projectScope.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.project_code} – ${p.name}`;
      projectSelect.appendChild(opt);
    });

    // pick current project if in scope
    if (ctx.projectId && projectScope.some((p) => p.id === ctx.projectId)) {
      projectSelect.value = ctx.projectId;
    }

    // 2) load global employee list for dropdown
    await loadAllEmployees(client);
    const empSelect = $("#laborEmployeeSelect", root);
    empSelect.innerHTML = `<option value="">— Select employee —</option>`;
    allEmployees.forEach((e) => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.label;
      empSelect.appendChild(opt);
    });

    const projectIds = projectScope.map((p) => p.id);

    // 3) load existing hours grid
    await loadHours(client, projectIds, ctx);
    renderRows(root);
    updateLaborTotals(root);
    wireGridEvents(root, client, ctx);
    msg.textContent = rows.length
      ? ""
      : "No employees assigned yet. Use the controls above to add employees.";

    // 4) assignment button
    $("#assignEmployeeBtn", root)?.addEventListener("click", async () => {
      const projId = projectSelect.value || null;
      const empId = empSelect.value || null;

      if (!projId || !empId) {
        msg.textContent = "Select both a project and an employee.";
        return;
      }

      try {
        const payload = {
          project_id: projId,
          employee_id: empId,
          allocation_pct: 100,
          start_date: `${ctx.year}-01-01`,
          end_date: `${ctx.year}-12-31`,
        };

        const { error } = await client
          .from("project_employee_assignments")
          .insert(payload);

        if (error) {
          console.error("[LaborHours] assign employee error", error);
          msg.textContent =
            "Employee may already be assigned to this project, or an error occurred.";
        } else {
          msg.textContent =
            "Employee added to project. Enter hours in the grid.";
        }

        // reload grid
        await loadHours(client, projectIds, ctx);
        renderRows(root);
        updateLaborTotals(root);
        wireGridEvents(root, client, ctx);
      } catch (e) {
        console.error("[LaborHours] assign employee exception", e);
        msg.textContent = "Error assigning employee to project.";
      }
    });
  },
};
