// js/tabs/compare.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";
import { getSelectedGrantId, setSelectedGrantId } from "../lib/grantContext.js";

export const template = /*html*/ `
  <article>
    <h3>Budget vs Actual</h3>

    <section style="max-width:700px;margin-bottom:0.5rem;">
      <label>
        Grant
        <select id="cmpGrantSelect" style="min-width:320px;">
          <option value="">— Select a grant —</option>
        </select>
      </label>
      <small id="cmpMsg"></small>
    </section>

    <section id="cmpBodySection">
      <p>No grant selected.</p>
    </section>
  </article>
`;

/* ---------- State / helpers ---------- */

let rootEl = null;

const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function msg(text, isErr = false) {
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
}

/**
 * Classify a budget_direct row into one of:
 * "subs" | "materials" | "equipment" | "odc"
 * based on the category text.
 */
function classifyBudgetCategory(catRaw) {
  const c = (catRaw || "").toString().toLowerCase().trim();

  if (!c) return "odc";

  if (c.startsWith("sub")) return "subs";        // "Subcontracts", "Subs", etc.
  if (c.startsWith("mat")) return "materials";   // "Materials"
  if (c.startsWith("equip")) return "equipment"; // "Equipment"

  // everything else is ODC (travel, licenses, etc.)
  return "odc";
}

/**
 * Classify an actuals_net row into:
 * "labor" | "subs" | "materials" | "equipment" | "odc"
 * based on a category-like text (if present).
 */
function classifyActualCategory(catRaw) {
  const c = (catRaw || "").toString().toLowerCase().trim();

  if (!c) return "odc";

  if (c.startsWith("lab"))   return "labor";       // "Labor"
  if (c.startsWith("sub"))   return "subs";        // "Subcontracts"
  if (c.startsWith("mat"))   return "materials";   // "Materials"
  if (c.startsWith("equip")) return "equipment";   // "Equipment"

  // everything else -> ODC
  return "odc";
}

/* ---------- Init ---------- */

export async function init(root, params = {}) {
  rootEl = root;
  rootEl.innerHTML = template;

  await loadGrantOptions();

  const sel = $("#cmpGrantSelect", rootEl);
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
    await loadCompareForGrant(chosen);
  } else {
    $("#cmpBodySection", rootEl).innerHTML = "<p>No grant selected.</p>";
  }

  sel.addEventListener("change", async (e) => {
    const id = e.target.value || null;
    setSelectedGrantId(id || null);
    if (!id) {
      $("#cmpBodySection", rootEl).innerHTML = "<p>No grant selected.</p>";
      return;
    }
    await loadCompareForGrant(id);
  });
}

/* ---------- Load grants for dropdown ---------- */

