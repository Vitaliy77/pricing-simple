// js/tabs/summary.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";
import { getSelectedGrantId, setSelectedGrantId } from "../lib/grantContext.js";

export const template = /*html*/ `
  <article>
    <h3>Grant Summary</h3>

    <section style="max-width:700px;margin-bottom:0.75rem;">
      <label>
        Grant
        <select id="summaryGrantSelect" style="min-width:320px;">
          <option value="">— Select a grant —</option>
        </select>
      </label>
      <small id="msg"></small>
    </section>

    <section id="summaryContent">
      <p>No grant selected.</p>
    </section>

    <section id="summaryCharts" style="margin-top:1rem;display:none;">
      <h4>Dashboard</h4>

      <!-- Top row: two doughnut charts -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-bottom:1rem;">
        <div style="border:1px solid #ddd;border-radius:4px;padding:0.5rem;">
          <h5 style="margin-top:0;margin-bottom:0.3rem;font-size:0.95rem;">
            Total Award vs Budgeted
          </h5>
          <div style="height:260px;">
            <canvas id="chartAwardVsBudget"></canvas>
          </div>
        </div>

        <div style="border:1px solid #ddd;border-radius:4px;padding:0.5rem;">
          <h5 style="margin-top:0;margin-bottom:0.3rem;font-size:0.95rem;">
            Total Budget vs Estimated Total Spend
          </h5>
          <div style="height:260px;">
            <canvas id="chartBudgetVsEstTotal"></canvas>
          </div>
        </div>
      </div>

      <!-- Full-width monthly chart -->
      <div style="border:1px solid #ddd;border-radius:4px;padding:0.5rem;">
        <h5 style="margin-top:0;margin-bottom:0.3rem;font-size:0.95rem;">
          Monthly Budget vs Actuals
        </h5>
        <div style="width:100%;height:380px;">
          <canvas id="chartMonthly"></canvas>
        </div>
      </div>
    </section>
  </article>
`;

let rootEl = null;

// Charts
let chartAwardVsBudget = null;
let chartBudgetVsEstTotal = null;
let chartMonthly = null;
let chartsRegistered = false;

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#msg", rootEl);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
}

const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export async function init(root, params = {}) {
  rootEl = root;
  rootEl.innerHTML = template;

  await loadGrantOptions();

  const sel = $("#summaryGrantSelect", rootEl);
  const fromParams = params.grantId || params.grant_id;
  const fromGlobal = getSelectedGrantId();
  let chosen = null;

  if (fromParams && sel.querySelector(`option[value="${fromParams}"]`)) {
    chosen = fromParams;
    sel.value = fromParams;
    setSelectedGrantId(fromParams);
  } else if (fromGlobal && sel.querySelector(`option[value="${fromGlobal}"]`)) {
    chosen = fromGlobal;
    sel.value = fromGlobal;
  }

  if (chosen) {
    await loadSummary(chosen);
  } else {
    $("#summaryContent", rootEl).innerHTML = "<p>No grant selected.</p>";
    const chSection = $("#summaryCharts", rootEl);
    if (chSection) chSection.style.display = "none";
  }

  sel.addEventListener("change", async (e) => {
    const id = e.target.value || null;
    setSelectedGrantId(id || null);
    if (!id) {
      $("#summaryContent", rootEl).innerHTML = "<p>No grant selected.</p>";
      const chSection = $("#summaryCharts", rootEl);
      if (chSection) chSection.style.display = "none";
      return;
    }
    await loadSummary(id);
  });
}

async function loadGrantOptions() {
  const sel = $("#summaryGrantSelect", rootEl);
  sel.innerHTML = '<option value="">— Select a grant —</option>';

  const { data, error } = await client
    .from("grants")
    .select("id,name,grant_id,status")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[summary] loadGrantOptions error", error);
    msg(error.message, true);
    return;
  }

  (data || []).forEach((g) => {
    const label = g.grant_id ? `${g.name} (${g.grant_id})` : g.name;
    sel.appendChild(new Option(label, g.id));
  });
}

