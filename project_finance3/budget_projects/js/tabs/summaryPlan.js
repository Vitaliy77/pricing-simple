// js/tabs/summaryPlan.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// TEMPLATE
// ─────────────────────────────────────────────

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

      .summary-grid-charts {
        align-items: stretch;
      }

      .summary-column {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
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
        height: 330px;        /* increased by ~50% */
        max-height: 390px;
      }

      @media (max-height: 700px) {
        .summary-chart-body {
          height: 60vh;
          max-height: 420px;
        }
      }

      .summary-chart-card canvas {
        width: 100% !important;
        height: 100% !important;
        display: block;
      }
    </style>

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

    <div class="px-4 py-3 space-y-3">
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

      <section class="space-y-3">
        <div class="summary-grid summary-grid-charts">
          <!-- LEFT COLUMN: Revenue bar + Profit -->
          <div class="summary-column">
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

          <!-- RIGHT COLUMN: Revenue Mix + Cost Mix (same sizes) -->
          <div class="summary-column">
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
        </div>
      </section>
    </div>
  </article>
`;

// ─────────────────────────────────────────────
// EXPORT TAB
// ─────────────────────────────────────────────

export const summaryPlanTab = {
  template,
  async init({ root, client }) {
    const msg = $("#summaryMessage", root);
    const ctx = getPlanContext();

    // Inline header from global context
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
      msg && (msg.textContent = "Please select a Level 1 project and plan first.");
      renderSummary(root, null);
      return;
    }

    await loadProjectsUnderLevel1(client, ctx.level1ProjectId);

    if (!projectScope.length) {
      msg && (msg.textContent = "No projects under selected Level 1 project.");
      renderSummary(root, null);
      return;
    }

    msg && (msg.textContent = "Calculating summary…");

    try {
      const summary = await computeSummary(client, ctx);
      renderSummary(root, summary);
      msg && (msg.textContent = "");
    } catch (err) {
      console.error("[Summary] error computing summary", err);
      msg && (msg.textContent = "Error computing summary.");
      renderSummary(root, null);
    }
  },
};

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

function sumArray(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

function fmtCurrency(v) {
  const num = Number(v || 0);
  return num.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function fmtPercent(v) {
  const num = Number(v || 0);
  return (num * 100).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  }) + "%";
}

// ─────────────────────────────────────────────
// PROJECT SCOPE (same logic as other tabs)
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
  all.forEach((p) => {
    projectMeta[p.id] = {
      project_code: p.project_code,
      name: p.name,
      label: `${p.project_code} – ${p.name}`,
    };
  });
}

// ─────────────────────────────────────────────
// DATA LOADERS (reuse P&L logic)
// ─────────────────────────────────────────────

// A) T&M Labor: revenue & cost from labor_hours × rates
async function loadLaborRevenueAndCost(client, ctx) {
  const result = {
    tmRevenue: emptyAgg(),
    laborCost: emptyAgg(),
  };

  const projectIds = projectScope.map((p) => p.id);
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
    new Set(hours.map((r) => r.employee_id).filter(Boolean))
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
      (emps || []).forEach((e) => {
        const billingRate = Number(e.labor_categories?.billing_rate || 0);
        empMap.set(e.id, {
          hourly_cost: Number(e.hourly_cost || 0),
          billing_rate: billingRate,
        });
      });
    }
  }

  const addToAggFromYm = (agg, ymStr, amount) => {
    if (!ymStr) return;
    const d = new Date(ymStr);
    if (Number.isNaN(d.getTime())) return;
    const monthIdx = d.getUTCMonth();
    const mf = MONTH_FIELDS.find((m) => m.idx === monthIdx);
    if (!mf) return;
    agg[mf.col] += amount;
  };

  for (const row of hours) {
    const emp = empMap.get(row.employee_id) || {};
    const hrs = Number(row.hours || 0);

    const hourlyCost = emp.hourly_cost || 0;
    const effectiveRate =
      typeof emp.billing_rate === "number" &&
      !Number.isNaN(emp.billing_rate) &&
      emp.billing_rate > 0
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

  const projectIds = projectScope.map((p) => p.id);
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

  data.forEach((line) => {
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

// C) Cost by type from planning_lines (DIR_LAB_COST, SUBC_COST, ODC_COST)
async function loadCostByType(client, ctx) {
  const result = {
    labor: emptyAgg(),
    subc: emptyAgg(),
    odc: emptyAgg(),
  };

  const projectIds = projectScope.map((p) => p.id);
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

  data.forEach((line) => {
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

// D) Subs & ODC revenue = cost (mirror) for this summary
async function loadSubsOdcRevenueFromCost(client, ctx) {
  const costByType = await loadCostByType(client, ctx);
  const subsOdcRev = emptyAgg();
  addLineToAgg(subsOdcRev, costByType.subc, +1);
  addLineToAgg(subsOdcRev, costByType.odc, +1);
  return { subsOdcRev, costByType };
}

// ─────────────────────────────────────────────
// SUMMARY COMPUTATION
// ─────────────────────────────────────────────

async function computeSummary(client, ctx) {
  const [laborRevCost, manualRev, subsOdcAndCost] = await Promise.all([
    loadLaborRevenueAndCost(client, ctx),
    loadManualRevenueByType(client, ctx),
    loadSubsOdcRevenueFromCost(client, ctx),
  ]);

  const { tmRevenue, laborCost } = laborRevCost;
  const { fixed, software, unit, other } = manualRev;
  const { subsOdcRev, costByType } = subsOdcAndCost;

  const cost_labor = costByType.labor || laborCost || emptyAgg();
  const cost_subc = costByType.subc || emptyAgg();
  const cost_odc = costByType.odc || emptyAgg();

  const rev_total = emptyAgg();
  const cost_total = emptyAgg();
  const profitAgg = emptyAgg();

  [tmRevenue, fixed, software, unit, other, subsOdcRev].forEach((r) =>
    addLineToAgg(rev_total, r, +1)
  );
  [cost_labor, cost_subc, cost_odc].forEach((c) =>
    addLineToAgg(cost_total, c, +1)
  );

  MONTH_FIELDS.forEach(({ col }) => {
    const r = Number(rev_total[col] || 0);
    const c = Number(cost_total[col] || 0);
    profitAgg[col] = r - c;
  });

  // Monthly arrays for charts
  const monthlyRevenueByType = {
    labels: MONTH_FIELDS.map((m) => m.label),
    tm: MONTH_FIELDS.map((m) => tmRevenue[m.col] || 0),
    fixed: MONTH_FIELDS.map((m) => fixed[m.col] || 0),
    software: MONTH_FIELDS.map((m) => software[m.col] || 0),
    unit: MONTH_FIELDS.map((m) => unit[m.col] || 0),
    other: MONTH_FIELDS.map((m) => other[m.col] || 0),
    subsOdc: MONTH_FIELDS.map((m) => subsOdcRev[m.col] || 0),
  };

  const monthlyProfit = MONTH_FIELDS.map((m) => profitAgg[m.col] || 0);

  // Mix charts totals
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
      sumArray(MONTH_FIELDS.map((m) => tmRevenue[m.col] || 0)),
      sumArray(MONTH_FIELDS.map((m) => fixed[m.col] || 0)),
      sumArray(MONTH_FIELDS.map((m) => software[m.col] || 0)),
      sumArray(MONTH_FIELDS.map((m) => unit[m.col] || 0)),
      sumArray(MONTH_FIELDS.map((m) => other[m.col] || 0)),
      sumArray(MONTH_FIELDS.map((m) => subsOdcRev[m.col] || 0)),
    ],
  };

  const costMix = {
    labels: ["Labor", "Subcontractor", "Other Direct Costs"],
    values: [
      sumArray(MONTH_FIELDS.map((m) => cost_labor[m.col] || 0)),
      sumArray(MONTH_FIELDS.map((m) => cost_subc[m.col] || 0)),
      sumArray(MONTH_FIELDS.map((m) => cost_odc[m.col] || 0)),
    ],
  };

  const totalRevenue = sumArray(revenueMix.values);
  const totalCost = sumArray(costMix.values);
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue ? totalProfit / totalRevenue : 0;

  return {
    monthlyRevenueByType,
    monthlyProfit,
    revenueMix,
    costMix,
    kpis: {
      totalRevenue,
      totalCost,
      totalProfit,
      margin,
    },
  };
}

// ─────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────

function renderSummary(root, summary) {
  const kpiRev = $("#summaryKpiRevenue", root);
  const kpiCost = $("#summaryKpiCost", root);
  const kpiProfit = $("#summaryKpiProfit", root);
  const kpiMargin = $("#summaryKpiMargin", root);

  if (!summary) {
    if (kpiRev) kpiRev.textContent = "–";
    if (kpiCost) kpiCost.textContent = "–";
    if (kpiProfit) kpiProfit.textContent = "–";
    if (kpiMargin) kpiMargin.textContent = "–";
    destroyCharts();
    return;
  }

  const { kpis } = summary;

  if (kpiRev) kpiRev.textContent = fmtCurrency(kpis.totalRevenue);
  if (kpiCost) kpiCost.textContent = fmtCurrency(kpis.totalCost);
  if (kpiProfit) kpiProfit.textContent = fmtCurrency(kpis.totalProfit);
  if (kpiMargin) kpiMargin.textContent = fmtPercent(kpis.margin);

  renderCharts(root, summary);
}

function destroyCharts() {
  charts.forEach((ch) => {
    try {
      ch.destroy();
    } catch (e) {
      // ignore
    }
  });
  charts = [];
}

// ─────────────────────────────────────────────
// CHARTS WITH DATALABELS
// ─────────────────────────────────────────────

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

  // Semi-transparent color palette
  const revColors = {
    tm: "rgba(59, 130, 246, 0.55)",
    fixed: "rgba(16, 185, 129, 0.55)",
    software: "rgba(129, 140, 248, 0.55)",
    unit: "rgba(251, 191, 36, 0.55)",
    other: "rgba(148, 163, 184, 0.55)",
    subsOdc: "rgba(248, 113, 113, 0.55)",
  };

  const costColors = {
    labor: "rgba(59, 130, 246, 0.55)",
    subc: "rgba(251, 191, 36, 0.55)",
    odc: "rgba(148, 163, 184, 0.55)",
  };

  // 1) Monthly Revenue by Type – Stacked bar with ONE total label per month
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
        animation: { duration: 900, easing: "easeOutQuart" },
        animations: { y: { from: 0, duration: 1000, easing: "easeOutCirc" } },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${fmtCurrency(c.parsed.y)}`,
            },
          },
          datalabels: {
            display: true,
            anchor: "end",
            align: "end",
            clamp: true,
            offset: 2,
            color: "#111827",
            font: { size: 9, weight: "500" },
            // Only show ONE label per month: total stack, on last dataset
            formatter: (value, ctx) => {
              if (!value) return "";
              const { dataIndex, datasetIndex, chart } = ctx;
              const datasets = chart.data.datasets || [];
              const lastIdx = datasets.length - 1;
              if (datasetIndex !== lastIdx) return "";

              let total = 0;
              datasets.forEach(ds => {
                const v = Number(ds.data?.[dataIndex] || 0);
                if (!Number.isNaN(v)) total += v;
              });
              return total ? fmtCurrency(total) : "";
            },
          },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
    charts.push(chart);
  }

  // 2) Monthly Profit – Line with values above points
  if (profitCanvas) {
    const ctx = profitCanvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: MONTH_FIELDS.map((m) => m.label),
        datasets: [
          {
            label: "Profit",
            data: monthlyProfit,
            borderColor: "rgba(22, 163, 74, 0.9)",
            backgroundColor: "rgba(22, 163, 74, 0.2)",
            tension: 0.2,
            fill: true,
            pointBackgroundColor: "rgba(22, 163, 74, 0.95)",
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1100, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `Profit: ${fmtCurrency(c.parsed.y)}`,
            },
          },
          datalabels: {
            display: true,
            anchor: "end",
            align: "top",
            color: "#065f46",
            font: { size: 9, weight: "600" },
            formatter: (value) => (value ? fmtCurrency(value) : ""),
          },
        },
        scales: { y: { beginAtZero: true } },
      },
    });
    charts.push(chart);
  }

  // 3) Revenue Mix – Donut with semi-transparent slices
  if (revMixCanvas) {
    const total = sumArray(revenueMix.values) || 1;
    const ctx = revMixCanvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: revenueMix.labels,
        datasets: [
          {
            data: revenueMix.values,
            backgroundColor: Object.values(revColors),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 1100,
          easing: "easeOutQuart",
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const pct = c.parsed / total;
                return `${c.label}: ${fmtCurrency(c.parsed)} (${fmtPercent(pct)})`;
              },
            },
          },
          datalabels: {
            display: true,
            color: "#111827",
            font: { size: 9, weight: "600" },
            formatter: (value) => {
              if (!value) return "";
              const pct = value / total;
              return `${fmtCurrency(value)}\n${fmtPercent(pct)}`;
            },
          },
        },
      },
    });
    charts.push(chart);
  }

  // 4) Cost Mix – Donut with semi-transparent slices
  if (costMixCanvas) {
    const total = sumArray(costMix.values) || 1;
    const ctx = costMixCanvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: costMix.labels,
        datasets: [
          {
            data: costMix.values,
            backgroundColor: Object.values(costColors),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 1100,
          easing: "easeOutQuart",
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const pct = c.parsed / total;
                return `${c.label}: ${fmtCurrency(c.parsed)} (${fmtPercent(pct)})`;
              },
            },
          },
          datalabels: {
            display: true,
            color: "#111827",
            font: { size: 9, weight: "600" },
            formatter: (value) => {
              if (!value) return "";
              const pct = value / total;
              return `${fmtCurrency(value)}\n${fmtPercent(pct)}`;
            },
          },
        },
      },
    });
    charts.push(chart);
  }
}
