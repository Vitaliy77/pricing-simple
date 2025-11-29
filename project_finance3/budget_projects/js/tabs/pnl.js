// js/tabs/pnl.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

// Month metadata
const MONTHS = [
  { key: "jan", col: "amt_jan", label: "Jan", idx: 0 },
  { key: "feb", col: "amt_feb", label: "Feb", idx: 1 },
  { key: "mar", col: "amt_mar", label: "Mar", idx: 2 },
  { key: "apr", col: "amt_apr", label: "Apr", idx: 3 },
  { key: "may", col: "amt_may", label: "May", idx: 4 },
  { key: "jun", col: "amt_jun", label: "Jun", idx: 5 },
  { key: "jul", col: "amt_jul", label: "Jul", idx: 6 },
  { key: "aug", col: "amt_aug", label: "Aug", idx: 7 },
  { key: "sep", col: "amt_sep", label: "Sep", idx: 8 },
  { key: "oct", col: "amt_oct", label: "Oct", idx: 9 },
  { key: "nov", col: "amt_nov", label: "Nov", idx: 10 },
  { key: "dec", col: "amt_dec", label: "Dec", idx: 11 },
];

// Global scope for Level 1 project + children
let projectScope = [];
let projectMeta = {};

// ─────────────────────────────────────────────
// TEMPLATE — styled similar to Revenue tab
// ─────────────────────────────────────────────
export const template = /*html*/ `
  <article class="full-width-card w-full">
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
        box-sizing: border-box;
      }

      .pnl-col-line {
        width: 18rem;
      }

      .pnl-sticky-line {
        position: sticky;
        left: 0;
        z-index: 25;
        background-color: #ffffff;
      }
      .pnl-table thead th.pnl-sticky-line {
        background-color: #f8fafc;
        z-index: 30;
      }

      .pnl-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .pnl-row-striped:nth-child(even) { background-color: #ffffff; }
      .pnl-row-striped:hover           { background-color: #dbeafe; }

      .pnl-row-group-header {
        background-color: #e5e7eb;
        font-weight: 600;
      }

      .pnl-row-total {
        background-color: #d1fae5;
        font-weight: 600;
      }

      .pnl-row-profit {
        background-color: #fee2e2;
        font-weight: 700;
      }

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
        <span class="ml-2 text-xs text-slate-900 font-semibold">· P&L Summary</span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Revenue, cost, and profit by type and month for all projects under the selected Level 1 project.
        </span>
      </div>
      <div id="pnlMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <!-- Main table card -->
    <section id="pnlSection" class="border-t border-slate-200" style="display:none;">
      <div class="w-full max-h-[520px] overflow-y-auto overflow-x-auto">
        <table class="pnl-table text-xs">
          <thead class="bg-slate-50">
            <tr>
              <th class="pnl-sticky-line pnl-col-line sticky top-0 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Line
              </th>
              ${MONTHS.map(m => `
                <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                  ${m.label}
                </th>
              `).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>
          <tbody id="pnlBody" class="bg-white">
            <tr><td colspan="14" class="text-center py-10 text-slate-500 text-xs">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function zeroMonths() {
  const o = {};
  MONTHS.forEach(m => { o[m.key] = 0; });
  return o;
}

function addMonthMaps(target, source) {
  MONTHS.forEach(m => {
    target[m.key] += Number(source[m.key] || 0);
  });
}

function fmtNum(v) {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isNaN(n)
    ? ""
    : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function dateToMonthKey(ymStr) {
  if (!ymStr) return null;
  const d = new Date(ymStr);
  if (Number.isNaN(d.getTime())) return null;
  const idx = d.getUTCMonth();
  const m = MONTHS.find(x => x.idx === idx);
  return m ? m.key : null;
}

// ─────────────────────────────────────────────
// PROJECT SCOPE: Level 1 + children
// ─────────────────────────────────────────────
async function loadProjectScope(client, level1ProjectId) {
  if (!level1ProjectId) return [];

  const { data: parent, error: pErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (pErr || !parent) {
    console.error("[PnL] load parent project error", pErr);
    return [];
  }

  const { data: children, error: cErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (cErr) {
    console.error("[PnL] load child projects error", cErr);
    return [parent];
  }

  return [parent, ...(children || [])];
}

// ─────────────────────────────────────────────
// T&M LABOR REVENUE and COST (same for now)
//   labor_hours × employees.hourly_cost
// ─────────────────────────────────────────────
async function loadLaborRevenueAndCost(client, ctx, projectIds) {
  const result = {
    revenue: zeroMonths(),
    cost: zeroMonths(),
  };

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

  const employeeIds = Array.from(new Set(hours.map(r => r.employee_id).filter(Boolean)));

  const empMap = new Map();
  if (employeeIds.length) {
    const { data: emps, error: eErr } = await client
      .from("employees")
      .select("id, hourly_cost");

    if (eErr) {
      console.error("[PnL] employees error", eErr);
    } else {
      (emps || []).forEach(e => {
        empMap.set(e.id, e);
      });
    }
  }

  for (const row of hours) {
    const emp = empMap.get(row.employee_id);
    const rate = emp?.hourly_cost || 0; // TODO: swap to billing_rate when available
    const hrs = Number(row.hours || 0);
    const amount = hrs * rate;

    const mKey = dateToMonthKey(row.ym);
    if (!mKey) continue;

    result.revenue[mKey] += amount;
    result.cost[mKey] += amount;
  }

  return result;
}

// ─────────────────────────────────────────────
// SUBS & ODC COST (from planning_lines)
//   Revenue for subs/ODC is equal to cost in this model
// ─────────────────────────────────────────────
async function loadSubsOdcCost(client, ctx, projectIds) {
  const months = zeroMonths();
  if (!projectIds.length) return months;

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
    console.error("[PnL] subs/odc planning_lines error", error);
    return months;
  }
  if (!data || !data.length) return months;

  for (const line of data) {
    const code = line.entry_types?.code || null;
    if (code !== "SUBC_COST" && code !== "ODC_COST") continue;

    MONTHS.forEach(m => {
      const val = Number(line[m.col] || 0);
      if (!Number.isNaN(val)) months[m.key] += val;
    });
  }

  return months;
}

// ─────────────────────────────────────────────
// OTHER COST (non-revenue planning_lines that are
//   NOT subs/odc and NOT DIR_LAB_COST)
// ─────────────────────────────────────────────
async function loadOtherCost(client, ctx, projectIds) {
  const months = zeroMonths();
  if (!projectIds.length) return months;

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
    console.error("[PnL] other-cost planning_lines error", error);
    return months;
  }
  if (!data || !data.length) return months;

  for (const line of data) {
    const code = line.entry_types?.code || null;
    if (code === "SUBC_COST" || code === "ODC_COST" || code === "DIR_LAB_COST") {
      continue;
    }

    MONTHS.forEach(m => {
      const val = Number(line[m.col] || 0);
      if (!Number.isNaN(val)) months[m.key] += val;
    });
  }

  return months;
}

// ─────────────────────────────────────────────
// MANUAL REVENUE (Fixed / Software / Unit)
//   from planning_lines.is_revenue = true
// ─────────────────────────────────────────────
async function loadManualRevenueByType(client, ctx, projectIds) {
  const fixed = zeroMonths();
  const software = zeroMonths();
  const unit = zeroMonths();

  if (!projectIds.length) {
    return { fixed, software, unit };
  }

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      project_id,
      resource_name,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
      is_revenue
    `)
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", true);

  if (error) {
    console.error("[PnL] manual revenue planning_lines error", error);
    return { fixed, software, unit };
  }
  if (!data || !data.length) return { fixed, software, unit };

  for (const line of data) {
    const base = (line.resource_name || "").toLowerCase();
    let bucket = fixed;
    if (base.includes("software")) bucket = software;
    else if (base.includes("unit")) bucket = unit;

    MONTHS.forEach(m => {
      const val = Number(line[m.col] || 0);
      if (!Number.isNaN(val)) bucket[m.key] += val;
    });
  }

  return { fixed, software, unit };
}

