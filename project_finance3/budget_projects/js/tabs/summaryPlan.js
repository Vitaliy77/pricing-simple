// js/tabs/summaryPlan.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

// Months (align with P&L & Revenue tabs)
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
let charts = [];

export const template = /*html*/ `
  <article class="full-width-card">
    <style>
      .summary-kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 0.75rem;
      }
      .summary-kpi-card {
        border-radius: 0.5rem;
        border: 1px solid rgba(148, 163, 184, 0.4);
        padding: 0.5rem 0.75rem;
        background-color: #ffffff;
      }
      .summary-kpi-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #6b7280;
      }
      .summary-kpi-value {
        font-size: 0.9rem;
        font-weight: 600;
        color: #111827;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(0, 1.3fr);
        gap: 1rem;
      }

      @media (max-width: 900px) {
        .summary-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .summary-chart-card {
        border-radius: 0.5rem;
        border: 1px solid rgba(148, 163, 184, 0.4);
        padding: 0.75rem;
        background-color: #ffffff;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .summary-chart-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #4b5563;
        margin-bottom: 0.15rem;
      }

      .summary-chart-body {
        position: relative;
        height: 220px;
        max-height: 260px;
      }

      @media (max-height: 700px) {
        .summary-chart-body {
          height: 40vh;
          max-height: 280px;
        }
      }

      .summary-chart-card canvas {
        width: 100% !important;
        height: 100% !important;
        display: block;
      }
    </style>

    <!-- Header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="summaryInlinePlan" class="font-medium"></span>
        <span id="summaryInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Summary Financial Plan
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Monthly P&L and mix charts for the selected Level 1 project.
        </span>
      </div>

      <div id="summaryMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <!-- Body -->
    <div class="px-4 py-3 space-y-3">
      <!-- KPI strip -->
      <section>
        <div class="summary-kpi-grid">
          <div class="summary-kpi-card">
            <div class="summary-kpi-label">Total Revenue</div>
            <div id="summaryKpiRevenue" class="summary-kpi-value">–</div>
          </div>
          <div class="summary-kpi-card">
            <div class="summary-kpi-label">Total Cost</div>
            <div id="summaryKpiCost" class="summary-kpi-value">–</div>
          </div>
          <div class="summary-kpi-card">
            <div class="summary-kpi-label">Profit</div>
            <div id="summaryKpiProfit" class="summary-kpi-value">–</div>
          </div>
          <div class="summary-kpi-card">
            <div class="summary-kpi-label">Margin %</div>
            <div id="summaryKpiMargin" class="summary-kpi-value">–</div>
          </div>
        </div>
      </section>

      <!-- Charts -->
      <section class="space-y-3">
        <!-- Row 1: Monthly Revenue & Profit -->
        <div class="summary-grid">
          <div class="summary-chart-card">
            <div class="summary-chart-title">Monthly Revenue by Type</div>
            <div class="summary-chart-body">
              <canvas id="summaryChartRevenueByMonth"></canvas>
            </div>
          </div>
          <div class="summary-chart-card">
            <div class="summary-chart-title">Monthly Profit</div>
            <div class="summary-chart-body">
              <canvas id="summaryChartProfitByMonth"></canvas>
            </div>
          </div>
        </div>

        <!-- Row 2: Mix donuts -->
        <div class="summary-grid">
          <div class="summary-chart-card">
            <div class="summary-chart-title">Revenue Mix by Type</div>
            <div class="summary-chart-body">
              <canvas id="summaryChartRevenueMix"></canvas>
            </div>
          </div>
          <div class="summary-chart-card">
            <div class="summary-chart-title">Cost Mix by Type</div>
            <div class="summary-chart-body">
              <canvas id="summaryChartCostMix"></canvas>
            </div>
          </div>
        </div>
      </section>
    </div>
  </article>
`;

