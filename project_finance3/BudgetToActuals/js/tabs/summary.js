// js/tabs/summary.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";
import { getSelectedGrantId, setSelectedGrantId } from "../lib/grantContext.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.75rem;">Grant Summary</h3>

    <section style="max-width:720px;margin-bottom:0.75rem;">
      <label style="display:flex;flex-direction:column;gap:0.2rem;">
        <span>Grant</span>
        <select id="summaryGrantSelect" style="min-width:360px;padding:0.25rem 0.5rem;font-size:0.9rem;">
          <option value="">— Select a grant —</option>
        </select>
      </label>
      <small id="msg" style="display:block;margin-top:0.25rem;"></small>
    </section>

    <section id="summaryContent" style="margin-bottom:1rem;">
      <p>No grant selected.</p>
    </section>

    <section id="summaryCharts" style="margin-top:0.5rem;display:none;">
      <h4 style="margin:0 0 0.5rem 0;">Dashboard</h4>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0.75rem;margin-bottom:0.75rem;">
        <div style="border:1px solid #ddd;border-radius:6px;padding:0.6rem;background:#fafafa;">
          <h5 style="margin:0 0 0.3rem 0;font-size:0.9rem;">
            Total Award vs Budgeted
          </h5>
          <canvas id="chartAwardVsBudget" height="180"></canvas>
        </div>

        <div style="border:1px solid #ddd;border-radius:6px;padding:0.6rem;background:#fafafa;">
          <h5 style="margin:0 0 0.3rem 0;font-size:0.9rem;">
            Total Budget vs Actuals
          </h5>
          <canvas id="chartBudgetVsActualTotal" height="180"></canvas>
        </div>
      </div>

      <div style="border:1px solid #ddd;border-radius:6px;padding:0.6rem;background:#fafafa;">
        <h5 style="margin:0 0 0.3rem 0;font-size:0.9rem;">
          Monthly Budget vs Actuals
        </h5>
        <canvas id="chartMonthlyBudgetVsActual" height="220"></canvas>
      </div>
    </section>
  </article>
