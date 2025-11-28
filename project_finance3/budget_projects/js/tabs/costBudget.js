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
        <table id="costTable" class="data-grid">
          <thead>
            <tr>
              <th class="sticky-col-1 col-person">Person / Vendor / Category</th>
              <th class="sticky-col-2 col-role">Role / Description</th>
              <th>Entry Type</th>
              <th>Jan</th><th>Feb</th><th>Mar</th><th>Apr</th><th>May</th><th>Jun</th>
              <th>Jul</th><th>Aug</th><th>Sep</th><th>Oct</th><th>Nov</th><th>Dec</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="costBody">
            <tr><td colspan="16">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <style>
      #costTable {
        border-collapse: collapse;
        width: 100%;
      }

      #costTable th,
      #costTable td {
        border: 1px solid #ddd;
        padding: 0.25rem 0.35rem;
        white-space: nowrap;
        line-height: 1.2;
        font-size: 0.85rem;
      }

      #costTable thead th {
        background: #f3f4f6;
        font-size: 0.8rem;
        line-height: 1.3;
        position: sticky;
        top: 0;
        z-index: 15;
      }

      .sticky-col-1 {
        position: sticky;
        left: 0;
        background: #ffffff;
        z-index: 12;
        min-width: 220px;
      }

      .sticky-col-2 {
        position: sticky;
        left: 220px;
        background: #ffffff;
        z-index: 11;
        min-width: 260px;
      }

      #costTable tbody .sticky-col-1,
      #costTable tbody .sticky-col-2 {
        background: #ffffff;
      }

      .col-person {
        font-weight: 500;
      }

      .col-role {
        color: #4b5563;
      }

      .num {
        text-align: right;
      }

      .row-total {
        font-weight: 600;
      }
    </style>
  </article>
`;

export const costBudgetTab = {
  template,
  async init({ root, client }) {
    const msg = $("#costMessage", root);
    const projectId = getSelectedProjectId();
    const ctx = getPlanContext();

    console.log("[Cost:init] projectId:", projectId, "planContext:", ctx);

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
    .select(`
      id,
      entry_type_id,
      resource_name,
      department_name,
      description,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec
    `)
    .eq("project_id", projectId)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", false)
    .order("resource_name", { ascending: true });

  if (error) {
    console.error("Cost load error:", error);
    msg && (msg.textContent = "Error loading cost data.");
    renderCost(root, null);
    return;
  }

  renderCost(root, data || []);
  msg && (msg.textContent = data?.length === 0 ? "No cost lines found for this project and plan." : "");
}

function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="16">No cost lines found for this project and plan.</td></tr>`;
    return;
  }

  const months = [
    "amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
    "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec"
  ];

  const fmt = v =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "";

  tbody.innerHTML = "";
  rows.forEach((r) => {
    const who = r.resource_name || "";
    const roleOrDesc = r.department_name || r.description || "";
    let total = 0;

    const monthCells = months.map(m => {
      const val = Number(r[m] || 0);
      total += val;
      return `<td class="num">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="sticky-col-1 col-person">${who}</td>
      <td class="sticky-col-2 col-role">${roleOrDesc}</td>
      <td>${r.entry_type_id || ""}</td>
      ${monthCells}
      <td class="num row-total">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}
