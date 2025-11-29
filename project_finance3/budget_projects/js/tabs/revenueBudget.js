// js/tabs/revenueBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Revenue Budget</h3>
    <p style="font-size:0.9rem; margin-bottom:0.75rem; color:#475569;">
      Build revenue for the selected project.
    </p>

    <!-- Status / helper message -->
    <p id="revMessage"
       style="min-height:1.25rem; font-size:0.85rem; color:#64748b; margin-bottom:0.75rem;">
    </p>

    <!-- Main table card -->
    <section class="full-width-card">
      <div class="cost-table-wrapper">
        <table class="cost-table">
          <thead>
            <tr>
              <th>Line</th>
              <th class="sticky-col">Entry Type</th>
              <th class="sticky-col-2">Person / Vendor</th>
              <th class="sticky-col-3">Description</th>
              <th>Jan</th><th>Feb</th><th>Mar</th><th>Apr</th><th>May</th><th>Jun</th>
              <th>Jul</th><th>Aug</th><th>Sep</th><th>Oct</th><th>Nov</th><th>Dec</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="revBody">
            <tr>
              <td colspan="17" style="text-align:left; font-size:0.9rem; color:#64748b;">
                Loading…
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

export const revenueBudgetTab = {
  template,
  async init({ root, client }) {
    const msg = $("#revMessage", root);
    const ctx = getPlanContext();
    const projectId = ctx.projectId;

    console.log("[Revenue:init] projectId:", projectId);
    console.log("[Revenue:init] planContext:", ctx);

    if (!projectId) {
      if (msg) {
        msg.textContent = "No project selected. Please go to the Projects tab.";
      }
      renderRevenue(root, null);
      return;
    }

    if (!ctx.year || !ctx.versionId) {
      if (msg) {
        msg.textContent =
          "Plan not fully selected. Please complete selection in the Projects tab.";
      }
      renderRevenue(root, null);
      return;
    }

    await refreshRevenue(root, client);
  },
};

async function refreshRevenue(root, client) {
  const msg = $("#revMessage", root);
  const ctx = getPlanContext();
  const projectId = ctx.projectId;

  if (!projectId || !ctx.year || !ctx.versionId) {
    renderRevenue(root, null);
    return;
  }

  if (msg) msg.textContent = "Loading revenue…";

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      id,
      is_revenue,
      resource_name,
      description,
      amt_jan,
      amt_feb,
      amt_mar,
      amt_apr,
      amt_may,
      amt_jun,
      amt_jul,
      amt_aug,
      amt_sep,
      amt_oct,
      amt_nov,
      amt_dec
    `)
    .eq("project_id", projectId)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", true);

  console.log("[Revenue] rows:", data, "error:", error);

  if (error) {
    console.error("[Revenue] Load error:", error);
    if (msg) msg.textContent = "Error loading revenue.";
    renderRevenue(root, null);
    return;
  }

  renderRevenue(root, data || []);
  if (msg) {
    msg.textContent =
      !data || data.length === 0
        ? "No revenue lines found for this project and plan."
        : "";
  }
}

function renderRevenue(root, rows) {
  const tbody = $("#revBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="17" style="text-align:left; font-size:0.9rem; color:#64748b;">
          No revenue lines found for this project and plan.
        </td>
      </tr>
    `;
    return;
  }

  const monthCols = [
    "amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
    "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec"
  ];

  const fmt = v => (typeof v === "number" ? v.toLocaleString() : "");

  tbody.innerHTML = "";
  rows.forEach((r, i) => {
    const who = r.resource_name || "";
    const type = r.is_revenue ? "Revenue" : "";
    let total = 0;

    const cells = monthCols
      .map(col => {
        const val = Number(r[col] || 0);
        total += val;
        return `<td class="num text-right">${fmt(val)}</td>`;
      })
      .join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="sticky-col">${type}</td>
      <td class="sticky-col-2">${who}</td>
      <td class="sticky-col-3">${r.description || ""}</td>
      ${cells}
      <td class="num text-right font-semibold">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}
