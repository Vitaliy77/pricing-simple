// js/tabs/summary.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";
import { getSelectedGrantId, setSelectedGrantId } from "../lib/grantContext.js";

export const template = /*html*/ `
  <article>
    <h3>Grant Summary</h3>

    <section style="max-width:700px;margin-bottom:1rem;">
      <label>
        Grant
        <select id="summaryGrantSelect">
          <option value="">— Select a grant —</option>
        </select>
      </label>
      <small id="msg"></small>
    </section>

    <section id="summaryContent">
      <p>No grant selected.</p>
    </section>
  </article>
`;

let rootEl = null;

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

  // Determine which grant to show:
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
  }

  sel.addEventListener("change", async (e) => {
    const id = e.target.value || null;
    setSelectedGrantId(id || null);
    if (!id) {
      $("#summaryContent", rootEl).innerHTML = "<p>No grant selected.</p>";
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
      return;
    }

    // 2) Budget + actuals
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
      client
        .from("actuals_net")
        .select("amount_net,grant_id")
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

    // --- Budget totals in JS ---
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

    // --- Actual totals (no split by type in view) ---
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
    msg("");
  } catch (e) {
    console.error("[summary] loadSummary error", e);
    msg(e.message || String(e), true);
    $("#summaryContent", rootEl).innerHTML = "<p>Failed to load summary.</p>";
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
    <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;">
      <div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;">Grant</h4>
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

      <div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;">Budget</h4>
        <div>Labor: ${fmt2(budgetLabor)}</div>
        <div>Other Direct: ${fmt2(budgetDirect)}</div>
        <div><strong>Total Budget: ${fmt2(budgetTotal)}</strong></div>
      </div>

      <div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;font-size:0.9rem;">
        <h4 style="margin-top:0;margin-bottom:0.4rem;">Actuals</h4>
        <div><strong>Total Actuals: ${fmt2(actualTotal)}</strong></div>
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
