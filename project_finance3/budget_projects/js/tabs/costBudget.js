// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

let _costProjectIds = [];
const _entryTypeIds = {};

export const template = /*html*/ `
  <article class="full-width-card text-[12px] flex flex-col">
    <!-- TOP AREA: TITLE + CONTROLS (NON-SCROLLING) -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <!-- Title + description on ONE line (wrap if needed) -->
      <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 class="font-semibold text-slate-900">Cost Budget</h3>
        <p class="text-slate-600">
          Build costs for all projects under the selected Level 1 project — direct labor, subcontractors, and other direct costs.
        </p>
      </div>

      <!-- Message line -->
      <div id="costMessage" class="text-[12px] text-slate-600 mb-2 min-h-[1.2rem]"></div>

      <!-- Add Cost Lines row: label + dropdown + 3 buttons on one line (wrap on small screens) -->
      <section>
        <div class="flex flex-wrap items-end gap-2">
          <span class="text-[12px] font-semibold text-slate-700">
            Add cost lines:
          </span>

          <label class="flex-1 min-w-[220px]">
            <span class="block text-[11px] font-medium text-slate-600 mb-0.5">Project</span>
            <select
              id="costProjectSelect"
              class="w-full border border-slate-300 rounded-md px-2 py-1 text-[12px]
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">— Select project —</option>
            </select>
          </label>

          <div class="flex flex-wrap gap-2">
            <button
              id="addEmployeesBtn"
              class="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white
                     font-medium text-[12px] shadow-sm transition"
            >
              + Add Employees
            </button>
            <button
              id="addSubsBtn"
              class="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white
                     font-medium text-[12px] shadow-sm transition"
            >
              + Add Subcontractors
            </button>
            <button
              id="addOdcBtn"
              class="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white
                     font-medium text-[12px] shadow-sm transition"
            >
              + Add ODC
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- TABLE AREA: ONLY THIS PART SCROLLS -->
    <div class="flex-1 overflow-x-auto overflow-y-auto max-h-[65vh]">
      <div class="inline-block min-w-full align-middle">
        <table id="costTable" class="min-w-full border-collapse">
          <thead class="bg-slate-50">
            <tr>
              <th
                class="cost-grid-sticky cost-col-1 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wide
                       px-2 py-1.5 border-b border-slate-200 bg-slate-50"
              >
                Project
              </th>
              <th
                class="cost-grid-sticky cost-col-2 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wide
                       px-2 py-1.5 border-b border-slate-200 bg-slate-50"
              >
                Person / Vendor / Category
              </th>
              <th
                class="cost-grid-sticky cost-col-3 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wide
                       px-2 py-1.5 border-b border-slate-200 bg-slate-50"
              >
                Role / Description
              </th>

              ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
                .map(
                  m => `
                    <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200">
                      ${m}
                    </th>`
                )
                .join("")}
              <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200">
                Total
              </th>
            </tr>
          </thead>

          <tbody id="costBody" class="bg-white">
            <tr>
              <td colspan="16" class="text-center py-4 text-slate-500 text-[12px]">
                Loading…
              </td>
            </tr>
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
// RENDER COST GRID (compact rows + stripes)
// ─────────────────────────────────────────────
function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16" class="text-center py-4 text-slate-500 text-[12px]">
          No cost lines found for this project and plan.
        </td>
      </tr>
    `;
    return;
  }

  const months = [
    "amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
    "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec"
  ];
  const fmt = v => (typeof v === "number" && !Number.isNaN(v)) ? v.toLocaleString() : "";

  tbody.innerHTML = "";
  rows.forEach((r, idx) => {
    const who = r.resource_name || "";
    const desc = r.department_name || r.description || "";
    let total = 0;

    const monthCells = months
      .map(m => {
        const val = Number(r[m] || 0);
        total += val;
        return `<td class="px-2 py-0.5 text-right text-[12px] text-slate-900">${fmt(val)}</td>`;
      })
      .join("");

    const tr = document.createElement("tr");
    // zebra stripes + hover
    tr.className = `${idx % 2 === 0 ? "bg-slate-50/70" : "bg-white"} hover:bg-blue-50 transition`;

    tr.innerHTML = `
      <td class="cost-grid-sticky cost-col-1 px-2 py-0.5 text-[12px] font-medium text-slate-900 border-r border-slate-200">
        ${r.project_name || ""}
      </td>
      <td class="cost-grid-sticky cost-col-2 px-2 py-0.5 text-[12px] font-medium text-slate-800 border-r border-slate-200">
        ${who}
      </td>
      <td class="cost-grid-sticky cost-col-3 px-2 py-0.5 text-[12px] text-slate-600 border-r border-slate-200">
        ${desc}
      </td>
      ${monthCells}
      <td class="px-2 py-0.5 text-right text-[12px] font-semibold text-slate-900 bg-slate-50">
        ${fmt(total)}
      </td>
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
    .select(
      "id, project_name, resource_name, department_name, description, " +
      "amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun, " +
      "amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec"
    )
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