// ─────────────────────────────────────────────
// PUBLIC TAB EXPORT
// ─────────────────────────────────────────────
export const summaryPlanTab = {
  template,
  async init({ root, client }) {
    destroyCharts();

    const msg = $("#summaryMessage", root);
    const ctx = getPlanContext();

    const globalPlan =
      document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    const globalProject =
      document.querySelector("#currentProject")?.textContent?.trim() || "";

    const planSpan = $("#summaryInlinePlan", root);
    const projSpan = $("#summaryInlineProject", root);

    if (planSpan) planSpan.textContent = globalPlan;
    if (projSpan) {
      projSpan.textContent = globalProject ? `, ${globalProject}` : "";
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg && (msg.textContent =
        "Please select a Level 1 project and plan first.");
      renderKpis(root, null);
      return;
    }

    await loadProjectsUnderLevel1(client, ctx.level1ProjectId);

    if (!projectScope.length) {
      msg && (msg.textContent = "No projects under selected Level 1 project.");
      renderKpis(root, null);
      return;
    }

    msg && (msg.textContent = "Calculating summary…");

    try {
      const summary = await computeSummary(client, ctx);
      renderKpis(root, summary);
      renderCharts(root, summary);
      msg && (msg.textContent = "");
    } catch (err) {
      console.error("[Summary] error", err);
      msg && (msg.textContent = "Error calculating summary.");
      renderKpis(root, null);
    }
  },
};

