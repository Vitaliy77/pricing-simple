// js/tabs/pnl.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

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

let projectScope = [];
let projectMeta = {};

export const template = /*html*/ `
  <article class="full-width-card w-full">
    <style>
      .pnl-table { border-collapse: collapse; width: max-content; min-width: 100%; }
      .pnl-table th, .pnl-table td { padding: 2px 4px; white-space: nowrap; box-sizing: border-box; }
      .pnl-col-line { width: 18rem; }
      .pnl-sticky-line { position: sticky; left: 0; z-index: 25; background-color: #ffffff; }
      .pnl-table thead th.pnl-sticky-line { background-color: #f8fafc; z-index: 30; }
      .pnl-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .pnl-row-striped:nth-child(even) { background-color: #ffffff; }
      .pnl-row-striped:hover           { background-color: #dbeafe; }
      .pnl-row-group-header            { background-color: #e5e7eb; font-weight: 600; }
      .pnl-row-total                   { background-color: #d1fae5; font-weight: 600; }
      .pnl-row-profit                  { background-color: #fee2e2; font-weight: 700; }
      .pnl-summary-row                 { background-color: #e5e7eb; font-weight: 600; position: sticky; bottom: 0; z-index: 20; }
    </style>

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

    <section id="pnlSection" class="border-t border-slate-200" style="display:none;">
      <div class="w-full max-h-[520px] overflow-y-auto overflow-x-auto">
        <table class="pnl-table text-xs">
          <thead class="bg-slate-50">
            <tr>
              <th class="pnl-sticky-line pnl-col-line sticky top-0 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Line</th>
              ${MONTHS.map(m => `<th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">${m.label}</th>`).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Total</th>
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
  return Number.isNaN(n) ? "" : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
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
// PROJECT SCOPE
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
// T&M LABOR: REVENUE (billing_rate) + COST (hourly_cost) — NOW SEPARATE!
// ─────────────────────────────────────────────
async function loadLaborRevenueAndCost(client, ctx, projectIds) {
  const result = {
    revenue: zeroMonths(),  // T&M labor revenue
    cost: zeroMonths(),     // labor cost
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

  const employeeIds = Array.from(
    new Set(hours.map(r => r.employee_id).filter(Boolean))
  );

  const empMap = new Map();
  if (employeeIds.length) {
    const { data: emps, error: eErr } = await client
      .from("employees")
      .select("id, hourly_cost, billing_rate"); // billing_rate is now used!

    if (eErr) {
      console.error("[PnL] employees error", eErr);
    } else {
      (emps || []).forEach(e => {
        empMap.set(e.id, e);
      });
    }
  }

  for (const row of hours) {
    const mKey = dateToMonthKey(row.ym);
    if (!mKey) continue;

    const emp = empMap.get(row.employee_id);
    const hoursVal = Number(row.hours || 0);

    const costRate = emp?.hourly_cost || 0;
    const billingRate =
      typeof emp?.billing_rate === "number" && !Number.isNaN(emp.billing_rate)
        ? emp.billing_rate
        : costRate; // safe fallback

    const costAmount = hoursVal * costRate;
    const revAmount = hoursVal * billingRate;

    result.cost[mKey] += costAmount;
    result.revenue[mKey] += revAmount;
  }

  return result;
}

// ─────────────────────────────────────────────
// SUBS & ODC COST (revenue = cost)
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
    .in("entry_types.code", ["SUBC_COST", "ODC_COST"]);

  if (error) {
    console.error("[PnL] subs/odc planning_lines error", error);
    return months;
  }

  for (const line of (data || [])) {
    MONTHS.forEach(m => {
      const val = Number(line[m.col] || 0);
      if (!Number.isNaN(val)) months[m.key] += val;
    });
  }
  return months;
}

// ─────────────────────────────────────────────
// OTHER COST
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

  for (const line of (data || [])) {
    const code = line.entry_types?.code || null;
    if (code === "SUBC_COST" || code === "ODC_COST" || code === "DIR_LAB_COST") continue;

    MONTHS.forEach(m => {
      const val = Number(line[m.col] || 0);
      if (!Number.isNaN(val)) months[m.key] += val;
    });
  }
  return months;
}

