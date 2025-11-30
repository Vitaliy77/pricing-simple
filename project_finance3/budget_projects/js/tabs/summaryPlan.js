// js/tabs/summaryPlan.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

// ... [all previous code unchanged up to renderCharts] ...

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

  // 1) Monthly Revenue by Type – Stacked bar with clean top labels
  if (revByMonthCanvas) {
    const ctx = revByMonthCanvas.getContext("2d");
    new Chart(ctx, {
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
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtCurrency(c.parsed.y)}` } },
          datalabels: {
            display: true,
            anchor: "end",
            align: "end",
            clamp: true,
            color: "#111827",
            font: { size: 9, weight: "500" },
            formatter: (value) => value ? fmtCurrency(value) : ""
          }
        },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
      }
    });
  }

  // 2) Monthly Profit – Line with values above points
  if (profitCanvas) {
    const ctx = profitCanvas.getContext("2d");
    new Chart(ctx, {
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
        animation: { duration: 1100, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => `Profit: ${fmtCurrency(c.parsed.y)}` } },
          datalabels: {
            display: true,
            anchor: "end",
            align: "top",
            color: "#065f46",
            font: { size: 9, weight: "600" },
            formatter: (value) => value ? fmtCurrency(value) : ""
          }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // 3) Revenue Mix – Donut with value + % on each slice
  if (revMixCanvas) {
    const total = sumArray(revenueMix.values) || 1;
    const ctx = revMixCanvas.getContext("2d");
    new Chart(ctx, {
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
        animation: { animateRotate: true, animateScale: true, duration: 1100, easing: "easeOutQuart" },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: c => {
                const pct = c.parsed / total;
                return `${c.label}: ${fmtCurrency(c.parsed)} (${fmtPercent(pct)})`;
              }
            }
          },
          datalabels: {
            display: true,
            color: "#111827",
            font: { size: 9, weight: "600" },
            formatter: (value) => {
              if (!value) return "";
              const pct = value / total;
              return `${fmtCurrency(value)}\n${fmtPercent(pct)}`;
            }
          }
        }
      }
    });
  }

  // 4) Cost Mix – Same beautiful value + % labels
  if (costMixCanvas) {
    const total = sumArray(costMix.values) || 1;
    const ctx = costMixCanvas.getContext("2d");
    new Chart(ctx, {
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
        animation: { animateRotate: true, animateScale: true, duration: 1100, easing: "easeOutQuart" },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: c => {
                const pct = c.parsed / total;
                return `${c.label}: ${fmtCurrency(c.parsed)} (${fmtPercent(pct)})`;
              }
            }
          },
          datalabels: {
            display: true,
            color: "#111827",
            font: { size: 9, weight: "600" },
            formatter: (value) => {
              if (!value) return "";
              const pct = value / total;
              return `${fmtCurrency(value)}\n${fmtPercent(pct)}`;
            }
          }
        }
      }
    });
  }
}
