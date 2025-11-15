// /js/tabs/compare.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/`
  <article>
    <h3>Budget vs Actual</h3>

    <label>
      Grant:
      <select id="cmpGrant">
        <option value="">— Select a grant —</option>
      </select>
    </label>
    <small id="cmpMsg"></small>

    <section id="cmpSummary" style="margin-top:1.5rem"></section>
  </article>
`;

let rootEl = null;

const esc = x =>
  (x ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");

const fmtMoney = n =>
  (n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const msg = (text, isErr = false) => {
  if (!rootEl) return;
  const el = $("#cmpMsg", rootEl);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
};

export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;

  await loadGrantOptions();

  // 🔹 auto-select grant from Grants tab, if set
  const storedId = localStorage.getItem('selectedGrantId') || '';
  if (storedId) {
    const sel = $("#cmpGrant", rootEl);
    if (sel) {
      sel.value = storedId;
      if (sel.value === storedId) {
        await loadCompareForGrant(storedId);
      }
    }
  }

  $("#cmpGrant", rootEl).addEventListener("change", async (e) => {
    const id = e.target.value || null;
    if (!id) {
      $("#cmpSummary", rootEl).innerHTML = "";
      return;
    }
    await loadCompareForGrant(id);
  });
}


async function loadGrantOptions() {
  const sel = $("#cmpGrant", rootEl);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a grant —</option>';

  const { data, error } = await client
    .from("grants")
    .select("id,name,grant_id,status")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[compare] loadGrantOptions error", error);
    msg(error.message, true);
    return;
  }

  (data || []).forEach((g) => {
    const label = g.grant_id ? `${g.name} (${g.grant_id})` : g.name;
    sel.appendChild(new Option(label, g.id));
  });
}

async function loadCompareForGrant(grantId) {
  msg("Loading…");
  try {
    // 1) Budget: Labor + Direct + categories
    const [labRes, dirRes, catsRes, actRes] = await Promise.all([
      client
        .from("budget_labor")
        .select("category_id,hours")
        .eq("grant_id", grantId),

      client
        .from("budget_direct")
        .select("amount")
        .eq("grant_id", grantId),

      client
        .from("labor_categories")
        .select("id,hourly_rate")
        .eq("is_active", true),

      // NOTE: actuals_net has: date, amount_net, grant_code, grant_id
      client
        .from("actuals_net")
        .select("amount_net,grant_id")
        .eq("grant_id", grantId)
    ]);

    if (labRes.error) throw labRes.error;
    if (dirRes.error) throw dirRes.error;
    if (catsRes.error) throw catsRes.error;
    if (actRes.error) throw actRes.error;

    const laborRows = labRes.data || [];
    const directRows = dirRes.data || [];
    const cats      = catsRes.data || [];
    const actuals   = actRes.data || [];

    // Map of labor_category_id → hourly rate
    const rateById = Object.fromEntries(
      cats.map(c => [c.id, Number(c.hourly_rate ?? 0)])
    );

    // ---------- Budget totals ----------
    let budgetLabor = 0;
    laborRows.forEach(r => {
      const hrs  = Number(r.hours ?? 0);
      const rate = rateById[r.category_id] ?? 0;
      budgetLabor += hrs * rate;
    });

    const budgetDirect = directRows.reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0
    );

    const budgetTotal = budgetLabor + budgetDirect;

    // ---------- Actual totals ----------
    // For now we only have total actuals in actuals_net (no labor/odc split)
    const actualTotal = actuals.reduce(
      (sum, a) => sum + Number(a.amount_net ?? 0),
      0
    );

    // If you still want to show “labor vs direct” columns in the UI,
    // we can just treat all actuals as "direct" or "total" for now:
    const actualLabor  = 0;
    const actualDirect = actualTotal;

    // ---------- Variances ----------
    const varLabor  = budgetLabor  - actualLabor;
    const varDirect = budgetDirect - actualDirect;
    const varTotal  = budgetTotal  - actualTotal;

    renderSummary({
      budgetLabor,
      budgetDirect,
      budgetTotal,
      actualLabor,
      actualDirect,
      actualTotal,
      varLabor,
      varDirect,
      varTotal,
    });

    msg("");
  } catch (e) {
    console.error("[compare] loadCompareForGrant error", e);
    msg(e.message || String(e), true);
  }
}


function renderSummary(m) {
  const box = $("#cmpSummary", rootEl);
  if (!box) return;

  box.innerHTML = `
    <h4>Summary (Inception to Date)</h4>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th style="text-align:right;">Budget</th>
          <th style="text-align:right;">Actual</th>
          <th style="text-align:right;">Variance (Budget - Actual)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Labor</td>
          <td style="text-align:right;">${fmtMoney(m.budgetLabor)}</td>
          <td style="text-align:right;">${fmtMoney(m.actualLabor)}</td>
          <td style="text-align:right;">${fmtMoney(m.varLabor)}</td>
        </tr>
        <tr>
          <td>Other Direct Costs</td>
          <td style="text-align:right;">${fmtMoney(m.budgetDirect)}</td>
          <td style="text-align:right;">${fmtMoney(m.actualDirect)}</td>
          <td style="text-align:right;">${fmtMoney(m.varDirect)}</td>
        </tr>
        <tr>
          <td><strong>Total</strong></td>
          <td style="text-align:right;"><strong>${fmtMoney(m.budgetTotal)}</strong></td>
          <td style="text-align:right;"><strong>${fmtMoney(m.actualTotal)}</strong></td>
          <td style="text-align:right;"><strong>${fmtMoney(m.varTotal)}</strong></td>
        </tr>
      </tbody>
    </table>
  `;
}