// ─────────────────────────────────────────────
// MANUAL REVENUE BY TYPE
// ─────────────────────────────────────────────
async function loadManualRevenueByType(client, ctx, projectIds) {
  const fixed = zeroMonths();
  const software = zeroMonths();
  const unit = zeroMonths();

  if (!projectIds.length) return { fixed, software, unit };

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      project_id,
      resource_name,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec
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

  for (const line of (data || [])) {
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
// P&L ROW BUILDING & RENDERING (unchanged)
// ─────────────────────────────────────────────
function buildPnlRows(components) {
  const {
    laborRevCost,
    subsOdcCost,
    otherCost,
    manualRevByType,
  } = components;

  const rev_tm = laborRevCost.revenue;
  const cost_labor = laborRevCost.cost;
  const cost_subs = subsOdcCost;
  const rev_subs = subsOdcCost;
  const cost_other = otherCost;
  const rev_fixed = manualRevByType.fixed;
  const rev_soft = manualRevByType.software;
  const rev_unit = manualRevByType.unit;

  const rev_total = zeroMonths();
  const cost_total = zeroMonths();
  const profit_total = zeroMonths();

  MONTHS.forEach(m => {
    rev_total[m.key] =
      (rev_tm[m.key] || 0) +
      (rev_subs[m.key] || 0) +
      (rev_fixed[m.key] || 0) +
      (rev_soft[m.key] || 0) +
      (rev_unit[m.key] || 0);

    cost_total[m.key] =
      (cost_labor[m.key] || 0) +
      (cost_subs[m.key] || 0) +
      (cost_other[m.key] || 0);

    profit_total[m.key] = rev_total[m.key] - cost_total[m.key];
  });

  const rows = [];
  rows.push({ label: "REVENUE", group: "group", months: zeroMonths() });
  rows.push({ label: " T&M Labor Revenue", group: "rev", months: rev_tm });
  rows.push({ label: " Subs & ODC Revenue", group: "rev", months: rev_subs });
  rows.push({ label: " Fixed Revenue", group: "rev", months: rev_fixed });
  rows.push({ label: " Software Revenue", group: "rev", months: rev_soft });
  rows.push({ label: " Unit Revenue", group: "rev", months: rev_unit });
  rows.push({ label: "Total Revenue", group: "rev_total", months: rev_total });

  rows.push({ label: "", group: "spacer", months: zeroMonths() });
  rows.push({ label: "COST", group: "group", months: zeroMonths() });
  rows.push({ label: " Labor Cost", group: "cost", months: cost_labor });
  rows.push({ label: " Subs & ODC Cost", group: "cost", months: cost_subs });
  rows.push({ label: " Other Cost", group: "cost", months: cost_other });
  rows.push({ label: "Total Cost", group: "cost_total", months: cost_total });

  rows.push({ label: "", group: "spacer", months: zeroMonths() });
  rows.push({ label: "Profit (Total Revenue − Total Cost)", group: "profit", months: profit_total });

  return rows;
}

function computeRowTotal(monthsMap) {
  return MONTHS.reduce((sum, m) => sum + Number(monthsMap[m.key] || 0), 0);
}

function renderPnl(root, rows) {
  const tbody = $("#pnlBody", root);
  if (!tbody) return;

  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-10 text-slate-500 text-xs">No data available for this plan and Level 1 project.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  rows.forEach(row => {
    const tr = document.createElement("tr");
    let cls = "pnl-row-striped";
    if (row.group === "group") cls = "pnl-row-group-header";
    if (row.group === "rev_total" || row.group === "cost_total") cls = "pnl-row-total";
    if (row.group === "profit") cls = "pnl-row-profit";
    if (row.group === "spacer") cls = "";
    tr.className = cls;

    if (row.group === "spacer") {
      tr.innerHTML = `<td class="pnl-sticky-line pnl-col-line">&nbsp;</td>${MONTHS.map(() => `<td></td>`).join("")}<td></td>`;
      tbody.appendChild(tr);
      return;
    }

    const total = computeRowTotal(row.months);
    let html = `<td class="pnl-sticky-line pnl-col-line text-[11px] ${row.group.includes("total") || row.group === "profit" || row.group === "group" ? "font-semibold text-slate-900" : "text-slate-800"}">${row.label}</td>`;
    MONTHS.forEach(m => {
      html += `<td class="text-right text-[11px]">${fmtNum(row.months[m.key] || 0)}</td>`;
    });
    html += `<td class="text-right text-[11px] font-semibold">${fmtNum(total)}</td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });

  // Sticky bottom summary
  const summaryTr = document.createElement("tr");
  summaryTr.className = "pnl-summary-row";
  summaryTr.dataset.summaryRow = "pnl";
  const monthTotals = zeroMonths();
  let grand = 0;
  rows.forEach(r => {
    if (r.group === "group" || r.group === "spacer") return;
    MONTHS.forEach(m => { monthTotals[m.key] += Number(r.months[m.key] || 0); });
  });
  MONTHS.forEach(m => { grand += monthTotals[m.key]; });

  let summaryHtml = `<td class="pnl-sticky-line pnl-col-line text-[11px] font-semibold text-slate-900">Sum of all P&L lines</td>`;
  MONTHS.forEach(m => { summaryHtml += `<td class="text-right text-[11px]">${fmtNum(monthTotals[m.key])}</td>`; });
  summaryHtml += `<td class="text-right text-[11px] font-semibold">${fmtNum(grand)}</td>`;
  summaryTr.innerHTML = summaryHtml;
  tbody.appendChild(summaryTr);
}

async function refreshPnl(root, client) {
  const msg = $("#pnlMessage", root);
  const ctx = getPlanContext();

  if (!projectScope.length || !ctx.year || !ctx.versionId) {
    renderPnl(root, null);
    msg && (msg.textContent = "Please select a Level 1 project and plan first.");
    return;
  }

  msg && (msg.textContent = "Calculating P&L…");
  const projectIds = projectScope.map(p => p.id);

  try {
    const [laborRevCost, subsOdcCost, otherCost, manualRevByType] = await Promise.all([
      loadLaborRevenueAndCost(client, ctx, projectIds),
      loadSubsOdcCost(client, ctx, projectIds),
      loadOtherCost(client, ctx, projectIds),
      loadManualRevenueByType(client, ctx, projectIds),
    ]);

    const rows = buildPnlRows({ laborRevCost, subsOdcCost, otherCost, manualRevByType });
    renderPnl(root, rows);
    msg && (msg.textContent = "");
  } catch (err) {
    console.error("[PnL] refreshPnl error", err);
    renderPnl(root, null);
    msg && (msg.textContent = "Error loading P&L data.");
  }
}

export const pnlTab = {
  template,
  async init({ root, client }) {
    const msg = $("#pnlMessage", root);
    const section = $("#pnlSection", root);
    const ctx = getPlanContext();

    $("#pnlInlinePlan", root).textContent =
      ctx?.planLabel || (ctx?.year ? `BUDGET – ${ctx.year} · ${ctx.planType || "Working"}` : "P&L");
    if (ctx?.level1ProjectCode && ctx?.level1ProjectName) {
      $("#pnlInlinePlan", root).textContent += ` · Level 1 Project: ${ctx.level1ProjectCode} – ${ctx.level1ProjectName}`;
    }
    if (ctx?.projectCode && ctx?.projectName) {
      $("#pnlInlineProject", root).textContent = `, ${ctx.projectCode} – ${ctx.projectName}`;
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg.textContent = "Please select a Level 1 project and plan first.";
      section.style.display = "none";
      return;
    }

    projectScope = await loadProjectScope(client, ctx.level1ProjectId);
    projectMeta = {};
    projectScope.forEach(p => {
      projectMeta[p.id] = { code: p.project_code, name: p.name, label: `${p.project_code} – ${p.name}` };
    });

    if (!projectScope.length) {
      msg.textContent = "No projects found under this Level 1 project.";
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    await refreshPnl(root, client);
  },
};
