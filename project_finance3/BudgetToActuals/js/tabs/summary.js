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

    <section id="summaryCharts" style="margin-top:0.75rem;display:none;">
      <h4>Dashboard</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;">
        <!-- Doughnut: Total Award vs Budgeted -->
        <div style="border:1px solid #ddd;border-radius:4px;padding:0.5rem;">
          <h5 style="margin-top:0;margin-bottom:0.3rem;font-size:0.9rem;">
            Total Award vs Budgeted
          </h5>
          <canvas id="chartAwardVsBudget" style="max-height:380px;"></canvas>
        </div>

        <!-- Combo: Monthly Budget vs Actuals -->
        <div style="border:1px solid #ddd;border-radius:4px;padding:0.5rem;">
          <h5 style="margin-top:0;margin-bottom:0.3rem;font-size:0.9rem;">
            Monthly Budget vs Actuals
          </h5>
          <canvas id="chartMonthlyBudgetActual" style="max-height:330px;"></canvas>
        </div>
      </div>
    </section>
  </article>
`;

let rootEl = null;
let chartAwardVsBudget = null;
let chartMonthly = null;

// ensure datalabels registered only once (if plugin present)
if (typeof window !== "undefined" && window.Chart && window.ChartDataLabels) {
  if (!window.__chartDatalabelsRegistered) {
    window.Chart.register(window.ChartDataLabels);
    window.__chartDatalabelsRegistered = true;
  }
}

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

    // 2) Budget + actuals (include ym & date for monthly chart)
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

    // --- Budget totals (overall) ---
    let budgetLabor = 0;
    laborRows.forEach((r) => {
      const hrs = Number(r.hours ?? 0);
      const rate = rateById[r.category_id] ?? 0;
      budgetLabor += hrs * rate;
    });

    const budgetDirect = directRows.reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0
    );
    const budgetTotal = budgetLabor + budgetDirect;

    // --- Actual total (overall) ---
    const actualTotal = actuals.reduce(
      (sum, a) => sum + Number(a.amount_net ?? 0),
      0
    );

    const varianceTotal = budgetTotal - actualTotal;

    // --- Monthly breakdown for combo chart ---

    // Budget per month (labor+direct)
    const monthlyBudget = {}; // ym -> amount
    laborRows.forEach((r) => {
      const ym = r.ym;
      if (!ym) return;
      const hrs = Number(r.hours ?? 0);
      const rate = rateById[r.category_id] ?? 0;
      const amt = hrs * rate;
      monthlyBudget[ym] = (monthlyBudget[ym] ?? 0) + amt;
    });
    directRows.forEach((r) => {
      const ym = r.ym;
      if (!ym) return;
      const amt = Number(r.amount ?? 0);
      monthlyBudget[ym] = (monthlyBudget[ym] ?? 0) + amt;
    });

    // Actual per month
    const monthlyActual = {}; // ym -> amount
    actuals.forEach((a) => {
      if (!a.date) return;
      const ym = String(a.date).slice(0, 7) + "-01";
      const amt = Number(a.amount_net ?? 0);
      monthlyActual[ym] = (monthlyActual[ym] ?? 0) + amt;
    });

    const monthKeys = Array.from(
      new Set([...Object.keys(monthlyBudget), ...Object.keys(monthlyActual)])
    ).sort();

    const monthLabels = monthKeys.map((ym) => {
      const d = new Date(ym);
      return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    });
    const monthBudgetSeries = monthKeys.map((ym) => monthlyBudget[ym] ?? 0);
    const monthActualSeries = monthKeys.map((ym) => monthlyActual[ym] ?? 0);

    // Render
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
      monthLabels,
      monthBudgetSeries,
      monthActualSeries,
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
    <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.5rem;">
      <div style="border:1px solid #ddd;border-radius:4px;padding:0.6rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.3rem;">Grant</h4>
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

      <div style="border:1px solid #ddd;border-radius:4px;padding:0.6rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.3rem;">Budget</h4>
        <div>Labor: ${fmt2(budgetLabor)}</div>
        <div>Other Direct: ${fmt2(budgetDirect)}</div>
        <div><strong>Total Budget: ${fmt2(budgetTotal)}</strong></div>
      </div>

      <div style="border:1px solid #ddd;border-radius:4px;padding:0.6rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.3rem;">Actuals</h4>
        <div><strong>Total Actuals: ${fmt2(actualTotal)}</strong></div>
      </div>

      <div style="border:1px solid #ddd;border-radius:4px;padding:0.6rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.3rem;">Variance</h4>
        <div>Total Variance (Budget – Actual): ${
          varianceTotal >= 0 ? "" : "-"
        }${fmt2(Math.abs(varianceTotal))}</div>
      </div>
    </section>
  `;

  box.innerHTML = html;
}