`;

let rootEl = null;
let chartAwardVsBudget = null;
let chartBudgetVsActualTotal = null;
let chartMonthlyBudgetVsActual = null;

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

    // 2) Budget + actuals (with ym for monthly charts)
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

    // --- Budget totals and monthly budget ---
    let budgetLabor = 0;
    const budgetByMonth = {}; // ym -> amount

    laborRows.forEach((r) => {
      const hrs = Number(r.hours ?? 0);
      const rate = rateById[r.category_id] ?? 0;
      const amt = hrs * rate;
      if (!r.ym) return;
      const ym = r.ym;
      budgetLabor += amt;
      budgetByMonth[ym] = (budgetByMonth[ym] || 0) + amt;
    });

    directRows.forEach((r) => {
      const amt = Number(r.amount ?? 0);
      if (!r.ym) return;
      const ym = r.ym;
      budgetByMonth[ym] = (budgetByMonth[ym] || 0) + amt;
    });

    const budgetDirect = directRows.reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0
    );
    const budgetTotal = budgetLabor + budgetDirect;

    // --- Actual totals and monthly actuals ---
    const actualByMonth = {}; // ym -> sum
    actuals.forEach((a) => {
      const amt = Number(a.amount_net ?? 0);
      if (!a.date) return;
      const ym = String(a.date).slice(0, 7) + "-01"; // normalize to first-of-month
      actualByMonth[ym] = (actualByMonth[ym] || 0) + amt;
    });

    const actualTotal = actuals.reduce(
      (sum, a) => sum + Number(a.amount_net ?? 0),
      0
    );

    const varianceTotal = budgetTotal - actualTotal;

    renderSummary(grant, {
      budgetLabor,
      budgetDirect,
      budgetTotal,
      actualTotal,
      varianceTotal,
    });

    renderCharts(grant, {
      budgetTotal,
      actualTotal,
      budgetByMonth,
      actualByMonth,
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

function renderSummary(grant, totals) {
  const box = $("#summaryContent", rootEl);
  if (!box) return;

  const {
    budgetLabor,
    budgetDirect,
    budgetTotal,
    actualTotal,
    varianceTotal,
  } = totals;

  const html = `
    <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0.6rem;">
      <div style="border:1px solid #ddd;border-radius:6px;padding:0.6rem;font-size:0.9rem;background:#fafafa;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;font-size:1rem;">Grant</h4>
        <div><strong>${grant.name}</strong> ${
    grant.grant_id ? `(${grant.grant_id})` : ""
  }</div>
        <div>Funder: ${grant.funder || "—"}</div>
        <div>Period: ${grant.start_date || ""} → ${
    grant.end_date || ""
  }</div>
        <div>Total Award: ${
          grant.total_award != null ? fmt2(grant.total_award) : "—"
        }</div>
        <div>Status: ${grant.status || "—"}</div>
      </div>

      <div style="border:1px solid #ddd;border-radius:6px;padding:0.6rem;font-size:0.9rem;background:#fafafa;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;font-size:1rem;">Budget</h4>
        <div>Labor: ${fmt2(budgetLabor)}</div>
        <div>Other Direct: ${fmt2(budgetDirect)}</div>
        <div><strong>Total Budget: ${fmt2(budgetTotal)}</strong></div>
      </div>

      <div style="border:1px solid #ddd;border-radius:6px;padding:0.6rem;font-size:0.9rem;background:#fafafa;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;font-size:1rem;">Actuals</h4>
        <div><strong>Total Actuals: ${fmt2(actualTotal)}</strong></div>
      </div>

      <div style="border:1px solid #ddd;border-radius:6px;padding:0.6rem;font-size:0.9rem;background:#fafafa;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;font-size:1rem;">Variance</h4>
        <div>Total Variance (Budget – Actual): ${
          varianceTotal >= 0 ? "" : "-"
        }${fmt2(Math.abs(varianceTotal))}</div>
      </div>
    </section>
  `;

  box.innerHTML = html;
}

/* ---------- Charts ---------- */

function renderCharts(grant, { budgetTotal, actualTotal, budgetByMonth, actualByMonth }) {
  const section = $("#summaryCharts", rootEl);
  if (!section) return;

  // If Chart.js is not loaded, just hide charts
  if (typeof window.Chart === "undefined") {
    console.warn("[summary] Chart.js not available; skipping charts");
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  const totalAward = Number(grant.total_award ?? 0);
  const safeAward = totalAward > 0 ? totalAward : 0;
  const safeBudget = budgetTotal > 0 ? budgetTotal : 0;
  const safeActual = actualTotal > 0 ? actualTotal : 0;

  // Shared color palette (no red)
  const colorBlue = "#2b6cb0";
  const colorYellow = "#ecc94b";
  const colorTeal = "#38b2ac";

  /* --- Chart 1: Total Award vs Budgeted (Pie) --- */
  const remaining = Math.max(safeAward - safeBudget, 0);
  const ctx1 = $("#chartAwardVsBudget", rootEl)?.getContext("2d");
  if (ctx1) {
    if (chartAwardVsBudget) chartAwardVsBudget.destroy();
    chartAwardVsBudget = new window.Chart(ctx1, {
      type: "pie",
      data: {
        labels: ["Budgeted", "Unallocated Award"],
        datasets: [
          {
            data: [safeBudget, remaining],
            backgroundColor: [colorBlue, colorYellow],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${fmt2(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }

  /* --- Chart 2: Total Budget vs Actuals (Bar) --- */
  const ctx2 = $("#chartBudgetVsActualTotal", rootEl)?.getContext("2d");
  if (ctx2) {
    if (chartBudgetVsActualTotal) chartBudgetVsActualTotal.destroy();
    chartBudgetVsActualTotal = new window.Chart(ctx2, {
      type: "bar",
      data: {
        labels: ["Budget", "Actuals"],
        datasets: [
          {
            label: "Amount",
            data: [safeBudget, safeActual],
            backgroundColor: [colorBlue, colorYellow],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${fmt2(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => fmt2(v),
            },
          },
        },
      },
    });
  }

  /* --- Chart 3: Monthly Budget vs Actuals (Combo: bar + line) --- */
  const ctx3 = $("#chartMonthlyBudgetVsActual", rootEl)?.getContext("2d");
  if (ctx3) {
    if (chartMonthlyBudgetVsActual) chartMonthlyBudgetVsActual.destroy();

    // Build unified sorted month axis
    const monthSet = new Set([
      ...Object.keys(budgetByMonth || {}),
      ...Object.keys(actualByMonth || {}),
    ]);

    const months = Array.from(monthSet)
      .filter(Boolean)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const labels = months.map((ym) => ym.slice(0, 7)); // YYYY-MM
    const budgetSeries = months.map((ym) => Number(budgetByMonth[ym] || 0));
    const actualSeries = months.map((ym) => Number(actualByMonth[ym] || 0));

    chartMonthlyBudgetVsActual = new window.Chart(ctx3, {
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Actuals",
            data: actualSeries,
            backgroundColor: colorYellow,
            borderRadius: 4,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Budget",
            data: budgetSeries,
            borderColor: colorBlue,
            backgroundColor: colorBlue,
            tension: 0.2,
            fill: false,
            yAxisID: "y",
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt2(ctx.parsed.y)}`,
            },
          },
        },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => fmt2(v),
            },
          },
        },
      },
    });
  }
}