// ─────────────────────────────────────────────
// P&L AGGREGATION
// ─────────────────────────────────────────────
function buildPnlRows(components) {
  const {
    laborRevCost,
    subsOdcCost,
    otherCost,
    manualRevByType,
  } = components;

  const rev_tm = laborRevCost.revenue;             // T&M Labor revenue
  const cost_labor = laborRevCost.cost;            // Labor cost
  const cost_subs = subsOdcCost;                   // Subs & ODC cost
  const rev_subs = subsOdcCost;                    // Subs & ODC revenue == cost
  const cost_other = otherCost;                    // Other cost
  const rev_fixed = manualRevByType.fixed;         // Manual fixed revenue
  const rev_soft  = manualRevByType.software;      // Manual software revenue
  const rev_unit  = manualRevByType.unit;          // Manual unit revenue

  // Totals
  const rev_total = zeroMonths();
  const cost_total = zeroMonths();
  const profit_total = zeroMonths();

  // Revenue total per month
  MONTHS.forEach(m => {
    rev_total[m.key] =
      (rev_tm[m.key] || 0) +
      (rev_subs[m.key] || 0) +
      (rev_fixed[m.key] || 0) +
      (rev_soft[m.key] || 0) +
      (rev_unit[m.key] || 0);
  });

  // Cost total per month
  MONTHS.forEach(m => {
    cost_total[m.key] =
      (cost_labor[m.key] || 0) +
      (cost_subs[m.key] || 0) +
      (cost_other[m.key] || 0);
  });

  // Profit total per month
  MONTHS.forEach(m => {
    profit_total[m.key] = rev_total[m.key] - cost_total[m.key];
  });

  // Build ordered rows for rendering
  const rows = [];

  // Revenue group
  rows.push({ label: "REVENUE", group: "group", months: zeroMonths() });

  rows.push({ label: "  T&M Labor Revenue", group: "rev", months: rev_tm });
  rows.push({ label: "  Subs & ODC Revenue", group: "rev", months: rev_subs });
  rows.push({ label: "  Fixed Revenue", group: "rev", months: rev_fixed });
  rows.push({ label: "  Software Revenue", group: "rev", months: rev_soft });
  rows.push({ label: "  Unit Revenue", group: "rev", months: rev_unit });
  rows.push({ label: "Total Revenue", group: "rev_total", months: rev_total });

  // Cost group
  rows.push({ label: "", group: "spacer", months: zeroMonths() });

  rows.push({ label: "COST", group: "group", months: zeroMonths() });

  rows.push({ label: "  Labor Cost", group: "cost", months: cost_labor });
  rows.push({ label: "  Subs & ODC Cost", group: "cost", months: cost_subs });
  rows.push({ label: "  Other Cost", group: "cost", months: cost_other });
  rows.push({ label: "Total Cost", group: "cost_total", months: cost_total });

  // Profit
  rows.push({ label: "", group: "spacer", months: zeroMonths() });
  rows.push({ label: "Profit (Total Revenue − Total Cost)", group: "profit", months: profit_total });

  return rows;
}

