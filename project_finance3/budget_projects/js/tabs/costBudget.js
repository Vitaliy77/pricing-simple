// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

let _costProjectIds = [];
const _entryTypeIds = {};

export const template = /*html*/ `
  <article class="full-width-card">
    <div class="px-6 pt-8 pb-6">
      <h3 class="text-2xl font-bold text-slate-900 mb-2">Cost Budget</h3>
      
      <p class="text-sm text-slate-600 mb-6 leading-relaxed">
        Build costs for all projects under the selected Level 1 project — direct labor, subcontractors, and other direct costs.
      </p>

      <div id="costMessage" class="text-sm text-slate-600 mb-6 min-h-6"></div>

      <!-- ADD COST LINES -->
      <section class="mb-8">
        <h4 class="text-lg font-semibold text-slate-800 mb-4">Add Cost Lines</h4>
        
        <div class="flex flex-wrap gap-4 items-end">
          <label class="flex-1 min-w-64">
            <span class="block text-sm font-medium text-slate-700 mb-1">Project</span>
            <select id="costProjectSelect" class="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
              <option value="">— Select project —</option>
            </select>
          </label>

          <button id="addEmployeesBtn" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition">
            + Add Employees
          </button>
          <button id="addSubsBtn" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition">
            + Add Subcontractors
          </button>
          <button id="addOdcBtn" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition">
            + Add ODC
          </button>
        </div>

        <p class="text-xs text-slate-500 mt-4">
          Pick any project under the Level 1 tree, then use these buttons to add cost lines.
        </p>
      </section>
    </div>

    <!-- FULL-WIDTH RESPONSIVE TABLE WITH REUSABLE STICKY CLASSES -->
    <div class="overflow-x-auto">
      <div class="inline-block min-w-full align-middle">
        <table id="costTable" class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="cost-grid-sticky cost-col-1 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider px-4 py-3">Project</th>
              <th class="cost-grid-sticky cost-col-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider px-4 py-3">Person / Vendor / Category</th>
              <th class="cost-grid-sticky cost-col-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider px-4 py-3">Role / Description</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Jan</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Feb</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Mar</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Apr</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">May</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Jun</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Jul</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Aug</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Sep</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Oct</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Nov</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Dec</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody id="costBody" class="bg-white divide-y divide-slate-200">
            <tr><td colspan="16" class="text-center py-12 text-slate-500 text-sm">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </article>
`;

// Add these reusable sticky column classes to your css/styles.css (if not already there)
const STICKY_CLASSES_CSS = `
  .cost-grid-sticky {
    position: sticky;
    z-index: 10;
    background: white;
    border-right: 1px solid #e2e8f0;
  }
  .cost-col-1 { left: 0; }
  .cost-col-2 { left: 12rem; }     /* 192px ≈ 12rem */
  .cost-col-3 { left: 24rem; }     /* 384px ≈ 24rem */
  .cost-grid-sticky.cost-col-1 { z-index: 20; }
  .cost-grid-sticky.cost-col-2 { z-index: 19; }
  .cost-grid-sticky.cost-col-3 { z-index: 18; }
`;

// Inject once if needed (optional — better to put in your main CSS)
if (!document.getElementById('cost-grid-styles')) {
  const style = document.createElement('style');
  style.id = 'cost-grid-styles';
  style.textContent = STICKY_CLASSES_CSS;
  document.head.appendChild(style);
}

export const costBudgetTab = {
  template,
  async init({ root, client }) {
    const msg = $("#costMessage", root);
    const ctx = getPlanContext();

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg && (msg.textContent = "Please select a Level 1 project and plan first.");
      renderCost(root, null);
      return;
    }

    await loadProjectsUnderLevel1(root, client, ctx.level1ProjectId);
    const projSelect = $("#costProjectSelect", root);

    $("#addEmployeesBtn", root)?.addEventListener("click", () => handleAddLines(root, client, projSelect, "DIR_LAB_COST", "New employee cost line"));
    $("#addSubsBtn", root)?.addEventListener("click", () => handleAddLines(root, client, projSelect, "SUBC_COST", "New subcontractor cost line"));
    $("#addOdcBtn", root)?.addEventListener("click", () => handleAddLines(root, client, projSelect, "ODC_COST", "New ODC cost line"));

    await refreshCost(root, client);
  },
};

// ————————————————————————————————————————
// Render function — now using your clean sticky classes
// ————————————————————————————————————————
function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="16" class="text-center py-16 text-slate-500">No cost lines found for this project and plan.</td></tr>`;
    return;
  }

  const months = ["amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
                  "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec"];
  const fmt = v => typeof v === "number" ? v.toLocaleString() : "";

  tbody.innerHTML = "";
  rows.forEach(r => {
    const who = r.resource_name || "";
    const desc = r.department_name || r.description || "";
    let total = 0;

    const monthCells = months.map(m => {
      const val = Number(r[m] || 0);
      total += val;
      return `<td class="px-4 py-3 text-right text-sm text-slate-900">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
      <td class="cost-grid-sticky cost-col-1 px-4 py-3 text-sm font-medium text-slate-900">${r.project_name || ""}</td>
      <td class="cost-grid-sticky cost-col-2 px-4 py-3 text-sm font-medium text-slate-800">${who}</td>
      <td class="cost-grid-sticky cost-col-3 px-4 py-3 text-sm text-slate-600 italic">${desc}</td>
      ${monthCells}
      <td class="px-4 py-3 text-right text-sm font-bold text-slate-900 bg-slate-50">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ————————————————————————————————————————
// All other functions unchanged (perfect as-is)
// ————————————————————————————————————————
async function loadProjectsUnderLevel1(root, client, level1ProjectId) { /* ... unchanged ... */ }
async function getEntryTypeId(client, code) { /* ... unchanged ... */ }
async function handleAddLines(root, client, projSel, entryCode, defaultDescription) { /* ... unchanged ... */ }
async function refreshCost(root, client) { /* ... unchanged ... */ }
