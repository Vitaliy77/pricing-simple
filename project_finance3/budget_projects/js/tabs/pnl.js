// js/tabs/pnl.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

// Months map to match revenue tab style
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

let projectScope = [];
let projectMeta = {};

export const template = /*html*/ `
  <article class="full-width-card">
    <style>
      .pnl-table {
        border-collapse: collapse;
        width: max-content;
        min-width: 100%;
      }
      .pnl-table th,
      .pnl-table td {
        padding: 2px 4px;
        white-space: nowrap;
      }

      .pnl-sticky-line {
        position: sticky;
        left: 0;
        z-index: 30;
        background-color: #f8fafc;
        width: 18rem;
      }

      .pnl-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .pnl-row-striped:nth-child(even) { background-color: #ffffff; }
      .pnl-row-striped:hover           { background-color: #dbeafe; }

      .pnl-summary-row {
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
        <span id="pnlInlinePlan" class="font-medium"></span>
        <span id="pnlInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · P&L Summary
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Revenue by type, cost by type, and profit for the selected Level 1 project (by month).
        </span>
      </div>

      <div id="pnlMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <!-- Table -->
    <div class="w-full max-h-[520px] overflow-y-auto overflow-x-auto">
      <table class="pnl-table text-xs">
        <thead class="bg-slate-50">
          <tr>
            <th class="pnl-sticky-line sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Line
            </th>
            ${MONTH_FIELDS.map(
              m => `
                <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                  ${m.label}
                </th>`
            ).join("")}
            <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Total
            </th>
          </tr>
        </thead>
        <tbody id="pnlBody">
          <tr>
            <td colspan="14" class="text-center py-10 text-slate-500 text-xs">
              Loading…
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
`;

export const pnlTab = {
  template,
  async init({ root, client }) {
    const msg = $("#pnlMessage", root);
    const ctx = getPlanContext();

    const globalPlan =
      document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    const globalProject =
      document.querySelector("#currentProject")?.textContent?.trim() || "";

    const planSpan = $("#pnlInlinePlan", root);
    const projSpan = $("#pnlInlineProject", root);

    if (planSpan) planSpan.textContent = globalPlan;
    if (projSpan) {
      projSpan.textContent = globalProject ? `, ${globalProject}` : "";
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg && (msg.textContent =
        "Please select a Level 1 project and plan first.");
      renderPnl(root, null);
      return;
    }

    await loadProjectsUnderLevel1(client, ctx.level1ProjectId);
    await refreshPnl(root, client);
  },
};

