// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

let _costProjectIds = [];
let _projectMeta = {};

const MONTH_FIELDS = [
  { col: "amt_jan", idx: 0, label: "Jan" },
  { col: "amt_feb", idx: 1, label: "Feb" },
  { col: "amt_mar", idx: 2, label: "Mar" },
  { col: "amt_apr", idx: 3, label: "Apr" },
  { col: "amt_may", idx: 4, label: "May" },
  { col: "amt_jun", idx: 5, label: "Jun" },
  { col: "amt_jul", idx: 6, label: "Jul" },
  { col: "amt_aug", idx: 7, label: "Aug" },
  { col: "amt_sep", idx: 8, label: "Sep" },
  { col: "amt_oct", idx: 9, label: "Oct" },
  { col: "amt_nov", idx: 10, label: "Nov" },
  { col: "amt_dec", idx: 11, label: "Dec" },
];

export const template = /*html*/ `
  <article class="full-width-card">
    <!-- Compact inline header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div
        class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700"
      >
        <span id="costInlinePlan" class="font-medium"></span>
        <span id="costInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Cost Budget
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Cost summary for all projects under the selected Level 1 project:
          labor (hours × rates), subcontractors, and other direct costs.
        </span>
      </div>

      <div
        id="costMessage"
        class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"
      ></div>
    </div>

    <!-- TABLE WRAPPER: fixed height, only grid scrolls -->
    <div class="border-t border-slate-200">
      <div class="w-full max-h-[520px] overflow-auto overflow-x-auto">
        <table id="costTable" class="min-w-full text-xs">
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
                Person / Vendor / Category
              </th>
              <th
                class="cost-grid-sticky cost-col-3 sticky top-0 z-30 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-3 py-1.5"
              >
                Role / Description
              </th>
              ${MONTH_FIELDS.map(
                m => `
                  <th class="sticky top-0 z-20 bg-slate-50 px-3 py-1.5 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                    ${m.label}
                  </th>`
              ).join("")}
              <th class="sticky top-0 z-20 bg-slate-50 px-3 py-1.5 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>
          <tbody
            id="costBody"
            class="bg-white divide-y divide-slate-100"
          >
            <tr>
              <td colspan="16" class="text-center py-10 text-slate-500 text-xs">
                Loading…
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </article>
`;

export const costBudgetTab = {
  template,
  async init({ root, client }) {
    const msg = $("#costMessage", root);
    const ctx = getPlanContext();

    // Inline header from global header elements
    const globalPlan =
      document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    const globalProject =
      document.querySelector("#currentProject")?.textContent?.trim() || "";

    const planSpan = $("#costInlinePlan", root);
    const projSpan = $("#costInlineProject", root);

    if (planSpan) planSpan.textContent = globalPlan;
    if (projSpan) {
      if (globalProject) {
        projSpan.textContent = `, ${globalProject}`;
      } else {
        projSpan.textContent = "";
      }
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg && (msg.textContent = "Please select a Level 1 project and plan first.");
      renderCost(root, null);
      return;
    }

    await loadProjectsUnderLevel1(root, client, ctx.level1ProjectId);
    await refreshCost(root, client);
  },
};

// ─────────────────────────────────────────────
// LOAD ALL PROJECTS UNDER LEVEL 1
// ─────────────────────────────────────────────
async function loadProjectsUnderLevel1(root, client, level1ProjectId) {
  const msg = $("#costMessage", root);
  _costProjectIds = [];
  _projectMeta = {};

  const { data: parent, error: parentError } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (parentError || !parent) {
    console.error("[CostBudget] Error loading parent project", parentError);
    msg && (msg.textContent = "Error loading Level 1 project.");
    return;
  }

  const { data: children, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error) {
    console.error("[CostBudget] Error loading child projects", error);
    msg && (msg.textContent = "Error loading child projects.");
    return;
  }

  const all = [parent, ...(children || [])];
  _costProjectIds = all.map(p => p.id);

  all.forEach(p => {
    _projectMeta[p.id] = {
      project_code: p.project_code,
      name: p.name,
      label: `${p.project_code} – ${p.name}`,
    };
  });
}

// ─────────────────────────────────────────────
// COST AGGREGATION HELPERS
// ─────────────────────────────────────────────
function ensureMonthFields(row) {
  MONTH_FIELDS.forEach(({ col }) => {
    if (typeof row[col] !== "number") row[col] = 0;
  });
}

function addToMonth(row, dateStr, amount) {
  if (!dateStr) return;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return;
  const monthIdx = d.getUTCMonth(); // 0–11
  const mf = MONTH_FIELDS.find(m => m.idx === monthIdx);
  if (!mf) return;
  row[mf.col] += amount;
}

