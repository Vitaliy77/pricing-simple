// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getSelectedProjectId, getPlanContext } from "../lib/projectContext.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Budget</h3>
    <p style="font-size:0.9rem; margin-bottom:1rem; color:#475569;">
      Build costs for the selected project — direct labor, subcontractors, and other direct costs.
    </p>

    <section id="costMessage" 
             style="min-height:1.25rem; font-size:0.9rem; color:#64748b; margin-bottom:0.75rem;"></section>

    <section style="margin-top:0.5rem;">
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr>
              <th>Line</th>
              <th>Entry Type</th>
              <th>Person / Vendor</th>
              <th>Description</th>
              <th>Jan</th><th>Feb</th><th>Mar</th><th>Apr</th><th>May</th><th>Jun</th>
              <th>Jul</th><th>Aug</th><th>Sep</th><th>Oct</th><th>Nov</th><th>Dec</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="costBody">
            <tr><td colspan="17">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

export const costBudgetTab = {
  template,
  async init({ root, client }) {
    const msg = $("#costMessage", root);
    const projectId = getSelectedProjectId();
    const ctx = getPlanContext();

    // ——— Critical checks ———
    if (!projectId) {
      msg && (msg.textContent = "No project selected. Please go to the Projects tab.");
      renderCost(root, null);
      return;
    }

    if (!ctx.year || !ctx.versionId) {
      msg && (msg.textContent = "Plan not fully selected. Please complete selection in the Projects tab.");
      renderCost(root, null);
      return;
    }

    // ——— Auto-load data ———
    await refreshCost(root, client);
  },
};

async function refreshCost(root, client) {
  const msg = $("#costMessage", root);
  const projectId = getSelectedProjectId();
  const ctx = getPlanContext();

  if (!projectId || !ctx.year || !ctx.versionId) {
    renderCost(root, null);
    return;
  }

  msg && (msg.textContent = "Loading costs…");

  const { data, error } = await client
    .from("planning_lines")
    .select("id, entry_type_name, employee_name, vendor_name, description, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec")
    .eq("project_id", projectId)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", false)
    .order("entry_type_name");

  if (error) {
    console.error("Cost load error:", error);
    msg && (msg.textContent = "Error loading cost data.");
    renderCost(root, null);
    return;
  }

  renderCost(root, data || []);
  msg && (msg.textContent = data?.length === 0 ? "No cost lines found." : "");
}

function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="17">No cost lines found for this project and plan.</td></tr>`;
    return;
  }

  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const fmt = v => typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  tbody.innerHTML = "";
  rows.forEach((r, i) => {
    const who = r.employee_name || r.vendor_name || "";
    let total = 0;
    const monthCells = months.map(m => {
      const val = Number(r[m] || 0);
      total += val;
      return `<td class="num">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${r.entry_type_name || ""}</td>
      <td>${who}</td>
      <td>${r.description || ""}</td>
      ${monthCells}
      <td class="num font-semibold">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}
