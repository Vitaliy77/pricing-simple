// js/tabs/summaryPlan.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

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

// ... [all your existing functions up to renderCharts remain unchanged] ...

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

  // Softer, semi-transparent, modern color palette
  const revColors = {
    tm: "rgba(59, 130, 246, 0.7)",      // soft blue
    fixed: "rgba(16, 185, 129, 0.7)",   // soft emerald
    software: "rgba(129, 140, 248, 0.7)", // soft indigo
    unit: "rgba(251, 191, 36, 0.7)",    // soft amber
    other: "rgba(148, 163, 184, 0.7)",  // soft slate
    subsOdc: "rgba(248, 113, 113, 0.7)" // soft red
  };

  const costColors = {
    labor: "rgba(59, 130, 246, 0.7)",   // same soft blue
    subc: "rgba(251, 191, 36, 0.7)",    // amber
    odc: "rgba(148, 163, 184, 0.7)",    // slate
  };

  // 1) Monthly Revenue by Type – Stacked Bar
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
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${fmtCurrency(c.parsed.y)}`
            }
          }
        },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      },
    });
    charts.push(chart);
  }

  // 2) Monthly Profit – Softer green line with light fill
  if (profitCanvas) {
    const ctx = profitCanvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: MONTH_FIELDS.map(m => m.label),
        datasets: [
          {
            label: "Profit",
            data: monthlyProfit,
            borderColor: "rgba(22, 163, 74, 0.9)",        // soft green line
            backgroundColor: "rgba(22, 163, 74, 0.12)",   // very light fill
            tension: 0.15,
            fill: true,
            pointBackgroundColor: "rgba(22, 163, 74, 1)",
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `Profit: ${fmtCurrency(c.parsed.y)}`
            }
          }
        },
        scales: { y: { beginAtZero: true } },
      },
    });
    charts.push(chart);
  }

  // 3) Revenue Mix Donut
  if (revMixCanvas) {
    const ctx = revMixCanvas.getContext("2d");
    const total = sumArray(revenueMix.values) || 1;
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: revenueMix.labels,
        datasets: [{
          data: revenueMix.values,
          backgroundColor: [
            revColors.tm,
            revColors.fixed,
            revColors.software,
            revColors.unit,
            revColors.other,
            revColors.subsOdc,
          ],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const pct = c.parsed / total;
                return `${c.label}: ${fmtCurrency(c.parsed)} (${fmtPercent(pct)})`;
              }
            }
          }
        },
        cutout: "55%",
      },
    });
    charts.push(chart);
  }

  // 4) Cost Mix Donut
  if (costMixCanvas) {
    const ctx = costMixCanvas.getContext("2d");
    const total = sumArray(costMix.values) || 1;
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: costMix.labels,
        datasets: [{
          data: costMix.values,
          backgroundColor: [
            costColors.labor,
            costColors.subc,
            costColors.odc,
          ],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const pct = c.parsed / total;
                return `${c.label}: ${fmtCurrency(c.parsed)} (${fmtPercent(pct)})`;
              }
            }
          }
        },
        cutout: "55%",
      },
    });
    charts.push(chart);
  }
}

// Keep all other functions (loadProjectsUnderLevel1, computeSummary, etc.) exactly as they were
// ... [everything else remains unchanged] ...