/* ---------- Charts (doughnut + combo) ---------- */

function renderCharts(
  grant,
  { budgetTotal, actualTotal, monthLabels, monthBudgetSeries, monthActualSeries }
) {
  const section = $("#summaryCharts", rootEl);
  if (!section) return;

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
  const remaining = Math.max(safeAward - safeBudget, 0);

  // Colors (semi-transparent, modern)
  const colorBlue = "rgba(54, 162, 235, 0.6)"; // budget
  const colorBlueBorder = "rgba(54, 162, 235, 1)";
  const colorGrey = "rgba(201, 203, 207, 0.6)";
  const colorGreyBorder = "rgba(201, 203, 207, 1)";
  const colorYellow = "rgba(255, 205, 86, 0.6)";
  const colorYellowBorder = "rgba(255, 205, 86, 1)";

  // --- Doughnut: Total Award vs Budgeted ---
  const ctx1 = $("#chartAwardVsBudget", rootEl)?.getContext("2d");
  if (ctx1) {
    if (chartAwardVsBudget) chartAwardVsBudget.destroy();
    chartAwardVsBudget = new window.Chart(ctx1, {
      type: "doughnut",
      data: {
        labels: ["Budgeted", "Unallocated Award"],
        datasets: [
          {
            data: [safeBudget, remaining],
            backgroundColor: [colorBlue, colorGrey],
            borderColor: [colorBlueBorder, colorGreyBorder],
            borderWidth: 1,
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
          datalabels: {
            color: "#333",
            font: { size: 10 },
            formatter: (value, ctx) => {
              if (!value) return "";
              return fmt2(value);
            },
          },
        },
      },
    });
  }

  // --- Combo: Monthly Budget vs Actuals (line + bars) ---
  const ctx2 = $("#chartMonthlyBudgetActual", rootEl)?.getContext("2d");
  if (ctx2) {
    if (chartMonthly) chartMonthly.destroy();
    chartMonthly = new window.Chart(ctx2, {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: [
          {
            type: "line",
            label: "Budget",
            data: monthBudgetSeries,
            borderColor: colorBlueBorder,
            backgroundColor: colorBlue,
            borderWidth: 2,
            tension: 0.25,
            yAxisID: "y",
            order: 0,
            pointRadius: 2,
            pointHoverRadius: 3,
          },
          {
            type: "bar",
            label: "Actuals",
            data: monthActualSeries,
            backgroundColor: colorYellow,
            borderColor: colorYellowBorder,
            borderWidth: 1,
            yAxisID: "y",
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => fmt2(val),
              font: { size: 9 },
            },
          },
          x: {
            ticks: { font: { size: 9 } },
          },
        },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt2(ctx.parsed.y)}`,
            },
          },
          datalabels: {
            anchor: "end",
            align: "end",
            color: "#333",
            font: { size: 9 },
            clamp: true,
            formatter: (value, ctx) => {
              // show labels only for bars (Actuals) to avoid clutter
              if (ctx.dataset.type === "line") return "";
              if (!value) return "";
              return fmt2(value);
            },
          },
        },
      },
    });
  }
}
