// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

let _costProjectIds = [];
let _projectMeta = {};
let _lastCostRows = []; // for export

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

// Fixed sort order for record types
const RECORD_TYPE_ORDER = {
  "Revenue": 1,
  "Labor Cost": 2,
  "Sub Cost": 3,
  "ODC Cost": 4,
};

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
          — Cost summary (labor, subs, ODC) plus revenue for all projects under the selected Level 1 project.
        </span>
      </div>

      <div
        id="costMessage"
        class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"
      ></div>

      <div class="mt-1 flex justify-end">
        <button
          id="costExportBtn"
          class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm
                 bg-slate-700 hover:bg-slate-800 text-white"
        >
          Export to Excel
        </button>
      </div>
    </div>

    <!-- TABLE WRAPPER: fixed height, only grid scrolls -->
    <div class="border-t border-slate-200">
      <div class="w-full max-h-[520px] overflow-auto overflow-x-auto">
        <table id="costTable" class="min-w-full text-xs">
          <thead class="bg-slate-50">
            <tr>
              <!-- NEW sticky Type column -->
              <th
                class="cost-grid-sticky cost-col-1 sticky top-0 z-30 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-3 py-1.5"
              >
                Type
              </th>
              <!-- Project (sticky) -->
              <th
                class="cost-grid-sticky cost-col-2 sticky top-0 z-30 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-3 py-1.5"
              >
                Project
              </th>
              <!-- Person / Vendor / Category (sticky) -->
              <th
                class="cost-grid-sticky cost-col-3 sticky top-0 z-30 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-3 py-1.5"
              >
                Person / Vendor / Category
              </th>
              <!-- NEW short Rev? column -->
              <th
                class="sticky top-0 z-20 bg-slate-50
                       text-center text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-2 py-1.5"
              >
                Rev?
              </th>
              <!-- NEW Dept column -->
              <th
                class="sticky top-0 z-20 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider
                       px-3 py-1.5"
              >
                Dept
              </th>
              <!-- Role / Description -->
              <th
                class="sticky top-0 z-20 bg-slate-50
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
              <td colspan="19" class="text-center py-10 text-slate-500 text-xs">
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

    // Wire export button
    $("#costExportBtn", root)?.addEventListener("click", () => {
      exportCostToCsv(ctx);
    });
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
      project_id: p.id,
      project_code: p.project_code,
      name: p.name,
      label: `${p.project_code} – ${p.name}`,
    };
  });
}

// ─────────────────────────────────────────────
// SHARED HELPERS
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

function normalizeRecordType(r) {
  if (r.recordType) return r.recordType;
  if (r.kind === "REVENUE") return "Revenue";
  if (r.source === "labor") return "Labor Cost";
  if (r.source === "subs") return "Sub Cost";
  if (r.source === "odc") return "ODC Cost";
  return "Other";
}

function normalizeIsRevenue(r) {
  if (r.isRevenue === "Y" || r.isRevenue === "N") return r.isRevenue;
  return r.kind === "REVENUE" ? "Y" : "N";
}

// ─────────────────────────────────────────────
// COST: LABOR COST = labor_hours × employees.hourly_cost
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
    const projMeta = _costProjectMeta(row.project_id);
    if (!projMeta) continue;

    const emp = empMap.get(row.employee_id);
    const hourly = emp?.hourly_cost || 0;
    const hoursVal = Number(row.hours || 0);
    const cost = hoursVal * hourly;

    const key = `${row.project_id}::${row.employee_id}`;
    if (!byKey.has(key)) {
      const who = emp?.full_name || "(Unknown employee)";
      const dept = emp?.department_name || "";
      const rec = {
        kind: "COST",
        recordType: "Labor Cost",
        isRevenue: "N",
        source: "labor",
        project_id: projMeta.project_id,
        project_code: projMeta.project_code,
        project_label: projMeta.label,
        who,
        dept,
        desc: dept, // keep dept as description as well if you like
      };
      ensureMonthFields(rec);
      byKey.set(key, rec);
    }

    const rec = byKey.get(key);
    addToMonth(rec, row.ym, cost);
  }

  return Array.from(byKey.values());
}

// small helper to safely get project meta
function _costProjectMeta(projectId) {
  return _projectMeta[projectId] || null;
}

