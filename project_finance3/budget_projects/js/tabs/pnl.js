// js/tabs/pnl.js
import { $, h } from "../lib/dom.js";
import {
  getSelectedProject,
  getSelectedProjectId,
  getPlanContext,
  setPlanContext,
} from "../lib/projectContext.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">P&L Summary</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;">
      Monthly Revenue, Cost, and Profit for the selected project.
    </p>

    <!-- Selected project info -->
    <section id="pnlProjectInfo" style="font-size:0.9rem;font-weight:500;margin-bottom:0.5rem;color:#1d4ed8;"></section>

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

    <section id="pnlMessage" style="min-height:1.25rem;font-size:0.9rem;color:#64748b;"></section>

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
            <tr><td colspan="14">Select a project and filters to view P&L.</td></tr>
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
    const projInfo = $("#pnlProjectInfo", root);

    // Show current project
    const project = getSelectedProject();
    const projectId = getSelectedProjectId();

    if (!project || !projectId) {
      projInfo && (projInfo.textContent = "No project selected");
      msg && (msg.textContent = "Please select a project first.");
      renderPnl(root, null);
      return;
    }

    projInfo && (projInfo.textContent = `Project: ${project.project_code} – ${project.name}`);

    // DOM refs
    const yearSel = $("#pnlYearSelect", root);
    const verSel  = $("#pnlVersionSelect", root);
    const typeSel = $("#pnlTypeSelect", root);

    // Load versions first
    await loadPlanVersions(root, client);

    // PRE-FILL FROM CONTEXT
    const ctx = getPlanContext();
    if (ctx.year && yearSel) yearSel.value = String(ctx.year);
    if (ctx.planType && typeSel) typeSel.value = ctx.planType;
    if (ctx.versionId && verSel) verSel.value = ctx.versionId;

    // SYNC FILTERS → update context + refresh
    yearSel?.addEventListener("change", () => {
      const year = yearSel.value ? parseInt(yearSel.value, 10) : null;
      setPlanContext({ year });
      refreshPnl(root, client);
    });

    typeSel?.addEventListener("change", () => {
      const planType = typeSel.value || "Working";
      setPlanContext({ planType });
      refreshPnl(root, client);
    });

    verSel?.addEventListener("change", () => {
      const versionId = verSel.value || null;
      const versionText = verSel.selectedOptions[0]?.textContent || null;
      setPlanContext({ 
        versionId, 
        versionCode: versionText?.split(" – ")[0] 
      });
      refreshPnl(root, client);
    });

    // Auto-load if context complete
    if (ctx.year && ctx.versionId && ctx.planType) {
      await refreshPnl(root, client);
    } else {
      msg && (msg.textContent = "Select year, version, and plan type to view P&L.");
    }
  },
};

// Load plan versions
async function loadPlanVersions(root, client) {
  const sel = $("#pnlVersionSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;
  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    sel.innerHTML = `<option value="">Error loading versions</option>`;
    return console.error(error);
  }

  sel.innerHTML = `<option value="">— Select version —</option>`;
  data.forEach(pv => {
    const opt = document.createElement("option");
    opt.value = pv.id;
    opt.textContent = `${pv.code} – ${pv.description}`;
    opt.dataset.code = pv.code;
    sel.appendChild(opt);
  });
}

async function refreshPnl(root, client) {
  const msg = $("#pnlMessage", root);
  const yearSel = $("#pnlYearSelect", root);
  const verSel  = $("#pnlVersionSelect", root);
  const typeSel = $("#pnlTypeSelect", root);
  const projectId = getSelectedProjectId();

  if (!projectId) {
    msg && (msg.textContent = "No project selected.");
    renderPnl(root, null);
    return;
  }

  const plan_year = yearSel?.value ? parseInt(yearSel.value, 10) : null;
  const version_id = verSel?.value || null;
  const plan_type = typeSel?.value || "Working";

  if (!plan_year || !version_id) {
    msg && (msg.textContent = "Please select year and version.");
    renderPnl(root, null);
    return;
  }

  msg && (msg.textContent = "Calculating P&L…");

  const { data, error } = await client
    .from("planning_lines")
    .select("is_revenue, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec")
    .eq("project_id", projectId)
    .eq("plan_year", plan_year)
    .eq("plan_version_id", version_id)
    .eq("plan_type", plan_type);

  if (error) {
    console.error(error);
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
    if (bold) tr.classList.add("font-bold", "bg-slate-50");
    let html = `<td class="${bold ? "font-semibold" : ""}">${label}</td>`;
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