async function loadSummary(grantId) {
  msg("Loading…");
  try {
    // 1) Grant info
    const { data: grant, error: gErr } = await client
      .from("grants")
      .select(
        "id,name,grant_id,funder,start_date,end_date,total_award,status"
      )
      .eq("id", grantId)
      .maybeSingle();

    if (gErr) throw gErr;
    if (!grant) {
      $("#summaryContent", rootEl).innerHTML = "<p>Grant not found.</p>";
      msg("");
      const chSection = $("#summaryCharts", rootEl);
      if (chSection) chSection.style.display = "none";
      return;
    }

    // 2) Budget + actuals (with dates)
    const [labRes, dirRes, catsRes, actRes] = await Promise.all([
      client
        .from("budget_labor")
        .select("category_id,ym,hours")
        .eq("grant_id", grantId),
      client
        .from("budget_direct")
        .select("ym,amount")
        .eq("grant_id", grantId),
      client
        .from("labor_categories")
        .select("id,hourly_rate")
        .eq("is_active", true),
      client
        .from("actuals_net")
        .select("date,amount_net,grant_id")
        .eq("grant_id", grantId),
    ]);

    if (labRes.error) throw labRes.error;
    if (dirRes.error) throw dirRes.error;
    if (catsRes.error) throw catsRes.error;
    if (actRes.error) throw actRes.error;

    const laborRows = labRes.data || [];
    const directRows = dirRes.data || [];
    const cats = catsRes.data || [];
    const actuals = actRes.data || [];

    const rateById = Object.fromEntries(
      cats.map((c) => [c.id, Number(c.hourly_rate ?? 0)])
    );

    // --- Budget totals ---
    let budgetLabor = 0;
    const budgetLaborByMonth = {}; // ym (Y-M-D) -> $
    laborRows.forEach((r) => {
      const hrs = Number(r.hours ?? 0);
      const rate = rateById[r.category_id] ?? 0;
      const amt = hrs * rate;
      budgetLabor += amt;
      if (!r.ym) return;
      if (!budgetLaborByMonth[r.ym]) budgetLaborByMonth[r.ym] = 0;
      budgetLaborByMonth[r.ym] += amt;
    });

    const budgetDirectByMonth = {};
    const budgetDirect = directRows.reduce((sum, r) => {
      const v = Number(r.amount ?? 0);
      if (r.ym) {
        if (!budgetDirectByMonth[r.ym]) budgetDirectByMonth[r.ym] = 0;
        budgetDirectByMonth[r.ym] += v;
      }
      return sum + v;
    }, 0);

    const budgetTotal = budgetLabor + budgetDirect;

    // --- Actual totals & monthly ---
    const actualByMonth = {};
    let actualTotal = 0;
    for (const a of actuals) {
      const amt = Number(a.amount_net ?? 0);
      actualTotal += amt;
      if (!a.date) continue;
      const ym = a.date.slice(0, 7); // YYYY-MM
      if (!actualByMonth[ym]) actualByMonth[ym] = 0;
      actualByMonth[ym] += amt;
    }

    // --- Period of performance months ---
    const { monthsList, ymList } = buildMonthRange(
      grant.start_date,
      grant.end_date
    );

    // Build monthly budget & actual arrays aligned to PoP
    const monthlyBudget = ymList.map((ym) => {
      const laborSum = Object.entries(budgetLaborByMonth).reduce(
        (acc, [k, v]) => (k.startsWith(ym) ? acc + v : acc),
        0
      );
      const directSum = Object.entries(budgetDirectByMonth).reduce(
        (acc, [k, v]) => (k.startsWith(ym) ? acc + v : acc),
        0
      );
      return laborSum + directSum;
    });

    const monthlyActual = ymList.map((ym) => actualByMonth[ym] || 0);

    // --- Estimated total (prorated) ---
    const actualMonthsWithData = Object.keys(actualByMonth).length;
    const totalPoPMonths = ymList.length;
    let estimatedTotal = 0;
    if (actualMonthsWithData > 0 && totalPoPMonths > 0) {
      const avgPerMonth = actualTotal / actualMonthsWithData;
      estimatedTotal = avgPerMonth * totalPoPMonths;
    }

    const varianceTotal = budgetTotal - actualTotal;

    renderSummary(grant, {
      budgetLabor,
      budgetDirect,
      budgetTotal,
      actualTotal,
      varianceTotal,
      estimatedTotal,
    });

    renderCharts(grant, {
      budgetTotal,
      actualTotal,
      estimatedTotal,
      monthsList,
      monthlyBudget,
      monthlyActual,
    });

    msg("");
  } catch (e) {
    console.error("[summary] loadSummary error", e);
    msg(e.message || String(e), true);
    $("#summaryContent", rootEl).innerHTML = "<p>Failed to load summary.</p>";
    const chSection = $("#summaryCharts", rootEl);
    if (chSection) chSection.style.display = "none";
  }
}

function buildMonthRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return { monthsList: [], ymList: [] };
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { monthsList: [], ymList: [] };
  }

  const monthsList = [];
  const ymList = [];

  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cur <= last) {
    const ym = cur.toISOString().slice(0, 7); // YYYY-MM
    ymList.push(ym);
    const label = cur.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });
    monthsList.push(label);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  return { monthsList, ymList };
}

function renderSummary(grant, totals) {
  const box = $("#summaryContent", rootEl);
  if (!box) return;

  const {
    budgetLabor,
    budgetDirect,
    budgetTotal,
    actualTotal,
    varianceTotal,
    estimatedTotal,
  } = totals;

  const html = `
    <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;">
      <div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;">Grant</h4>
        <div><strong>${grant.name}</strong> ${
    grant.grant_id ? `(${grant.grant_id})` : ""
  }</div>
        <div>Funder: ${grant.funder || "—"}</div>
        <div>Period: ${grant.start_date || ""} → ${grant.end_date || ""}</div>
        <div>Total Award: ${
          grant.total_award != null ? fmt2(grant.total_award) : "—"
        }</div>
        <div>Status: ${grant.status || "—"}</div>
      </div>

      <div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;">Budget</h4>
        <div>Labor: ${fmt2(budgetLabor)}</div>
        <div>Other Direct: ${fmt2(budgetDirect)}</div>
        <div><strong>Total Budget: ${fmt2(budgetTotal)}</strong></div>
      </div>

      <div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;">Actuals</h4>
        <div><strong>Total Actuals: ${fmt2(actualTotal)}</strong></div>
        <div>Estimated Total Spend: ${fmt2(estimatedTotal)}</div>
      </div>

      <div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;">Variance</h4>
        <div>Total Variance (Budget – Actual): ${
          varianceTotal >= 0 ? "" : "-"
        }${fmt2(Math.abs(varianceTotal))}</div>
      </div>
    </section>
  `;

  box.innerHTML = html;
}

/* ---------- Charts ---------- */

