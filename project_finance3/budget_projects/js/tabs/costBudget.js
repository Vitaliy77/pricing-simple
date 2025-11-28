// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

let _costProjectIds = [];
const _entryTypeIds = {};

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Budget</h3>
    <p style="font-size:0.9rem; margin-bottom:1rem; color:#475569;">
      Build costs for all projects under the selected Level 1 project — direct labor, subcontractors, and other direct costs.
    </p>

    <section id="costMessage"
             style="min-height:1.25rem; font-size:0.9rem; color:#64748b; margin-bottom:0.75rem;"></section>

    <!-- CLEAN, MODERN "ADD COST LINES" SECTION -->
    <section style="margin-bottom:0.75rem;">
      <h4 style="margin-bottom:0.35rem;font-size:0.95rem;">Add Cost Lines</h4>
      <div
        style="
          display:flex;
          flex-wrap:wrap;
          gap:0.75rem;
          align-items:flex-end;
          width:100%;
        "
      >
        <label style="flex:1 1 320px; min-width:260px;">
          Project
          <select id="costProjectSelect" style="width:100%;">
            <option value="">— Select project —</option>
          </select>
        </label>

        <button id="addEmployeesBtn" class="btn-primary">
          + Add Employees
        </button>

        <button id="addSubsBtn" class="btn-primary">
          + Add Subcontractors
        </button>

        <button id="addOdcBtn" class="btn-primary">
          + Add ODC
        </button>
      </div>

      <p style="font-size:0.8rem; color:#64748b; margin-top:0.25rem;">
        Pick any project under the Level 1 tree, then use these buttons to add cost lines (employees, subs, ODC) for that specific project.
      </p>
    </section>

    <!-- FULL-WIDTH COST GRID -->
    <section style="margin-top:1rem; width:100%;">
      <div style="width:100%; overflow-x:auto;">
        <table
          id="costTable"
          class="data-grid"
          style="width:100%; min-width:1400px; border-collapse:collapse;"
        >
          <thead>
            <tr>
              <th class="sticky-col-1 col-project">Project</th>
              <th class="sticky-col-2 col-person">Person / Vendor / Category</th>
              <th class="sticky-col-3 col-role">Role / Description</th>
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
      #costTable th,
      #costTable td {
        border: 1px solid #ddd;
        padding: 0.35rem 0.5rem;
        white-space: nowrap;
        font-size: 0.85rem;
      }

      #costTable thead th {
        background: #f8fafc;
        font-weight: 600;
        font-size: 0.82rem;
        position: sticky;
        top: 0;
        z-index: 20;
        box-shadow: 0 2px 4px -2px rgba(0,0,0,0.1);
      }

      .sticky-col-1 { position: sticky; left: 0;    background: #fff; z-index: 18; min-width: 180px; }
      .sticky-col-2 { position: sticky; left: 180px; background: #fff; z-index: 17; min-width: 220px; }
      .sticky-col-3 { position: sticky; left: 400px; background: #fff; z-index: 16; min-width: 280px; }

      #costTable tbody .sticky-col-1,
      #costTable tbody .sticky-col-2,
      #costTable tbody .sticky-col-3 {
        background: #fff;
        box-shadow: 2px 0 6px -2px rgba(0,0,0,0.15);
      }

      .col-project { font-weight: 600; }
      .col-person  { font-weight: 500; }
      .col-role    { color: #4b5563; font-style: italic; }

      .num { text-align: right; }
      .row-total { font-weight: 700; background: #f1f5f9 !important; }

      /* Primary buttons — clean, bold, professional */
      .btn-primary {
        padding: 0.5rem 1rem;
        border-radius: 6px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      .btn-primary:hover {
        background: #2563eb;
      }
    </style>
  </article>
`;

export const costBudgetTab = {
  template,
  async init({ root, client }) {
    const msg = $("#costMessage", root);
    const ctx = getPlanContext();

    console.log("[Cost:init] planContext:", ctx);

    if (!ctx.level1ProjectId) {
      msg && (msg.textContent = "No Level 1 project selected. Please go to the Projects tab and pick a Level 1 project.");
      renderCost(root, null);
      return;
    }

    if (!ctx.year || !ctx.versionId) {
      msg && (msg.textContent = "Plan not fully selected. Please complete selection in the Projects tab.");
      renderCost(root, null);
      return;
    }

    await loadProjectsUnderLevel1(root, client, ctx.level1ProjectId);

    const projSelect = $("#costProjectSelect", root);

    // Updated button IDs — now perfectly wired
    $("#addEmployeesBtn", root)?.addEventListener("click", async () => {
      await handleAddLines(root, client, projSelect, "DIR_LAB_COST", "New employee cost line");
    });

    $("#addSubsBtn", root)?.addEventListener("click", async () => {
      await handleAddLines(root, client, projSelect, "SUBC_COST", "New subcontractor cost line");
    });

    $("#addOdcBtn", root)?.addEventListener("click", async () => {
      await handleAddLines(root, client, projSelect, "ODC_COST", "New ODC cost line");
    });

    await refreshCost(root, client);
  },
};

// ————————————————————————————————————————
// All your existing perfect functions below
// ————————————————————————————————————————

async function loadProjectsUnderLevel1(root, client, level1ProjectId) {
  const msg = $("#costMessage", root);
  const projSel = $("#costProjectSelect", root);

  _costProjectIds = [];
  projSel && (projSel.innerHTML = `<option value="">— Select project —</option>`);

  const { data: parent } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (!parent) {
    msg && (msg.textContent = "Error loading Level 1 project.");
    return;
  }

  const { data: children } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  const all = [parent, ...(children || [])];
  _costProjectIds = all.map(p => p.id);

  all.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.project_code} – ${p.name}`;
    projSel?.appendChild(opt);
  });
}

async function getEntryTypeId(client, code) {
  if (_entryTypeIds[code]) return _entryTypeIds[code];
  const { data } = await client.from("entry_types").select("id").eq("code", code).single();
  if (!data) throw new Error("Missing entry type: " + code);
  return _entryTypeIds[code] = data.id;
}

async function handleAddLines(root, client, projSel, entryCode, defaultDescription) {
  const msg = $("#costMessage", root);
  const ctx = getPlanContext();

  if (!projSel?.value) {
    msg && (msg.textContent = "Please select a project first.");
    return;
  }

  const projectId = projSel.value;
  const projectName = projSel.selectedOptions[0]?.textContent.split(" – ")[1] || "";

  const entryTypeId = await getEntryTypeId(client, entryCode);

  const newLine = {
    project_id: projectId,
    project_name: projectName,
    entry_type_id: entryTypeId,
    is_revenue: false,
    resource_name: "",
    description: defaultDescription,
    plan_version_id: ctx.versionId,
    plan_year: ctx.year,
    plan_type: ctx.planType || "Working",
    amt_jan: 0, amt_feb: 0, amt_mar: 0, amt_apr: 0, amt_may: 0, amt_jun: 0,
    amt_jul: 0, amt_aug: 0, amt_sep: 0, amt_oct: 0, amt_nov: 0, amt_dec: 0,
  };

  const { error } = await client.from("planning_lines").insert(newLine);
  if (error) {
    console.error("[Cost] Insert error:", error);
    msg && (msg.textContent = "Failed to add line.");
    return;
  }

  msg && (msg.textContent = "Cost line added successfully.");
  await refreshCost(root, client);
}

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
    .select(`
      id, project_id, project_name, resource_name, department_name, description,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec
    `)
    .in("project_id", _costProjectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", false);

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
    tbody.innerHTML = `<tr><td colspan="16">No cost lines found for this Level 1 project and plan.</td></tr>`;
    return;
  }

  const months = ["amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
                  "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec"];
  const fmt = v => typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  tbody.innerHTML = "";
  rows.forEach(r => {
    const who = r.resource_name || "";
    const desc = r.department_name || r.description || "";
    let total = 0;

    const monthCells = months.map(m => {
      const val = Number(r[m] || 0);
      total += val;
      return `<td class="num">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="sticky-col-1 col-project">${r.project_name || ""}</td>
      <td class="sticky-col-2 col-person">${who}</td>
      <td class="sticky-col-3 col-role">${desc}</td>
      ${monthCells}
      <td class="num row-total">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}