function computeRowTotal(monthsMap) {
  return MONTHS.reduce((sum, m) => sum + Number(monthsMap[m.key] || 0), 0);
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function renderPnl(root, rows) {
  const tbody = $("#pnlBody", root);
  if (!tbody) return;

  if (!rows || !rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center py-10 text-slate-500 text-xs">
          No data available for this plan and Level 1 project.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    let cls = "pnl-row-striped";

    if (row.group === "group") cls = "pnl-row-group-header";
    if (row.group === "rev_total" || row.group === "cost_total") cls = "pnl-row-total";
    if (row.group === "profit") cls = "pnl-row-profit";
    if (row.group === "spacer") cls = "";

    tr.className = cls;

    const total = computeRowTotal(row.months);

    if (row.group === "spacer") {
      tr.innerHTML = `<td class="pnl-sticky-line pnl-col-line">&nbsp;</td>` +
        MONTHS.map(() => `<td></td>`).join("") +
        `<td></td>`;
      tbody.appendChild(tr);
      return;
    }

    let html = `
      <td class="pnl-sticky-line pnl-col-line text-[11px] ${
        row.group === "group" || row.group === "rev_total" || row.group === "cost_total" || row.group === "profit"
          ? "font-semibold text-slate-900"
          : "text-slate-800"
      }">
        ${row.label}
      </td>
    `;

    MONTHS.forEach(m => {
      const v = row.months[m.key] || 0;
      html += `<td class="text-right text-[11px]">${fmtNum(v)}</td>`;
    });

    html += `<td class="text-right text-[11px] font-semibold">${fmtNum(total)}</td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });

  // Summary row at bottom (grand totals across all P&L rows)
  const summaryTr = document.createElement("tr");
  summaryTr.className = "pnl-summary-row";
  summaryTr.dataset.summaryRow = "pnl";

  const monthTotals = zeroMonths();
  let grand = 0;

  rows.forEach(r => {
    // Only sum real numeric rows, not group headers or spacers
    if (r.group === "group" || r.group === "spacer") return;
    MONTHS.forEach(m => {
      const v = Number(r.months[m.key] || 0);
      if (!Number.isNaN(v)) monthTotals[m.key] += v;
    });
  });
  MONTHS.forEach(m => { grand += monthTotals[m.key]; });

  let summaryHtml = `
    <td class="pnl-sticky-line pnl-col-line text-[11px] font-semibold text-slate-900">
      Sum of all P&L lines
    </td>
  `;
  MONTHS.forEach(m => {
    summaryHtml += `<td class="text-right text-[11px]">${fmtNum(monthTotals[m.key])}</td>`;
  });
  summaryHtml += `<td class="text-right text-[11px] font-semibold">${fmtNum(grand)}</td>`;

  summaryTr.innerHTML = summaryHtml;
  tbody.appendChild(summaryTr);
}

// ─────────────────────────────────────────────
// REFRESH
// ─────────────────────────────────────────────
async function refreshPnl(root, client) {
  const msg = $("#pnlMessage", root);
  const ctx = getPlanContext();

  if (!projectScope.length || !ctx.year || !ctx.versionId) {
    renderPnl(root, null);
    if (msg) msg.textContent = "Please select a Level 1 project and plan first.";
    return;
  }

  if (msg) msg.textContent = "Calculating P&L…";

  const projectIds = projectScope.map(p => p.id);

  try {
    const [laborRevCost, subsOdcCost, otherCost, manualRevByType] = await Promise.all([
      loadLaborRevenueAndCost(client, ctx, projectIds),
      loadSubsOdcCost(client, ctx, projectIds),
      loadOtherCost(client, ctx, projectIds),
      loadManualRevenueByType(client, ctx, projectIds),
    ]);

    const rows = buildPnlRows({
      laborRevCost,
      subsOdcCost,
      otherCost,
      manualRevByType,
    });

    renderPnl(root, rows);
    if (msg) msg.textContent = "";
  } catch (err) {
    console.error("[PnL] refreshPnl error", err);
    renderPnl(root, null);
    if (msg) msg.textContent = "Error loading P&L data.";
  }
}

// ─────────────────────────────────────────────
// TAB INIT
// ─────────────────────────────────────────────
export const pnlTab = {
  template,
  async init({ root, client }) {
    const msg = $("#pnlMessage", root);
    const section = $("#pnlSection", root);
    const ctx = getPlanContext();

    // Header labels (similar to Revenue tab)
    const globalPlan =
      document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    const globalProject =
      document.querySelector("#currentProject")?.textContent?.trim() || "";

    const planSpan = $("#pnlInlinePlan", root);
    const projSpan = $("#pnlInlineProject", root);

    if (planSpan) {
      planSpan.textContent =
        globalPlan ||
        (ctx?.year ? `BUDGET – ${ctx.year} · ${ctx.planType || "Working"}` : "P&L");
    }
    if (projSpan) {
      if (globalProject) {
        projSpan.textContent = `, ${globalProject}`;
      } else if (ctx?.level1ProjectCode && ctx?.level1ProjectName) {
        projSpan.textContent = ` · Level 1 Project: ${ctx.level1ProjectCode} – ${ctx.level1ProjectName}`;
      } else {
        projSpan.textContent = "";
      }
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      if (msg) msg.textContent = "Please select a Level 1 project and plan first.";
      section.style.display = "none";
      return;
    }

    // Load Level 1 project scope
    projectScope = await loadProjectScope(client, ctx.level1ProjectId);
    projectMeta = {};
    projectScope.forEach(p => {
      projectMeta[p.id] = {
        code: p.project_code,
        name: p.name,
        label: `${p.project_code} – ${p.name}`,
      };
    });

    if (!projectScope.length) {
      if (msg) msg.textContent = "No projects found under this Level 1 project.";
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    await refreshPnl(root, client);
  },
};