// ─────────────────────────────────────────────
// PROJECT SCOPE
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
    console.error("[Summary] Error loading parent project", pErr);
    return;
  }

  const { data: children, error: cErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (cErr) {
    console.error("[Summary] Error loading child projects", cErr);
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

function aggToArray(agg) {
  return MONTH_FIELDS.map(m => Number(agg[m.col] || 0));
}

function sumArray(arr) {
  return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

function fmtCurrency(v) {
  if (v == null || Number.isNaN(v)) return "–";
  return v.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function fmtPercent(v) {
  if (v == null || !isFinite(v)) return "–";
  return `${(v * 100).toFixed(1)}%`;
}

// ─────────────────────────────────────────────
// DATA LOADERS – same logic as P&L
// ─────────────────────────────────────────────
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
    console.error("[Summary] labor_hours error", hErr);
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
      .select("id, hourly_cost, labor_categories(billing_rate)")
      .in("id", employeeIds);

    if (eErr) {
      console.error("[Summary] employees error", eErr);
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
    console.error("[Summary] manual revenue planning_lines error", error);
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
    else return;

    addLineToAgg(result[bucket], line, +1);
  });

  return result;
}

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
    console.error("[Summary] cost planning_lines error", error);
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

async function loadSubsOdcRevenueFromCost(client, ctx) {
  const costByType = await loadCostByType(client, ctx);
  const subsOdcRev = emptyAgg();
  addLineToAgg(subsOdcRev, costByType.subc, +1);
  addLineToAgg(subsOdcRev, costByType.odc, +1);
  return { subsOdcRev, costByType };
}

// ─────────────────────────────────────────────
// SUMMARY COMPUTE
// ─────────────────────────────────────────────
async function computeSummary(client, ctx) {
  const [
    laborRevCost,
    manualRev,
    subsOdcAndCost,
  ] = await Promise.all([
    loadLaborRevenueAndCost(client, ctx),
    loadManualRevenueByType(client, ctx),
    loadSubsOdcRevenueFromCost(client, ctx),
  ]);

  const laborCostFromHours = laborRevCost.laborCost || emptyAgg();
  const tmRevenue = laborRevCost.tmRevenue || emptyAgg();

  const rev_fixed = manualRev.fixed || emptyAgg();
  const rev_software = manualRev.software || emptyAgg();
  const rev_unit = manualRev.unit || emptyAgg();
  const rev_other = manualRev.other || emptyAgg();

  const subsOdcRev = subsOdcAndCost.subsOdcRev || emptyAgg();
  const costByType = subsOdcAndCost.costByType || {
    labor: emptyAgg(),
    subc: emptyAgg(),
    odc: emptyAgg(),
  };

  const laborCostCombined = emptyAgg();
  addLineToAgg(laborCostCombined, laborCostFromHours, +1);
  addLineToAgg(laborCostCombined, costByType.labor || emptyAgg(), +1);

  const subcCost = costByType.subc || emptyAgg();
  const odcCost = costByType.odc || emptyAgg();

  const rev_totalAgg = emptyAgg();
  [tmRevenue, rev_fixed, rev_software, rev_unit, rev_other, subsOdcRev].forEach(r =>
    addLineToAgg(rev_totalAgg, r, +1)
  );

  const cost_totalAgg = emptyAgg();
  [laborCostCombined, subcCost, odcCost].forEach(c =>
    addLineToAgg(cost_totalAgg, c, +1)
  );

  const profitAgg = emptyAgg();
  MONTH_FIELDS.forEach(({ col }) => {
    const r = Number(rev_totalAgg[col] || 0);
    const c = Number(cost_totalAgg[col] || 0);
    profitAgg[col] = r - c;
  });

  const monthlyRevenueByType = {
    labels: MONTH_FIELDS.map(m => m.label),
    tm: aggToArray(tmRevenue),
    fixed: aggToArray(rev_fixed),
    software: aggToArray(rev_software),
    unit: aggToArray(rev_unit),
    other: aggToArray(rev_other),
    subsOdc: aggToArray(subsOdcRev),
  };

  const monthlyProfit = aggToArray(profitAgg);

  const revenueMix = {
    labels: [
      "T&M Labor",
      "Fixed",
      "Software",
      "Unit",
      "Other",
      "Subs & ODC",
    ],
    values: [
      sumArray(monthlyRevenueByType.tm),
      sumArray(monthlyRevenueByType.fixed),
      sumArray(monthlyRevenueByType.software),
      sumArray(monthlyRevenueByType.unit),
      sumArray(monthlyRevenueByType.other),
      sumArray(monthlyRevenueByType.subsOdc),
    ],
  };

  const costMix = {
    labels: [
      "Labor",
      "Subcontractor",
      "Other Direct Costs",
    ],
    values: [
      sumArray(aggToArray(laborCostCombined)),
      sumArray(aggToArray(subcCost)),
      sumArray(aggToArray(odcCost)),
    ],
  };

  const totalRevenue = sumArray(aggToArray(rev_totalAgg));
  const totalCost = sumArray(aggToArray(cost_totalAgg));
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? totalProfit / totalRevenue : null;

  return {
    kpis: {
      totalRevenue,
      totalCost,
      totalProfit,
      margin,
    },
    monthlyRevenueByType,
    monthlyProfit,
    revenueMix,
    costMix,
  };
}

// ─────────────────────────────────────────────
// RENDER – KPIS
// ─────────────────────────────────────────────
function renderKpis(root, summary) {
  const revEl = $("#summaryKpiRevenue", root);
  const costEl = $("#summaryKpiCost", root);
  const profitEl = $("#summaryKpiProfit", root);
  const marginEl = $("#summaryKpiMargin", root);

  if (!summary) {
    if (revEl) revEl.textContent = "–";
    if (costEl) costEl.textContent = "–";
    if (profitEl) profitEl.textContent = "–";
    if (marginEl) marginEl.textContent = "–";
    return;
  }

  const { totalRevenue, totalCost, totalProfit, margin } = summary.kpis;

  if (revEl) revEl.textContent = fmtCurrency(totalRevenue);
  if (costEl) costEl.textContent = fmtCurrency(totalCost);
  if (profitEl) profitEl.textContent = fmtCurrency(totalProfit);
  if (marginEl) marginEl.textContent = fmtPercent(margin);
}

// ─────────────────────────────────────────────
// RENDER – CHARTS
// ─────────────────────────────────────────────
function destroyCharts() {
  charts.forEach(ch => {
    if (ch && typeof ch.destroy === "function") {
      ch.destroy();
    }
  });
  charts = [];
}

function renderCharts(root, summary) {
  destroyCharts();

  if (!summary) return;
  if (typeof window === "undefined" || !window.Chart) {
    console.warn("[Summary] Chart.js not available – charts skipped.");
    return;
  }

  const Chart = window.Chart;

  const revByMonthCanvas = $("#summaryChartRevenueByMonth", root);
  const profitCanvas = $("#summaryChartProfitByMonth", root);
  const revMixCanvas = $("#summaryChartRevenueMix", root);
  const costMixCanvas = $("#summaryChartCostMix", root);

  const {
    monthlyRevenueByType,
    monthlyProfit,
    revenueMix,
    costMix,
  } = summary;

  const revColors = {
    tm: "rgba(59, 130, 246, 0.7)",
    fixed: "rgba(16, 185, 129, 0.7)",
    software: "rgba(129, 140, 248, 0.7)",
    unit: "rgba(251, 191, 36, 0.7)",
    other: "rgba(148, 163, 184, 0.7)",
    subsOdc: "rgba(248, 113, 113, 0.7)"
  };

  const costColors = {
    labor: "rgba(59, 130, 246, 0.7)",
    subc: "rgba(251, 191, 36, 0.7)",
    odc: "rgba(148, 163, 184, 0.7)"
  };

  // 1) Monthly Revenue by Type – stacked bar with animation
  if (revByMonthCanvas) {
    const ctx = revByMonthCanvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: monthlyRevenueByType.labels,
        datasets: [
          { label: "T&M Labor", data: monthlyRevenueByType.tm, backgroundColor: revColors.tm },
          { label: "Fixed", data: monthlyRevenueByType.fixed, backgroundColor: revColors.fixed },
          { label: "Software", data: monthlyRevenueByType.software, backgroundColor: revColors.software },
          { label: "Unit", data: monthlyRevenueByType.unit, backgroundColor: revColors.unit },
          { label: "Other", data: monthlyRevenueByType.other, backgroundColor: revColors.other },
          { label: "Subs & ODC", data: monthlyRevenueByType.subsOdc, backgroundColor: revColors.subsOdc },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 900,
          easing: "easeOutQuart"
        },
        animations: {
          y: {
            from: 0,
            duration: 1000,
            easing: "easeOutCirc"
          }
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label(c) {
                return `${c.dataset.label}: ${fmtCurrency(c.parsed.y)}`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        }
      }
    });
    charts.push(chart);
  }

  // 2) Monthly Profit – line with soft fill
  if (profitCanvas) {
    const ctx = profitCanvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: MONTH_FIELDS.map(m => m.label),
        datasets: [{
          label: "Profit",
          data: monthlyProfit,
          borderColor: "rgba(22, 163, 74, 0.9)",
          backgroundColor: "rgba(22, 163, 74, 0.12)",
          tension: 0.2,
          fill: true,
          pointBackgroundColor: "rgba(22, 163, 74, 1)",
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 1100,
          easing: "easeOutQuart"
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(c) {
                return `Profit: ${fmtCurrency(c.parsed.y)}`;
              }
            }
          }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
    charts.push(chart);
  }

  // 3) Revenue Mix – donut with rotate + scale
  if (revMixCanvas) {
    const total = sumArray(revenueMix.values) || 1;
    const ctx = revMixCanvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: revenueMix.labels,
        datasets: [{
          data: revenueMix.values,
          backgroundColor: Object.values(revColors)
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 1100,
          easing: "easeOutQuart"
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label(c) {
                const pct = c.parsed / total;
                return `${c.label}: ${fmtCurrency(c.parsed)} (${fmtPercent(pct)})`;
              }
            }
          }
        }
      }
    });
    charts.push(chart);
  }

  // 4) Cost Mix – donut with rotate + scale
  if (costMixCanvas) {
    const total = sumArray(costMix.values) || 1;
    const ctx = costMixCanvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: costMix.labels,
        datasets: [{
          data: costMix.values,
          backgroundColor: Object.values(costColors)
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 1100,
          easing: "easeOutQuart"
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label(c) {
                const pct = c.parsed / total;
                return `${c.label}: ${fmtCurrency(c.parsed)} (${fmtPercent(pct)})`;
              }
            }
          }
        }
      }
    });
    charts.push(chart);
  }
}
