// js/tabs/pnl.js
import { $, h } from "../lib/dom.js";
import { getSelectedProjectId, getPlanContext } from "../lib/projectContext.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">P&L Summary</h3>
    <p style="font-size:0.9rem; margin-bottom:1rem; color:#475569;">
      Monthly Revenue, Cost, and Profit for the selected project.
    </p>

    <section id="pnlMessage" 
             style="min-height:1.25rem; font-size:0.9rem; color:#64748b; margin-bottom:0.75rem;"></section>

    <section style="margin-top:0.5rem;">
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr>
              <th>Line</th>
              <th>Jan</th><th>Feb</th><th>Mar</th><th>Apr</th><th>May</th><th>Jun</th>
              <th>Jul</th><th>Aug</th><th>Sep</th><th>Oct</th><th>Nov</th><th>Dec</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="pnlBody">
            <tr><td colspan="14">Loading…</td></tr>
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
    const projectId = getSelectedProjectId();
    const ctx = getPlanContext();

    // ——— Single source of truth checks ———
    if (!projectId) {
      msg && (msg.textContent = "No project selected. Please go to the Projects tab.");
      renderPnl(root, null);
      return;
    }

    if (!ctx.year || !ctx.versionId) {
      msg && (msg.textContent = "Plan not fully selected. Please complete selection in the Projects tab.");
      renderPnl(root, null);
      return;
    }

    // ——— Auto-load ———
    await refreshPnl(root, client);
  },
};

async function refreshPnl(root, client) {
  const msg = $("#pnlMessage", root);
  const projectId = getSelectedProjectId();
  const ctx = getPlanContext();

  if (!projectId || !ctx.year || !ctx.versionId) {
    renderPnl(root, null);
    return;
  }

  msg && (msg.textContent = "Calculating P&L…");

  const { data, error } = await client
    .from("planning_lines")
    .select("is_revenue, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec")
    .eq("project_id", projectId)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (error) {
    console.error("P&L load error:", error);
    msg && (msg.textContent = "Error loading data.");
    renderPnl(root, null);
    return;
  }

  const summary = aggregatePnl(data || []);
  renderPnl(root, summary);
  msg && (msg.textContent = "");
}

function aggregatePnl(rows) {
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const revenue = Object.fromEntries(months.map(m => [m, 0]));
  const cost = Object.fromEntries(months.map(m => [m, 0]));

  rows.forEach(r => {
    const target = r.is_revenue ? revenue : cost;
    months.forEach(m => {
      target[m] += Number(r[m] || 0);
    });
  });

  const profit = {};
  const totals = { revenue: 0, cost: 0, profit: 0 };

  months.forEach(m => {
    profit[m] = revenue[m] - cost[m];
    totals.revenue += revenue[m];
    totals.cost += cost[m];
    totals.profit += profit[m];
  });

  return { months, revenue, cost, profit, totals };
}

function renderPnl(root, summary) {
  const tbody = $("#pnlBody", root);
  if (!tbody) return;

  if (!summary) {
    tbody.innerHTML = `<tr><td colspan="14">No data available.</td></tr>`;
    return;
  }

  const { months, revenue, cost, profit, totals } = summary;
  const fmt = v => typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0";

  const row = (label, data, total, bold = false) => {
    const tr = document.createElement("tr");
    if (bold) tr.classList.add("font-bold", "bg-slate-100");
    let html = `<td class="text-left ${bold ? "font-semibold" : ""}">${label}</td>`;
    months.forEach(m => {
      html += `<td class="num">${fmt(data[m])}</td>`;
    });
    html += `<td class="num font-bold">${fmt(total)}</td>`;
    tr.innerHTML = html;
    return tr;
  };

  tbody.innerHTML = "";
  tbody.appendChild(row("Revenue", revenue, totals.revenue));
  tbody.appendChild(row("− Cost", cost, totals.cost));
  tbody.appendChild(row("= Profit", profit, totals.profit, true));
}