// ─────────────────────────────────────────────
// COST: SUBS & ODC FROM planning_lines
// ─────────────────────────────────────────────
async function loadSubsOdcCosts(client, projectIds, ctx) {
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      project_id,
      project_name,
      resource_name,
      description,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
      entry_types ( code )
    `)
    .in("project_id", projectIds)
    .in("entry_types.code", ["SUBC_COST", "ODC_COST"])
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (error) {
    console.error("[CostBudget] planning_lines (subs/odc) error", error);
    return [];
  }

  if (!data || !data.length) return [];

  const byKey = new Map();

  for (const line of data) {
    const projMeta = _costProjectMeta(line.project_id);
    const projectLabel = projMeta?.label || line.project_name || "(Project)";

    const typeCode = line.entry_types?.code;
    const isSubs = typeCode === "SUBC_COST";

    const who =
      line.resource_name ||
      (isSubs ? "Subcontractor" : "ODC");

    // Description from Subs&ODC tab:
    const desc =
      line.description ||
      (isSubs ? "Subcontractor cost" : "Other direct cost");

    const key = `${line.project_id}::${who}::${desc}`;
    if (!byKey.has(key)) {
      const rec = {
        kind: "COST",
        recordType: isSubs ? "Sub Cost" : "ODC Cost",
        isRevenue: "N",
        source: isSubs ? "subs" : "odc",
        project_id: projMeta?.project_id || line.project_id,
        project_code: projMeta?.project_code || "",
        project_label: projectLabel,
        who,
        dept: "", // not applicable here
        desc,
      };
      ensureMonthFields(rec);
      byKey.set(key, rec);
    }

    const rec = byKey.get(key);

    MONTH_FIELDS.forEach(({ col }) => {
      const val = Number(line[col] || 0);
      if (!Number.isNaN(val)) {
        rec[col] += val;
      }
    });
  }

  return Array.from(byKey.values());
}

// ─────────────────────────────────────────────
// REVENUE LOADERS (mirroring revenueBudget.js)
// ─────────────────────────────────────────────

// T&M revenue = labor_hours × effective billing rate
async function loadTmRevenueRowsForCost(client, ctx) {
  try {
    const projectIds = _costProjectIds;
    if (!projectIds.length) return [];

    const { data: hours, error: hErr } = await client
      .from("labor_hours")
      .select("project_id, employee_id, ym, hours")
      .in("project_id", projectIds)
      .eq("plan_year", ctx.year)
      .eq("plan_version_id", ctx.versionId)
      .eq("plan_type", ctx.planType || "Working");

    if (hErr) {
      console.error("[CostBudget/Revenue] labor_hours error", hErr);
      return [];
    }
    if (!hours || !hours.length) return [];

    const employeeIds = Array.from(
      new Set(hours.map(r => r.employee_id).filter(Boolean))
    );

    const empMap = new Map();
    if (employeeIds.length) {
      const { data: emps, error: eErr } = await client
        .from("employees")
        .select("id, hourly_cost, labor_categories(billing_rate)")
        .in("id", employeeIds);

      if (eErr) {
        console.error("[CostBudget/Revenue] employees error", eErr);
      } else {
        (emps || []).forEach(e => {
          const billingRate = Number(e.labor_categories?.billing_rate || 0);
          const hourlyCost = Number(e.hourly_cost || 0);
          empMap.set(e.id, {
            billing_rate: billingRate,
            hourly_cost: hourlyCost,
          });
        });
      }
    }

    const byProject = new Map();

    for (const row of hours) {
      const projMeta = _costProjectMeta(row.project_id);
      if (!projMeta) continue;

      const emp = empMap.get(row.employee_id) || {};
      const hrs = Number(row.hours || 0);

      // Effective rate: billing_rate if > 0, else hourly_cost
      const effectiveRate =
        typeof emp.billing_rate === "number" &&
        !Number.isNaN(emp.billing_rate) &&
        emp.billing_rate > 0
          ? emp.billing_rate
          : emp.hourly_cost || 0;

      const revAmount = hrs * effectiveRate;

      const key = row.project_id;
      if (!byProject.has(key)) {
        const rec = {
          kind: "REVENUE",
          recordType: "Revenue",
          isRevenue: "Y",
          source: "revenue_tm",
          project_id: projMeta.project_id,
          project_code: projMeta.project_code,
          project_label: projMeta.label,
          who: "T&M Labor",
          dept: "",
          desc: "Hours × billing rates",
        };
        ensureMonthFields(rec);
        byProject.set(key, rec);
      }

      const rec = byProject.get(key);
      addToMonth(rec, row.ym, revAmount);
    }

    return Array.from(byProject.values());
  } catch (err) {
    console.error("[CostBudget/Revenue] loadTmRevenueRowsForCost failed", err);
    return [];
  }
}

// Subs & ODC revenue = cost (Subs & ODC) from planning_lines
async function loadSubsOdcRevenueRowsForCost(client, ctx) {
  try {
    const projectIds = _costProjectIds;
    if (!projectIds.length) return [];

    const { data, error } = await client
      .from("planning_lines")
      .select(`
        project_id,
        amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
        amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
        entry_types ( code )
      `)
      .in("project_id", projectIds)
      .eq("plan_year", ctx.year)
      .eq("plan_version_id", ctx.versionId)
      .eq("plan_type", ctx.planType || "Working")
      .eq("is_revenue", false);

    if (error) {
      console.error("[CostBudget/Revenue] subs/odc planning_lines error", error);
      return [];
    }
    if (!data || !data.length) return [];

    const byProject = new Map();

    data.forEach(line => {
      const etCode = line.entry_types?.code || "";
      if (etCode !== "SUBC_COST" && etCode !== "ODC_COST") return;

      const projMeta = _costProjectMeta(line.project_id);
      if (!projMeta) return;

      const key = line.project_id;
      if (!byProject.has(key)) {
        const rec = {
          kind: "REVENUE",
          recordType: "Revenue",
          isRevenue: "Y",
          source: "revenue_subs_odc",
          project_id: projMeta.project_id,
          project_code: projMeta.project_code,
          project_label: projMeta.label,
          who: "Subs & ODC",
          dept: "",
          desc: "Revenue equal to Subs & ODC cost",
        };
        ensureMonthFields(rec);
        byProject.set(key, rec);
      }

      const rec = byProject.get(key);
      MONTH_FIELDS.forEach(({ col }) => {
        rec[col] += Number(line[col] || 0);
      });
    });

    return Array.from(byProject.values());
  } catch (err) {
    console.error("[CostBudget/Revenue] loadSubsOdcRevenueRowsForCost failed", err);
    return [];
  }
}

// Manual revenue (is_revenue = true) – aggregate per project + type
async function loadManualRevenueRowsForCost(client, ctx) {
  try {
    const projectIds = _costProjectIds;
    if (!projectIds.length) return [];

    const { data, error } = await client
      .from("planning_lines")
      .select(`
        project_id,
        project_name,
        resource_name,
        description,
        amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
        amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
        entry_types ( code )
      `)
      .in("project_id", projectIds)
      .eq("plan_year", ctx.year)
      .eq("plan_version_id", ctx.versionId)
      .eq("plan_type", ctx.planType || "Working")
      .eq("is_revenue", true);

    if (error) {
      console.error("[CostBudget/Revenue] manual revenue load error", error);
      return [];
    }
    if (!data || !data.length) return [];

    const typeMap = {
      FIXED_REV: "Fixed Revenue",
      SOFT_REV: "Software Revenue",
      UNIT_REV: "Unit Revenue",
      OTHER_REV: "Other Revenue",
    };

    const byProjectType = new Map();

    data.forEach(line => {
      const projMeta = _costProjectMeta(line.project_id);
      const projLabel = projMeta?.label || line.project_name || "";

      const etCode = line.entry_types?.code || "";
      const typeLabel = typeMap[etCode] || "Manual Revenue";

      const key = `${line.project_id}::${typeLabel}`;
      if (!byProjectType.has(key)) {
        const rec = {
          kind: "REVENUE",
          recordType: "Revenue",
          isRevenue: "Y",
          source: "revenue_manual",
          project_id: projMeta?.project_id || line.project_id,
          project_code: projMeta?.project_code || "",
          project_label: projLabel,
          who: typeLabel,
          dept: "",
          desc: typeLabel,
        };
        ensureMonthFields(rec);
        byProjectType.set(key, rec);
      }

      const rec = byProjectType.get(key);
      MONTH_FIELDS.forEach(({ col }) => {
        rec[col] += Number(line[col] || 0);
      });
    });

    return Array.from(byProjectType.values());
  } catch (err) {
    console.error("[CostBudget/Revenue] loadManualRevenueRowsForCost failed", err);
    return [];
  }
}

async function loadAllRevenueForCost(client, ctx) {
  const [tm, subsOdc, manual] = await Promise.all([
    loadTmRevenueRowsForCost(client, ctx),
    loadSubsOdcRevenueRowsForCost(client, ctx),
    loadManualRevenueRowsForCost(client, ctx),
  ]);

  return [...(tm || []), ...(subsOdc || []), ...(manual || [])];
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

  msg && (msg.textContent = "Loading cost and revenue…");

  try {
    const [laborRows, subsOdcRows, revenueRows] = await Promise.all([
      loadLaborCosts(client, _costProjectIds, ctx),
      loadSubsOdcCosts(client, _costProjectIds, ctx),
      loadAllRevenueForCost(client, ctx),
    ]);

    let allRows = [
      ...(laborRows || []),
      ...(subsOdcRows || []),
      ...(revenueRows || []),
    ];

    // Normalize & sort by record type, then project code
    allRows.forEach(r => {
      r.recordType = normalizeRecordType(r);
      r.isRevenue = normalizeIsRevenue(r);
    });

    allRows.sort((a, b) => {
      const ta = RECORD_TYPE_ORDER[a.recordType] || 99;
      const tb = RECORD_TYPE_ORDER[b.recordType] || 99;
      if (ta !== tb) return ta - tb;

      const pa = a.project_code || "";
      const pb = b.project_code || "";
      if (pa < pb) return -1;
      if (pa > pb) return 1;

      // tie-breaker on who/desc
      const wa = a.who || "";
      const wb = b.who || "";
      if (wa < wb) return -1;
      if (wa > wb) return 1;
      return 0;
    });

    _lastCostRows = allRows;
    renderCost(root, allRows);
    msg && (msg.textContent = allRows.length ? "" : "No cost or revenue data found for this plan.");
  } catch (err) {
    console.error("[CostBudget] refreshCost error", err);
    msg && (msg.textContent = "Error loading cost and revenue data.");
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
    tbody.innerHTML = `<tr><td colspan="19" class="text-center py-10 text-slate-500 text-xs">No cost lines found for this project and plan.</td></tr>`;
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
        ${r.recordType || ""}
      </td>
      <td class="cost-grid-sticky cost-col-2 px-3 py-1 text-[11px] font-medium text-slate-900">
        ${r.project_label || ""}
      </td>
      <td class="cost-grid-sticky cost-col-3 px-3 py-1 text-[11px] font-medium text-slate-800">
        ${r.who || ""}
      </td>
      <td class="px-2 py-1 text-center text-[11px] text-slate-900">
        ${normalizeIsRevenue(r)}
      </td>
      <td class="px-3 py-1 text-[11px] text-slate-700">
        ${r.dept || ""}
      </td>
      <td class="px-3 py-1 text-[11px] text-slate-600 italic">
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

// ─────────────────────────────────────────────
// EXPORT TO CSV (Excel-friendly)
// ─────────────────────────────────────────────
function exportCostToCsv(ctx) {
  if (!_lastCostRows || !_lastCostRows.length) {
    alert("No data to export.");
    return;
  }

  const headers = [
    "Record Type",
    "Is Revenue",
    "Project",
    "Person / Vendor / Category",
    "Dept",
    "Role / Description",
    ...MONTH_FIELDS.map(m => m.label),
    "Total",
  ];

  const fmtNum = v =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : "";

  const lines = [];
  lines.push(headers.join(","));

  // Detail rows
  _lastCostRows.forEach(r => {
    let total = 0;
    const monthVals = MONTH_FIELDS.map(mf => {
      const val = Number(r[mf.col] || 0);
      total += val;
      return fmtNum(val);
    });

    const rowVals = [
      r.recordType || normalizeRecordType(r),
      normalizeIsRevenue(r),
      r.project_label || "",
      r.who || "",
      r.dept || "",
      r.desc || "",
      ...monthVals,
      fmtNum(total),
    ];

    lines.push(
      rowVals
        .map(v => {
          const s = v == null ? "" : String(v);
          // Escape quotes and wrap in quotes
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
  });

  // Totals row
  const monthTotals = {};
  MONTH_FIELDS.forEach(m => (monthTotals[m.col] = 0));
  let grand = 0;

  _lastCostRows.forEach(r => {
    MONTH_FIELDS.forEach(m => {
      const val = Number(r[m.col] || 0);
      if (!Number.isNaN(val)) {
        monthTotals[m.col] += val;
        grand += val;
      }
    });
  });

  const totalRow = [
    "Totals",
    "",
    "",
    "",
    "",
    "",
    ...MONTH_FIELDS.map(m => fmtNum(monthTotals[m.col])),
    fmtNum(grand),
  ];

  lines.push(
    totalRow
      .map(v => {
        const s = v == null ? "" : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      })
      .join(",")
  );

  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const year = ctx?.year || "plan";
  const a = document.createElement("a");
  a.href = url;
  a.download = `cost-budget-${year}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