async function loadGrantOptions() {
  const sel = $("#cmpGrantSelect", rootEl);
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

/* ---------- Load + compute Budget vs Actual ---------- */

async function loadCompareForGrant(grantId) {
  msg("Loading…");

  try {
    const [labRes, dirRes, catsRes, actRes] = await Promise.all([
      client
        .from("budget_labor")
        .select("category_id,hours")
        .eq("grant_id", grantId),
      client
        .from("budget_direct")
        .select("category,amount")
        .eq("grant_id", grantId),
      client
        .from("labor_categories")
        .select("id,hourly_rate")
        .eq("is_active", true),
      // IMPORTANT: do NOT name non-existent columns here. Use *.
      client
        .from("actuals_net")
        .select("*")
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

    // ---------- Budget totals ----------
    let budgetLabor = 0;
    let budgetSubs = 0;
    let budgetMaterials = 0;
    let budgetEquipment = 0;
    let budgetODC = 0;

    // Labor (hours * rate)
    laborRows.forEach((r) => {
      const hrs = Number(r.hours ?? 0);
      const rate = rateById[r.category_id] ?? 0;
      budgetLabor += hrs * rate;
    });

    // Direct (Subs / Materials / Equipment / ODC)
    directRows.forEach((r) => {
      const amt = Number(r.amount ?? 0);
      if (!amt) return;
      const bucket = classifyBudgetCategory(r.category);
      if (bucket === "subs")         budgetSubs      += amt;
      else if (bucket === "materials")  budgetMaterials += amt;
      else if (bucket === "equipment")  budgetEquipment += amt;
      else                           budgetODC       += amt;
    });

    const budgetTotal =
      budgetLabor + budgetSubs + budgetMaterials + budgetEquipment + budgetODC;

    // ---------- Actual totals ----------
    // Detect if rows actually have a "category" column
    const hasCategory =
      actuals.length > 0 &&
      Object.prototype.hasOwnProperty.call(actuals[0], "category");

    let actualLabor = 0;
    let actualSubs = 0;
    let actualMaterials = 0;
    let actualEquipment = 0;
    let actualODC = 0;
    let actualTotal = 0;

    if (hasCategory) {
      // Full split by category
      actuals.forEach((a) => {
        const amt = Number(a.amount_net ?? 0);
        if (!amt) return;
        const bucket = classifyActualCategory(a.category);
        if (bucket === "labor")          actualLabor     += amt;
        else if (bucket === "subs")      actualSubs      += amt;
        else if (bucket === "materials") actualMaterials += amt;
        else if (bucket === "equipment") actualEquipment += amt;
        else                             actualODC      += amt;
      });

      actualTotal =
        actualLabor + actualSubs + actualMaterials + actualEquipment + actualODC;
    } else {
      // No category column in actuals_net → only total
      actualTotal = actuals.reduce(
        (sum, a) => sum + Number(a.amount_net ?? 0),
        0
      );
    }

    let rows;

    if (hasCategory) {
      // Per-category actuals + variance
      rows = [
        { label: "Labor",              budget: budgetLabor,    actual: actualLabor },
        { label: "Subs",               budget: budgetSubs,     actual: actualSubs },
        { label: "Materials",          budget: budgetMaterials,actual: actualMaterials },
        { label: "Equipment",          budget: budgetEquipment,actual: actualEquipment },
        { label: "Other Direct Costs", budget: budgetODC,      actual: actualODC },
      ].map((r) => ({
        ...r,
        variance: r.budget - r.actual,
      }));
    } else {
      // Only show budget in categories; actual is total-only
      rows = [
        { label: "Labor",              budget: budgetLabor,    actual: null, variance: null },
        { label: "Subs",               budget: budgetSubs,     actual: null, variance: null },
        { label: "Materials",          budget: budgetMaterials,actual: null, variance: null },
        { label: "Equipment",          budget: budgetEquipment,actual: null, variance: null },
        { label: "Other Direct Costs", budget: budgetODC,      actual: null, variance: null },
      ];
    }

    const totalsRow = {
      label: "Total",
      budget: budgetTotal,
      actual: actualTotal,
      variance: budgetTotal - actualTotal,
    };

    renderCompareTable(rows, totalsRow);
    msg("");
  } catch (e) {
    console.error("[compare] loadCompareForGrant error", e);
    msg(e.message || String(e), true);
    $("#cmpBodySection", rootEl).innerHTML =
      "<p>Failed to load Budget vs Actual.</p>";
  }
}

/* ---------- Render table ---------- */

function renderCompareTable(rows, totals) {
  const container = $("#cmpBodySection", rootEl);
  if (!container) return;

  const tbl = h(`
    <table class="data-grid compact-grid">
      <thead>
        <tr>
          <th style="min-width:140px;">Category</th>
          <th style="min-width:110px;text-align:right;">Budget</th>
          <th style="min-width:110px;text-align:right;">Actual</th>
          <th style="min-width:110px;text-align:right;">Variance</th>
        </tr>
      </thead>
      <tbody></tbody>
      <tfoot>
        <tr>
          <th>${totals.label}</th>
          <th style="text-align:right;">${fmt2(totals.budget)}</th>
          <th style="text-align:right;">${fmt2(totals.actual)}</th>
          <th style="text-align:right;">${fmt2(totals.variance)}</th>
        </tr>
      </tfoot>
    </table>
  `);

  const tbody = tbl.querySelector("tbody");

  rows.forEach((r) => {
    const tr = h("<tr></tr>");
    tr.appendChild(h(`<td>${r.label}</td>`));
    tr.appendChild(h(`<td style="text-align:right;">${fmt2(r.budget)}</td>`));

    // If we don't have category-level actuals, show "—"
    const actualText = r.actual == null ? "—" : fmt2(r.actual);
    const varText =
      r.variance == null
        ? "—"
        : `${r.variance >= 0 ? "" : "-"}${fmt2(Math.abs(r.variance))}`;

    tr.appendChild(
      h(`<td style="text-align:right;">${actualText}</td>`)
    );
    tr.appendChild(
      h(`<td style="text-align:right;">${varText}</td>`)
    );

    tbody.appendChild(tr);
  });

  container.innerHTML = "";
  container.appendChild(tbl);
}

export const compareTab = { template, init };