// ─────────────────────────────────────────────
// PROJECT SCOPE (same pattern as revenue tab)
// ─────────────────────────────────────────────
async function loadProjectsUnderLevel1(client, level1ProjectId) {
  projectScope = [];
  projectMeta = {};

  const { data: parent, error: pErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (pErr || !parent) {
    console.error("[PnL] Error loading parent project", pErr);
    return;
  }

  const { data: children, error: cErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (cErr) {
    console.error("[PnL] Error loading child projects", cErr);
  }

  const all = [parent, ...(children || [])];
  projectScope = all;
  all.forEach(p => {
    projectMeta[p.id] = {
      project_code: p.project_code,
      name: p.name,
      label: `${p.project_code} – ${p.name}`,
    };
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function emptyAgg() {
  const obj = {};
  MONTH_FIELDS.forEach(({ col }) => {
    obj[col] = 0;
  });
  return obj;
}

function addLineToAgg(agg, line, sign = 1) {
  MONTH_FIELDS.forEach(({ col }) => {
    const v = Number(line[col] || 0);
    if (!Number.isNaN(v)) agg[col] += sign * v;
  });
}

function addToAggFromYm(agg, ymStr, amount) {
  if (!ymStr) return;
  const d = new Date(ymStr);
  if (Number.isNaN(d.getTime())) return;
  const monthIdx = d.getUTCMonth();
  const mf = MONTH_FIELDS.find(m => m.idx === monthIdx);
  if (!mf) return;
  agg[mf.col] += amount;
}

// ─────────────────────────────────────────────
// LOADERS
// ─────────────────────────────────────────────

// A) T&M Labor: revenue & cost from labor_hours × rates
async function loadLaborRevenueAndCost(client, ctx) {
  const result = {
    tmRevenue: emptyAgg(),
    laborCost: emptyAgg(),
  };

  const projectIds = projectScope.map(p => p.id);
  if (!projectIds.length) return result;

  const { data: hours, error: hErr } = await client
    .from("labor_hours")
    .select("project_id, employee_id, ym, hours")
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (hErr) {
    console.error("[PnL] labor_hours error", hErr);
    return result;
  }
  if (!hours || !hours.length) return result;

  const employeeIds = Array.from(
    new Set(hours.map(r => r.employee_id).filter(Boolean))
  );

  const empMap = new Map();
  if (employeeIds.length) {
    // IMPORTANT: use labor_categories(billing_rate), not billing_rate directly
    const { data: emps, error: eErr } = await client
      .from("employees")
      .select("id, hourly_cost, labor_categories(billing_rate)")
      .in("id", employeeIds);

    if (eErr) {
      console.error("[PnL] employees error", eErr);
    } else {
      (emps || []).forEach(e => {
        const billingRate = Number(e.labor_categories?.billing_rate || 0);
        empMap.set(e.id, {
          hourly_cost: Number(e.hourly_cost || 0),
          billing_rate: billingRate,
        });
      });
    }
  }

  for (const row of hours) {
    const emp = empMap.get(row.employee_id) || {};
    const hrs = Number(row.hours || 0);

    const hourlyCost = emp.hourly_cost || 0;
    const effectiveRate =
      (typeof emp.billing_rate === "number" &&
        !Number.isNaN(emp.billing_rate) &&
        emp.billing_rate > 0)
        ? emp.billing_rate
        : hourlyCost;

    const revAmount = hrs * effectiveRate;
    const costAmount = hrs * hourlyCost;

    addToAggFromYm(result.tmRevenue, row.ym, revAmount);
    addToAggFromYm(result.laborCost, row.ym, costAmount);
  }

  return result;
}

// B) Manual revenue types from planning_lines (Fixed, Software, Unit, Other)
async function loadManualRevenueByType(client, ctx) {
  const result = {
    fixed: emptyAgg(),
    software: emptyAgg(),
    unit: emptyAgg(),
    other: emptyAgg(),
  };

  const projectIds = projectScope.map(p => p.id);
  if (!projectIds.length) return result;

  const { data, error } = await client
    .from("planning_lines")
    .select(`
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
    console.error("[PnL] manual revenue planning_lines error", error);
    return result;
  }
  if (!data || !data.length) return result;

  data.forEach(line => {
    const code = line.entry_types?.code || "";
    let bucket = null;

    if (code === "FIXED_REV") bucket = "fixed";
    else if (code === "SOFT_REV") bucket = "software";
    else if (code === "UNIT_REV") bucket = "unit";
    else if (code === "OTHER_REV") bucket = "other";
    else return; // ignore unknown revenue types here

    addLineToAgg(result[bucket], line, +1);
  });

  return result;
}

// C) Cost by type from planning_lines (DIR_LAB_COST, SUBC_COST, ODC_COST)
async function loadCostByType(client, ctx) {
  const result = {
    labor: emptyAgg(),
    subc: emptyAgg(),
    odc: emptyAgg(),
  };

  const projectIds = projectScope.map(p => p.id);
  if (!projectIds.length) return result;

  const { data, error } = await client
    .from("planning_lines")
    .select(`
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
    console.error("[PnL] cost planning_lines error", error);
    return result;
  }
  if (!data || !data.length) return result;

  data.forEach(line => {
    const code = line.entry_types?.code || "";
    let bucket = null;

    if (code === "DIR_LAB_COST") bucket = "labor";
    else if (code === "SUBC_COST") bucket = "subc";
    else if (code === "ODC_COST") bucket = "odc";
    else return;

    addLineToAgg(result[bucket], line, +1);
  });

  return result;
}

// D) Subs & ODC revenue = cost (mirror) for this P&L
async function loadSubsOdcRevenueFromCost(client, ctx) {
  // We can just reuse the cost loader and treat subc + odc as revenue
  const costByType = await loadCostByType(client, ctx);
  const subsOdcRev = emptyAgg();
  addLineToAgg(subsOdcRev, costByType.subc, +1);
  addLineToAgg(subsOdcRev, costByType.odc, +1);
  return subsOdcRev;
}

// ─────────────────────────────────────────────
// REFRESH + SUMMARY BUILD
// ─────────────────────────────────────────────
async function refreshPnl(root, client) {
  const msg = $("#pnlMessage", root);
  const ctx = getPlanContext();

  if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
    renderPnl(root, null);
    msg && (msg.textContent =
      "Please select a Level 1 project and plan first.");
    return;
  }

  if (!projectScope.length) {
    renderPnl(root, null);
    msg && (msg.textContent = "No projects under selected Level 1 project.");
    return;
  }

  msg && (msg.textContent = "Calculating P&L…");

  try {
    const [
      laborRevCost,
      manualRev,
      costByType,
      subsOdcRev,
    ] = await Promise.all([
      loadLaborRevenueAndCost(client, ctx),
      loadManualRevenueByType(client, ctx),
      loadCostByType(client, ctx),
      loadSubsOdcRevenueFromCost(client, ctx),
    ]);

    const summary = buildSummary(laborRevCost, manualRev, costByType, subsOdcRev);
    renderPnl(root, summary);
    msg && (msg.textContent = "");
  } catch (err) {
    console.error("[PnL] refresh error", err);
    msg && (msg.textContent = "Error calculating P&L.");
    renderPnl(root, null);
  }
}

function buildSummary(laborRevCost, manualRev, costByType, subsOdcRev) {
  const zero = () => emptyAgg();

  const rev_tm = laborRevCost.tmRevenue || zero();
  const rev_fixed = manualRev.fixed || zero();
  const rev_software = manualRev.software || zero();
  const rev_unit = manualRev.unit || zero();
  const rev_other = manualRev.other || zero();
  const rev_subs_odc = subsOdcRev || zero();

  const cost_labor = costByType.labor || zero();
  const cost_subc = costByType.subc || zero();
  const cost_odc = costByType.odc || zero();

  const rev_total = emptyAgg();
  const cost_total = emptyAgg();
  const profit = emptyAgg();

  // Build totals
  [rev_tm, rev_fixed, rev_software, rev_unit, rev_other, rev_subs_odc].forEach(r =>
    addLineToAgg(rev_total, r, +1)
  );

  [cost_labor, cost_subc, cost_odc].forEach(c =>
    addLineToAgg(cost_total, c, +1)
  );

  MONTH_FIELDS.forEach(({ col }) => {
    const r = Number(rev_total[col] || 0);
    const c = Number(cost_total[col] || 0);
    profit[col] = r - c;
  });

  const makeRow = (label, agg, section) => ({ label, agg, section });

  const rows = [
    // Revenue section
    makeRow("T&M Labor Revenue", rev_tm, "revenue"),
    makeRow("Fixed Revenue", rev_fixed, "revenue"),
    makeRow("Software Revenue", rev_software, "revenue"),
    makeRow("Unit Revenue", rev_unit, "revenue"),
    makeRow("Other Revenue", rev_other, "revenue"),
    makeRow("Subs & ODC Revenue", rev_subs_odc, "revenue"),
    makeRow("Total Revenue", rev_total, "revenue_total"),

    // Cost section
    makeRow("Labor Cost", cost_labor, "cost"),
    makeRow("Subcontractor Cost", cost_subc, "cost"),
    makeRow("Other Direct Costs", cost_odc, "cost"),
    makeRow("Total Cost", cost_total, "cost_total"),

    // Profit
    makeRow("Profit (Total Revenue - Total Cost)", profit, "profit"),
  ];

  return { rows };
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function renderPnl(root, summary) {
  const tbody = $("#pnlBody", root);
  if (!tbody) return;

  if (!summary || !summary.rows || !summary.rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center py-10 text-slate-500 text-xs">
          No data available.
        </td>
      </tr>
    `;
    return;
  }

  const fmt = v =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "";

  tbody.innerHTML = "";

  summary.rows.forEach(r => {
    const agg = r.agg || {};
    let total = 0;
    const cells = MONTH_FIELDS.map(m => {
      const val = Number(agg[m.col] || 0);
      total += val;
      return `<td class="text-right text-[11px] px-2 py-1">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.className = "pnl-row-striped";

    const labelClass =
      r.section === "revenue_total" || r.section === "cost_total" || r.section === "profit"
        ? "font-semibold text-slate-900"
        : "text-slate-800";

    tr.innerHTML = `
      <td class="pnl-sticky-line text-[11px] px-2 py-1 ${labelClass}">
        ${r.label}
      </td>
      ${cells}
      <td class="text-right text-[11px] font-semibold px-2 py-1 bg-slate-50">
        ${fmt(total)}
      </td>
    `;
    tbody.appendChild(tr);
  });
}
