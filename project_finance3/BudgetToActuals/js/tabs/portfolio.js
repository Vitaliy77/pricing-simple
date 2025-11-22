// js/tabs/portfolio.js
import { client } from "../api/supabase.js";
import { $ } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>All Grants Portfolio</h3>

    <section id="portfolioSummary" style="max-width:800px;margin-bottom:0.75rem;">
      <p>Loading…</p>
      <small id="msg"></small>
    </section>

    <section>
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr>
              <th>Grant</th>
              <th>Funder</th>
              <th>Period</th>
              <th>Status</th>
              <th style="text-align:right;">Budget</th>
              <th style="text-align:right;">Actual</th>
              <th style="text-align:right;">Var $</th>
              <th style="text-align:right;">Var %</th>
              <th style="text-align:right;">Estimate</th>
              <th style="text-align:right;">Var $</th>
              <th style="text-align:right;">Var %</th>
            </tr>
          </thead>
          <tbody id="portfolioBody">
            <tr><td colspan="11">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

let rootEl = null;

/* ---------- Helpers ---------- */

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#msg", rootEl) || $("#portfolioSummary small", rootEl);
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

const fmtPct = (v) => {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
};

function monthsInPeriod(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return 0;
  const s = new Date(startDateStr);
  const e = new Date(endDateStr);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const startMonths = s.getFullYear() * 12 + s.getMonth();
  const endMonths = e.getFullYear() * 12 + e.getMonth();
  const diff = endMonths - startMonths;
  return diff >= 0 ? diff + 1 : 0; // inclusive
}

function monthsElapsedFromStart(startDateStr, endDateStr) {
  // elapsed months from start → min(today, PoP end)
  if (!startDateStr) return 0;
  const s = new Date(startDateStr);
  if (Number.isNaN(s.getTime())) return 0;

  const today = new Date();
  let effectiveEnd = today;
  if (endDateStr) {
    const e = new Date(endDateStr);
    if (!Number.isNaN(e.getTime()) && e < today) {
      effectiveEnd = e;
    }
  }

  const startMonths = s.getFullYear() * 12 + s.getMonth();
  const endMonths = effectiveEnd.getFullYear() * 12 + effectiveEnd.getMonth();
  const diff = endMonths - startMonths;
  return diff >= 0 ? diff + 1 : 0;
}

/* ---------- Init ---------- */

export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;
  await loadPortfolio();
}

/* ---------- Data Load & Aggregation ---------- */

