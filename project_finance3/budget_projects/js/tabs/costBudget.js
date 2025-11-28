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
    $("#addEmployeesBtn", root)?.addEventListener("click", () =>
      handleAddLines(root, client, projSelect, "DIR_LAB_COST", "New employee cost line")
    );
    $("#addSubsBtn", root)?.addEventListener("click", () =>
      handleAddLines(root, client, projSelect, "SUBC_COST", "New subcontractor cost line")
    );
    $("#addOdcBtn", root)?.addEventListener("click", () =>
      handleAddLines(root, client, projSelect, "ODC_COST", "New ODC cost line")
    );

    await refreshCost(root, client);
  },
};

// ─────────────────────────────────────────────
// RENDER COST GRID
// ─────────────────────────────────────────────
function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="16" class="text-center py-16 text-slate-500">No cost lines found for this project and plan.</td></tr>`;
    return;
  }

  const months = [
    "amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
    "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec"
  ];
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

// ─────────────────────────────────────────────
// LOAD ALL PROJECTS UNDER LEVEL 1
// ─────────────────────────────────────────────
async function loadProjectsUnderLevel1(root, client, level1ProjectId) {
  const sel = $("#costProjectSelect", root);
  const msg = $("#costMessage", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">— Select project —</option>`;
  _costProjectIds = [];

  const { data: parent, error: parentError } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (parentError || !parent) {
    console.error("[CostBudget] Error loading parent project", parentError);
    msg && (msg.textContent = "Error loading Level 1 project.");
    return;
  }

  const { data: children, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error) {
    console.error("[CostBudget] Error loading child projects", error);
    msg && (msg.textContent = "Error loading child projects.");
    return;
  }

  const all = [parent, ...(children || [])];
  _costProjectIds = all.map(p => p.id);

  all.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.project_code} – ${p.name}`;
    sel.appendChild(opt);
  });
}

// ─────────────────────────────────────────────
// ENTRY TYPE ID CACHE
// ─────────────────────────────────────────────
async function getEntryTypeId(client, code) {
  if (_entryTypeIds[code]) return _entryTypeIds[code];

  const { data, error } = await client
    .from("entry_types")
    .select("id")
    .eq("code", code)
    .single();

  if (error || !data) {
    console.error("[CostBudget] Error loading entry_type", code, error);
    throw error || new Error("entry_type not found");
  }

  _entryTypeIds[code] = data.id;
  return data.id;
}

// ─────────────────────────────────────────────
// ADD LINES (EMPLOYEES / SUBS / ODC)
// ─────────────────────────────────────────────
async function handleAddLines(root, client, projSel, entryCode, defaultDescription) {
  const ctx = getPlanContext();
  const msg = $("#costMessage", root);

  const projectId = projSel?.value || null;
  const projectLabel = projSel?.selectedOptions[0]?.textContent || "";
  const projectName = projectLabel.split(" – ").slice(1).join(" – ") || projectLabel;

  if (!projectId) {
    msg && (msg.textContent = "Please pick a project from the dropdown first.");
    return;
  }

  try {
    const entryTypeId = await getEntryTypeId(client, entryCode);

    const payload = {
      project_id: projectId,
      project_name: projectName,
      entry_type_id: entryTypeId,
      is_revenue: false,
      resource_name: defaultDescription,
      description: defaultDescription,
      plan_year: ctx.year,
      plan_version_id: ctx.versionId,
      plan_type: ctx.planType || "Working",
      amt_jan: 0, amt_feb: 0, amt_mar: 0, amt_apr: 0,
      amt_may: 0, amt_jun: 0, amt_jul: 0, amt_aug: 0,
      amt_sep: 0, amt_oct: 0, amt_nov: 0, amt_dec: 0,
    };

    const { error } = await client.from("planning_lines").insert(payload);
    if (error) throw error;

    msg && (msg.textContent = "New cost line added.");
    await refreshCost(root, client);
  } catch (err) {
    console.error("[CostBudget] handleAddLines error", err);
    msg && (msg.textContent = "Error adding cost line.");
  }
}

// ─────────────────────────────────────────────
// REFRESH GRID
// ─────────────────────────────────────────────
async function refreshCost(root, client) {
  const msg = $("#costMessage", root);
  const ctx = getPlanContext();

  if (!_costProjectIds.length || !ctx.year || !ctx.versionId) {
    renderCost(root, null);
    return;
  }

  msg && (msg.textContent = "Loading costs…");

  const { data, error } = await client
    .from("planning_lines")
    .select("id, project_name, resource_name, department_name, description, amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun, amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec")
    .in("project_id", _costProjectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", false)
    .order("project_name", { ascending: true });

  if (error) {
    console.error("[CostBudget] Cost load error", error);
    msg && (msg.textContent = "Error loading cost data.");
    renderCost(root, null);
    return;
  }

  renderCost(root, data || []);
  msg && (msg.textContent = data?.length ? "" : "No cost lines found.");
}
