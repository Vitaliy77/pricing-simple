// js/tabs/pnl.js
import { $, h } from "../lib/dom.js";
import { getSelectedProjectId } from "../lib/projectContext.js";

/*
  P&L tab:
  - Filters: Plan Year, Plan Version, Plan Type (Working/Final)
  - Aggregates planning_lines by month:
      Revenue = sum of rows where is_revenue = true
      Cost    = sum of rows where is_revenue = false
      Profit  = Revenue - Cost
*/

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">P&amp;L Summary</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;">
      View monthly Revenue, Cost, and Profit based on the planning data.
    </p>

    <!-- Filters -->
    <section style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.75rem;">
      <label>
        Plan Year
        <select id="pnlYearSelect">
          <option value="2026">2026</option>
          <option value="2027">2027</option>
          <option value="2028">2028</option>
        </select>
      </label>

      <label>
        Plan Version
        <select id="pnlVersionSelect">
          <option value="">Loading…</option>
        </select>
      </label>

      <label>
        Plan Type
        <select id="pnlTypeSelect">
          <option value="Working">Working</option>
          <option value="Final">Final</option>
        </select>
      </label>
    </section>

    <section id="pnlMessage" style="min-height:1.25rem;font-size:0.9rem;"></section>

    <!-- P&L Table -->
    <section style="margin-top:0.75rem;">
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr>
              <th>Line</th>
              <th>Jan</th>
              <th>Feb</th>
              <th>Mar</th>
              <th>Apr</th>
              <th>May</th>
              <th>Jun</th>
              <th>Jul</th>
              <th>Aug</th>
              <th>Sep</th>
              <th>Oct</th>
              <th>Nov</th>
              <th>Dec</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="pnlBody">
            <tr><td colspan="14">Select filters to view P&amp;L.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

export const pnlTab = {
  template,
  async init({ root, client }) {
    const msg = $("#pnlMessage", root);
    const yearSel = $("#pnlYearSelect", root);
    const verSel  = $("#pnlVersionSelect", root);
    const typeSel = $("#pnlTypeSelect", root);

    function setMsg(text) {
      if (msg) msg.textContent = text;
    }

    await loadPlanVersions(root, client);

    // Wire up filters
    [yearSel, verSel, typeSel].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => refreshPnl(root, client));
    });

    setMsg("Select plan filters to compute P&L.");
  },
};

async function loadPlanVersions(root, client) {
  const sel = $("#pnlVersionSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    sel.innerHTML = `<option value="">Error loading versions</option>`;
    return;
  }

  sel.innerHTML = `<option value="">— Select version —</option>`;
  for (const pv of data) {
    const opt = document.createElement("option");
    opt.value = pv.id;
    opt.textContent = `${pv.code} – ${pv.description}`;
    sel.appendChild(opt);
  }
}

async function refreshPnl(root, client) {
  const yearSel = $("#pnlYearSelect", root);
  const verSel  = $("#pnlVersionSelect", root);
  const typeSel = $("#pnlTypeSelect", root);
  const msg     = $("#pnlMessage", root);

  const plan_year   = yearSel?.value ? parseInt(yearSel.value, 10) : null;
  const version_id  = verSel?.value || null;
  const plan_type   = typeSel?.value || null;

  if (!plan_year || !version_id || !plan_type) {
    if (msg) msg.textContent = "Please select year, version, and plan type.";
    renderPnl(root, null);
    return;
  }

  if (msg) msg.textContent = "Loading P&L…";

  const { data, error } = await client
    .from("planning_lines")
    .select(
      "is_revenue, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec"
    )
    .eq("plan_year", plan_year)
    .eq("plan_type", plan_type)
    .eq("plan_version_id", version_id);

  if (error) {
    console.error(error);
    if (msg) msg.textContent = "Error loading planning data.";
    renderPnl(root, null);
    return;
  }

  const summary = aggregatePnl(data || []);
  renderPnl(root, summary);
  if (msg) msg.textContent = "";
}

function aggregatePnl(rows) {
  const months = [
    "jan","feb","mar","apr","may","jun",
    "jul","aug","sep","oct","nov","dec",
  ];

  const revenue = {};
  const cost    = {};

  months.forEach((m) => {
    revenue[m] = 0;
    cost[m]    = 0;
  });

  for (const r of rows) {
    const target = r.is_revenue ? revenue : cost;
    months.forEach((m) => {
      const v = Number(r[m] || 0);
      target[m] += v;
    });
  }

  const profit = {};
  const totals = { revenue: 0, cost: 0, profit: 0 };

  months.forEach((m) => {
    profit[m] = revenue[m] - cost[m];
    totals.revenue += revenue[m];
    totals.cost    += cost[m];
    totals.profit  += profit[m];
  });

  return { months, revenue, cost, profit, totals };
}

function renderPnl(root, summary) {
  const tbody = $("#pnlBody", root);
  if (!tbody) return;

  if (!summary) {
    tbody.innerHTML = `<tr><td colspan="14">No data to display.</td></tr>`;
    return;
  }

  const { months, revenue, cost, profit, totals } = summary;

  const fmt = (v) =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "";

  const buildRow = (label, dataObj, total) => {
    const tr = document.createElement("tr");
    let cells = `<td>${label}</td>`;
    for (const m of months) {
      cells += `<td class="num">${fmt(dataObj[m])}</td>`;
    }
    cells += `<td class="num">${fmt(total)}</td>`;
    tr.innerHTML = cells;
    return tr;
  };

  tbody.innerHTML = "";
  tbody.appendChild(buildRow("Revenue", revenue, totals.revenue));
  tbody.appendChild(buildRow("Cost",    cost,    totals.cost));
  tbody.appendChild(buildRow("Profit",  profit,  totals.profit));
}