// ─────────────────────────────────────────────
// LOAD LABOR COST: labor_hours × employees.hourly_cost
// ─────────────────────────────────────────────
async function loadLaborCosts(client, projectIds, ctx) {
  if (!projectIds.length) return [];

  const { data: hours, error: hoursErr } = await client
    .from("labor_hours")
    .select("project_id, employee_id, ym, hours")
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (hoursErr) {
    console.error("[CostBudget] labor_hours error", hoursErr);
    return [];
  }

  if (!hours || !hours.length) return [];

  const employeeIds = Array.from(
    new Set(hours.map(h => h.employee_id).filter(Boolean))
  );

  let empMap = new Map();
  if (employeeIds.length) {
    const { data: emps, error: empErr } = await client
      .from("employees")
      .select("id, full_name, department_name, hourly_cost");
      // you can add labor_category if you want to show it

    if (empErr) {
      console.error("[CostBudget] employees error", empErr);
    } else {
      (emps || []).forEach(e => {
        empMap.set(e.id, e);
      });
    }
  }

  const byKey = new Map();

  for (const row of hours) {
    const projMeta = _projectMeta[row.project_id];
    if (!projMeta) continue;

    const emp = empMap.get(row.employee_id);
    const hourly = emp?.hourly_cost || 0;
    const hoursVal = Number(row.hours || 0);
    const cost = hoursVal * hourly;

    const key = `${row.project_id}::${row.employee_id}`;
    if (!byKey.has(key)) {
      const who = emp?.full_name || "(Unknown employee)";
      const role = emp?.department_name || "";
      const rec = {
        source: "labor",
        project_label: projMeta.label,
        who,
        desc: role,
      };
      ensureMonthFields(rec);
      byKey.set(key, rec);
    }

    const rec = byKey.get(key);
    addToMonth(rec, row.ym, cost);
  }

  return Array.from(byKey.values());
}

// ─────────────────────────────────────────────
// LOAD SUBS & ODC COSTS
//   Assumes a table like: subs_odc_costs
//   with columns: project_id, type, vendor_name, label, description, ym, amount,
//   plan_year, plan_version_id, plan_type
//   Adjust table / column names if your schema differs.
// ─────────────────────────────────────────────
async function loadSubsOdcCosts(client, projectIds, ctx) {
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("subs_odc_costs") // <-- rename if your table is named differently
    .select("project_id, type, vendor_name, label, description, ym, amount")
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (error) {
    console.error("[CostBudget] subs_odc_costs error", error);
    return [];
  }

  if (!data || !data.length) return [];

  const byKey = new Map();

  for (const row of data) {
    const projMeta = _projectMeta[row.project_id];
    if (!projMeta) continue;

    const who = row.vendor_name || row.label || row.type || "(Vendor / ODC)";
    const descParts = [];
    if (row.type) descParts.push(row.type);
    if (row.description) descParts.push(row.description);
    const desc = descParts.join(" · ");

    const key = `${row.project_id}::${who}::${desc}`;
    if (!byKey.has(key)) {
      const rec = {
        source: "subs_odc",
        project_label: projMeta.label,
        who,
        desc,
      };
      ensureMonthFields(rec);
      byKey.set(key, rec);
    }

    const rec = byKey.get(key);
    const amt = Number(row.amount || 0);
    addToMonth(rec, row.ym, amt);
  }

  return Array.from(byKey.values());
}

// ─────────────────────────────────────────────
// REFRESH GRID
// ─────────────────────────────────────────────
async function refreshCost(root, client) {
  const msg = $("#costMessage", root);
  const ctx = getPlanContext();

  if (!_costProjectIds.length || !ctx.year || !ctx.versionId) {
    renderCost(root, null);
    return;
  }

  msg && (msg.textContent = "Loading costs…");

  try {
    const [laborRows, subsOdcRows] = await Promise.all([
      loadLaborCosts(client, _costProjectIds, ctx),
      loadSubsOdcCosts(client, _costProjectIds, ctx),
    ]);

    const allRows = [...laborRows, ...subsOdcRows];

    renderCost(root, allRows);
    msg && (msg.textContent = allRows.length ? "" : "No cost data found for this plan.");
  } catch (err) {
    console.error("[CostBudget] refreshCost error", err);
    msg && (msg.textContent = "Error loading cost data.");
    renderCost(root, null);
  }
}

// ─────────────────────────────────────────────
// RENDER COST GRID (presentation only)
// ─────────────────────────────────────────────
function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="16" class="text-center py-10 text-slate-500 text-xs">No cost lines found for this project and plan.</td></tr>`;
    return;
  }

  const fmt = v =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "";

  tbody.innerHTML = "";
  rows.forEach(r => {
    let total = 0;

    const monthCells = MONTH_FIELDS.map(mf => {
      const val = Number(r[mf.col] || 0);
      total += val;
      return `<td class="px-3 py-1 text-right text-[11px] text-slate-900">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition";

    tr.innerHTML = `
      <td class="cost-grid-sticky cost-col-1 px-3 py-1 text-[11px] font-medium text-slate-900">
        ${r.project_label || ""}
      </td>
      <td class="cost-grid-sticky cost-col-2 px-3 py-1 text-[11px] font-medium text-slate-800">
        ${r.who || ""}
      </td>
      <td class="cost-grid-sticky cost-col-3 px-3 py-1 text-[11px] text-slate-600 italic">
        ${r.desc || ""}
      </td>
      ${monthCells}
      <td class="px-3 py-1 text-right text-[11px] font-bold text-slate-900 bg-slate-50">
        ${fmt(total)}
      </td>
    `;
    tbody.appendChild(tr);
  });
}