async function loadPortfolio() {
  msg("Loading…");
  const bodyEl = $("#portfolioBody", rootEl);
  const summaryEl = $("#portfolioSummary", rootEl);

  if (bodyEl) {
    bodyEl.innerHTML = `
      <tr><td colspan="11">Loading portfolio data…</td></tr>
    `;
  }

  try {
    // 1) Get active grants
    const { data: grants, error: gErr } = await client
      .from("grants")
      .select(
        "id,name,grant_id,funder,start_date,end_date,total_award,status"
      )
      .eq("status", "active")
      .order("name", { ascending: true });

    if (gErr) throw gErr;

    if (!grants || grants.length === 0) {
      if (bodyEl) {
        bodyEl.innerHTML = `
          <tr><td colspan="11">No active grants found.</td></tr>
        `;
      }
      if (summaryEl) {
        summaryEl.innerHTML = `<p>No active grants found.</p><small id="msg"></small>`;
      }
      msg("");
      return;
    }

    const grantIds = grants.map((g) => g.id);

    // 2) Load budgets + labor rates + actuals for those grants
    const [labRes, dirRes, catsRes, actRes] = await Promise.all([
      client
        .from("budget_labor")
        .select("grant_id,category_id,hours")
        .in("grant_id", grantIds),
      client
        .from("budget_direct")
        .select("grant_id,amount")
        .in("grant_id", grantIds),
      client
        .from("labor_categories")
        .select("id,hourly_rate")
        .eq("is_active", true),
      client
        .from("actuals_net")
        .select("grant_id,date,amount_net")
        .in("grant_id", grantIds),
    ]);

    if (labRes.error) throw labRes.error;
    if (dirRes.error) throw dirRes.error;
    if (catsRes.error) throw catsRes.error;
    if (actRes.error) throw actRes.error;

    const laborRows = labRes.data || [];
    const directRows = dirRes.data || [];
    const cats = catsRes.data || [];
    const actualRows = actRes.data || [];

    const rateByCatId = new Map(
      cats.map((c) => [c.id, Number(c.hourly_rate ?? 0)])
    );

    // Group by grant
    const laborByGrant = new Map();
    const directByGrant = new Map();
    const actualByGrant = new Map();

    laborRows.forEach((r) => {
      if (!laborByGrant.has(r.grant_id)) laborByGrant.set(r.grant_id, []);
      laborByGrant.get(r.grant_id).push(r);
    });

    directRows.forEach((r) => {
      if (!directByGrant.has(r.grant_id)) directByGrant.set(r.grant_id, []);
      directByGrant.get(r.grant_id).push(r);
    });

    actualRows.forEach((r) => {
      if (!actualByGrant.has(r.grant_id)) actualByGrant.set(r.grant_id, []);
      actualByGrant.get(r.grant_id).push(r);
    });

    // 3) Compute per-grant metrics
    const rows = [];
    let totalBudgetAll = 0;
    let totalActualAll = 0;
    let totalProratedAll = 0;

    for (const grant of grants) {
      const gId = grant.id;

      const gLabor = laborByGrant.get(gId) || [];
      const gDirect = directByGrant.get(gId) || [];
      const gActual = actualByGrant.get(gId) || [];

      // Budget labor = sum(hours * rate)
      let budgetLabor = 0;
      for (const r of gLabor) {
        const hrs = Number(r.hours ?? 0);
        const rate = rateByCatId.get(r.category_id) ?? 0;
        budgetLabor += hrs * rate;
      }

      // Budget direct = sum(amount)
      const budgetDirect = gDirect.reduce(
        (sum, r) => sum + Number(r.amount ?? 0),
        0
      );

      const budgetTotal = budgetLabor + budgetDirect;

      // Actual total
      const actualTotal = gActual.reduce(
        (sum, r) => sum + Number(r.amount_net ?? 0),
        0
      );

      // Period of performance months (full PoP)
      const totalPoPMonths = monthsInPeriod(
        grant.start_date,
        grant.end_date
      );

      // Months elapsed since start up to today (clamped to PoP end)
      const monthsElapsed = monthsElapsedFromStart(
        grant.start_date,
        grant.end_date
      );

      // Prorated actual = (actual to date ÷ months since start) × total PoP months
      let proratedActual = 0;
      if (actualTotal !== 0 && monthsElapsed > 0 && totalPoPMonths > 0) {
        const avgPerMonth = actualTotal / monthsElapsed;
        proratedActual = avgPerMonth * totalPoPMonths;
      }

      // Variances
      const varActual = budgetTotal - actualTotal;
      const varActualPct =
        budgetTotal > 0 ? (varActual / budgetTotal) * 100 : null;

      const varProrated = budgetTotal - proratedActual;
      const varProratedPct =
        budgetTotal > 0 ? (varProrated / budgetTotal) * 100 : null;

      totalBudgetAll += budgetTotal;
      totalActualAll += actualTotal;
      totalProratedAll += proratedActual;

      rows.push({
        grant,
        budgetTotal,
        actualTotal,
        varActual,
        varActualPct,
        proratedActual,
        varProrated,
        varProratedPct,
      });
    }

    // 4) Portfolio-level summary
    const totalVarAll = totalBudgetAll - totalActualAll;
    const totalVarAllPct =
      totalBudgetAll > 0 ? (totalVarAll / totalBudgetAll) * 100 : null;

    const totalVarProratedAll = totalBudgetAll - totalProratedAll;
    const totalVarProratedAllPct =
      totalBudgetAll > 0 ? (totalVarProratedAll / totalBudgetAll) * 100 : null;

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;">
          <h4 style="margin-top:0;margin-bottom:0.4rem;">All Active Grants</h4>
          <div>Total Budget: <strong>${fmt2(totalBudgetAll)}</strong></div>
          <div>Actual to Date: <strong>${fmt2(totalActualAll)}</strong></div>
          <div>Variance (Budget – Actual): 
            <strong>${fmt2(totalVarAll)}</strong> 
            (${fmtPct(totalVarAllPct)})
          </div>
          <hr style="margin:0.5rem 0;">
          <div>Prorated Actual (all grants): <strong>${fmt2(totalProratedAll)}</strong></div>
          <div>Variance (Budget – Prorated): 
            <strong>${fmt2(totalVarProratedAll)}</strong> 
            (${fmtPct(totalVarProratedAllPct)})
          </div>
          <small id="msg"></small>
        </div>
      `;
    }

    // 5) Render table rows + totals row
    if (bodyEl) {
      if (!rows.length) {
        bodyEl.innerHTML = `
          <tr><td colspan="11">No data to display.</td></tr>
        `;
      } else {
        const rowsHtml = rows
          .map((r) => {
            const g = r.grant;
            const grantLabel = g.grant_id
              ? `${g.name} (${g.grant_id})`
              : g.name || "—";
            const funder = g.funder || "—";
            const period =
              g.start_date && g.end_date
                ? `${g.start_date} → ${g.end_date}`
                : "—";
            const status = g.status || "—";

            return `
              <tr>
                <td>
                  <div><strong>${grantLabel}</strong></div>
                </td>
                <td>${funder}</td>
                <td>${period}</td>
                <td>${status}</td>
                <td style="text-align:right;">${fmt2(r.budgetTotal)}</td>
                <td style="text-align:right;">${fmt2(r.actualTotal)}</td>
                <td style="text-align:right;">${fmt2(r.varActual)}</td>
                <td style="text-align:right;">${fmtPct(r.varActualPct)}</td>
                <td style="text-align:right;">${fmt2(r.proratedActual)}</td>
                <td style="text-align:right;">${fmt2(r.varProrated)}</td>
                <td style="text-align:right;">${fmtPct(r.varProratedPct)}</td>
              </tr>
            `;
          })
          .join("");

        const totalsRow = `
          <tr style="background:#f9fafb;font-weight:600;">
            <td colspan="4" style="text-align:right;">Totals</td>
            <td style="text-align:right;">${fmt2(totalBudgetAll)}</td>
            <td style="text-align:right;">${fmt2(totalActualAll)}</td>
            <td style="text-align:right;">${fmt2(totalVarAll)}</td>
            <td style="text-align:right;">${fmtPct(totalVarAllPct)}</td>
            <td style="text-align:right;">${fmt2(totalProratedAll)}</td>
            <td style="text-align:right;">${fmt2(totalVarProratedAll)}</td>
            <td style="text-align:right;">${fmtPct(totalVarProratedAllPct)}</td>
          </tr>
        `;

        bodyEl.innerHTML = rowsHtml + totalsRow;
      }
    }

    msg("");
  } catch (e) {
    console.error("[portfolio] loadPortfolio error", e);
    msg(e.message || String(e), true);
    if (bodyEl) {
      bodyEl.innerHTML = `
        <tr><td colspan="11">Failed to load portfolio summary.</td></tr>
      `;
    }
  }
}

export const portfolioTab = { template, init };