function renderCharts(grant, chartData) {
  const section = $("#summaryCharts", rootEl);
  if (!section) return;

  if (typeof window.Chart === "undefined") {
    console.warn("[summary] Chart.js not available; skipping charts");
    section.style.display = "none";
    return;
  }

  if (typeof window.ChartDataLabels !== "undefined" && !chartsRegistered) {
    window.Chart.register(window.ChartDataLabels);
    chartsRegistered = true;
  }

  // Use global default font size if set; otherwise fallback to 18
  const baseFontSize =
    (window.Chart && window.Chart.defaults && window.Chart.defaults.font && window.Chart.defaults.font.size) ||
    18;

  section.style.display = "block";

  const {
    budgetTotal,
    actualTotal,
    estimatedTotal,
    monthsList,
    monthlyBudget,
    monthlyActual,
  } = chartData;

  const totalAward = Number(grant.total_award ?? 0);
  const safeAward = totalAward > 0 ? totalAward : 0;
  const safeBudget = budgetTotal > 0 ? budgetTotal : 0;
  const safeActual = actualTotal > 0 ? actualTotal : 0;
  const safeEstTotal = estimatedTotal > 0 ? estimatedTotal : 0;

  /* --- Doughnut 1: Total Award vs Budgeted --- */
  const remaining = Math.max(safeAward - safeBudget, 0);
  const ctx1 = $("#chartAwardVsBudget", rootEl)?.getContext("2d");

  if (ctx1) {
    if (chartAwardVsBudget) chartAwardVsBudget.destroy();
    const dataArr = [safeBudget, remaining];
    const total = dataArr.reduce((a, b) => a + b, 0) || 1;

    chartAwardVsBudget = new window.Chart(ctx1, {
      type: "doughnut",
      data: {
        labels: ["Budgeted", "Unallocated Award"],
        datasets: [
          {
            data: dataArr,
            backgroundColor: [
              "rgba(37, 99, 235, 0.75)",   // blue
              "rgba(148, 163, 184, 0.6)",  // gray-ish
            ],
            borderColor: [
              "rgba(37, 99, 235, 1)",
              "rgba(148, 163, 184, 1)",
            ],
            borderWidth: 1,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { font: { size: baseFontSize } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const pct = ((val / total) * 100) || 0;
                return `${ctx.label}: ${fmt2(val)} (${pct.toFixed(1)}%)`;
              },
            },
          },
          datalabels: {
            color: "#111",
            font: { size: baseFontSize, weight: "500" },
            formatter: (val) => {
              const pct = ((val / total) * 100) || 0;
              return `${pct.toFixed(1)}%`;
            },
          },
        },
      },
    });
  }

  /* --- Doughnut 2: Total Budget vs Estimated Total Spend --- */
  const ctx2 = $("#chartBudgetVsEstTotal", rootEl)?.getContext("2d");
  if (ctx2) {
    if (chartBudgetVsEstTotal) chartBudgetVsEstTotal.destroy();
    const dataArr = [safeBudget, safeEstTotal];
    const total = dataArr.reduce((a, b) => a + b, 0) || 1;

    chartBudgetVsEstTotal = new window.Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: ["Budget", "Estimated Total Spend"],
        datasets: [
          {
            data: dataArr,
            backgroundColor: [
              "rgba(37, 99, 235, 0.75)",   // blue
              "rgba(250, 204, 21, 0.75)",  // yellow
            ],
            borderColor: [
              "rgba(37, 99, 235, 1)",
              "rgba(250, 204, 21, 1)",
            ],
            borderWidth: 1,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { font: { size: baseFontSize } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const pct = ((val / total) * 100) || 0;
                return `${ctx.label}: ${fmt2(val)} (${pct.toFixed(1)}%)`;
              },
            },
          },
          datalabels: {
            color: "#111",
            font: { size: baseFontSize, weight: "500" },
            formatter: (val) => {
              const pct = ((val / total) * 100) || 0;
              return `${pct.toFixed(1)}%`;
            },
          },
        },
      },
    });
  }

  /* --- Chart 3: Monthly Budget vs Actual (full-width) --- */
  const ctx3 = $("#chartMonthly", rootEl)?.getContext("2d");
  if (ctx3) {
    if (chartMonthly) chartMonthly.destroy();

    chartMonthly = new window.Chart(ctx3, {
      type: "bar",
      data: {
        labels: monthsList,
        datasets: [
          {
            type: "line",
            label: "Budget",
            data: monthlyBudget,
            borderColor: "rgba(37, 99, 235, 1)",
            backgroundColor: "rgba(37, 99, 235, 0.15)",
            borderWidth: 2,
            tension: 0.2,
            yAxisID: "y",
          },
          {
            type: "bar",
            label: "Actuals",
            data: monthlyActual,
            backgroundColor: "rgba(250, 204, 21, 0.75)", // yellow
            borderColor: "rgba(250, 204, 21, 1)",
            borderWidth: 1,
            yAxisID: "y",
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            labels: { font: { size: baseFontSize } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y ?? ctx.parsed;
                return `${ctx.dataset.label}: ${fmt2(val)}`;
              },
            },
          },
          datalabels: {
            display: false, // monthly labels would be too busy
          },
        },
        scales: {
          x: {
            ticks: { font: { size: baseFontSize } },
          },
          y: {
            ticks: {
              font: { size: baseFontSize },
              callback: (v) => fmt2(v),
            },
          },
        },
      },
    });
  }
}
