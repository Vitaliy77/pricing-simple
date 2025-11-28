// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

let _costProjectIds = [];        // all projects under current level-1
const _entryTypeIds = {};        // cache: { DIR_LAB_COST: uuid, SUBC_COST: uuid, ODC_COST: uuid }

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Budget</h3>
    <p style="font-size:0.9rem; margin-bottom:1rem; color:#475569;">
      Build costs for all projects under the selected Level 1 project — direct labor, subcontractors, and other direct costs.
    </p>

    <section id="costMessage"
             style="min-height:1.25rem; font-size:0.9rem; color:#64748b; margin-bottom:0.75rem;"></section>

    <!-- Controls: pick project + add cost lines -->
    <section style="margin-bottom:0.75rem; width:100%;">
      <h4 style="margin-bottom:0.35rem;font-size:0.9rem;">Add Cost Lines</h4>
      <div style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end;">
        <label style="min-width:260px;">
          Project
          <select id="costProjectSelect" style="min-width:260px;">
            <option value="">— Select project —</option>
          </select>
        </label>

        <button id="costAddEmpBtn" class="btn-sm">
          + Add Employees
        </button>
        <button id="costAddSubBtn" class="btn-sm">
          + Add Subcontractors
        </button>
        <button id="costAddOdcBtn" class="btn-sm">
          + Add ODC
        </button>
      </div>
      <p style="font-size:0.8rem;color:#6b7280;margin-top:0.25rem;">
        Pick any project under the Level 1 tree, then use these buttons to add cost lines
        (employees, subs, ODC) for that specific project.
      </p>
    </section>

    <section style="margin-top:0.25rem; width:100%;">
      <div style="width:100%; overflow-x:auto;">
        <table id="costTable" class="data-grid" style="width:100%; border-collapse:collapse;">
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
        z-index: 20;
      }

      /* Sticky columns: widths & offsets are cumulative */
      .sticky-col-1 {
        position: sticky;
        left: 0;
        background: #ffffff;
        z-index: 18;
        min-width: 180px;
      }

      .sticky-col-2 {
        position: sticky;
        left: 180px;
        background: #ffffff;
        z-index: 17;
        min-width: 220px;
      }

      .sticky-col-3 {
        position: sticky;
        left: 400px; /* 180 + 220 */
        background: #ffffff;
        z-index: 16;
        min-width: 260px;
      }

      #costTable tbody .sticky-col-1,
      #costTable tbody .sticky-col-2,
      #costTable tbody .sticky-col-3 {
        background: #ffffff;
      }

      .col-project {
        font-weight: 500;
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

      .btn-sm {
        padding: 0.3rem 0.7rem;
        border-radius: 4px;
        border: 1px solid #cbd5e1;
        background:#e5e7eb;
        font-size:0.8rem;
        cursor:pointer;
        white-space: nowrap;
      }

      .btn-sm:hover {
        background:#d1d5db;
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

    // Load all projects under the selected Level 1 and populate dropdown
    await loadProjectsUnderLevel1(root, client, ctx.level1ProjectId);

    const projSel = $("#costProjectSelect", root);

    // Wire buttons to actually create lines
    $("#costAddEmpBtn", root)?.addEventListener("click", async () => {
      await handleAddLines(root, client, projSel, "DIR_LAB_COST", "New employee cost line");
    });
    $("#costAddSubBtn", root)?.addEventListener("click", async () => {
      await handleAddLines(root, client, projSel, "SUBC_COST", "New subcontractor cost line");
    });
    $("#costAddOdcBtn", root)?.addEventListener("click", async () => {
      await handleAddLines(root, client, projSel, "ODC_COST", "New ODC cost line");
    });

    await refreshCost(root, client);
  },
};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

async function loadProjectsUnderLevel1(root, client, level1ProjectId) {
  const msg = $("#costMessage", root);
  const projSel = $("#costProjectSelect", root);

  _costProjectIds = [];
  if (projSel) {
    projSel.innerHTML = `<option value="">— Select project —</option>`;
  }

  // 1) Get the Level 1 project
  const { data: parent, error: parentError } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (parentError || !parent) {
    console.error("[Cost] Error loading Level 1 project:", parentError);
    msg && (msg.textContent = "Error loading Level 1 project.");
    return;
  }

  // 2) Get all descendants under that Level 1
  const { data: children, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error) {
    console.error("[Cost] Error loading child projects:", error);
    msg && (msg.textContent = "Error loading child projects.");
    return;
  }

  const all = [parent, ...(children || [])];
  _costProjectIds = all.map(p => p.id);

  // Populate dropdown with all levels
  if (projSel) {
    all.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.project_code} – ${p.name}`;
      projSel.appendChild(opt);
    });
  }

  console.log("[Cost] Projects under Level 1:", all.length);
}

// Fetch entry_type.id by code and cache it
async function getEntryTypeId(client, code) {
  if (_entryTypeIds[code]) return _entryTypeIds[code];

  const { data, error } = await client
    .from("entry_types")
    .select("id, code")
    .eq("code", code)
    .single();

  if (error || !data) {
    console.error("[Cost] Unable to load entry_type for code:", code, error);
    throw new Error("Missing entry type " + code);
  }

  _entryTypeIds[code] = data.id;
  return data.id;
}

// Handle "+ Add ..." buttons – create a new blank planning_lines row
async function handleAddLines(root, client, projSel, entryCode, defaultDescription) {
  const msg = $("#costMessage", root);
  const ctx = getPlanContext();

  if (!projSel || !projSel.value) {
    msg && (msg.textContent = "Please select a project from the dropdown first.");
    return;
  }

  if (!ctx.year || !ctx.versionId) {
    msg && (msg.textContent = "Plan not fully selected. Please complete selection in the Projects tab.");
    return;
  }

  const projectId = projSel.value;
  const projectText = projSel.selectedOptions[0]?.textContent || "";
  const dashIdx = projectText.indexOf(" – ");
  const projectName = dashIdx >= 0 ? projectText.slice(dashIdx + 3) : projectText;

  let entryTypeId;
  try {
    entryTypeId = await getEntryTypeId(client, entryCode);
  } catch (err) {
    msg && (msg.textContent = "Error loading entry type. See console for details.");
    console.error(err);
    return;
  }

  const newLine = {
    project_id: projectId,
    project_name: projectName,
    entry_type_id: entryTypeId,
    is_revenue: false,
    employee_id: null,
    new_hire_id: null,
    vendor_id: null,
    resource_name: "",
    department_code: null,
    department_name: null,
    description: defaultDescription,
    plan_version_id: ctx.versionId,
    plan_year: ctx.year,
    plan_type: ctx.planType || "Working",
    amt_jan: 0,
    amt_feb: 0,
    amt_mar: 0,
    amt_apr: 0,
    amt_may: 0,
    amt_jun: 0,
    amt_jul: 0,
    amt_aug: 0,
    amt_sep: 0,
    amt_oct: 0,
    amt_nov: 0,
    amt_dec: 0,
  };

  const { error } = await client.from("planning_lines").insert(newLine);

  if (error) {
    console.error("[Cost] Error inserting planning line:", error);
    msg && (msg.textContent = "Error adding cost line.");
    return;
  }

  msg && (msg.textContent = "New cost line added.");
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
      id,
      project_id,
      project_name,
      resource_name,
      department_name,
      description,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec
    `)
    .in("project_id", _costProjectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", false)
    .order("project_name", { ascending: true })
    .order("resource_name", { ascending: true });

  if (error) {
    console.error("Cost load error:", error);
    msg && (msg.textContent = "Error loading cost data.");
    renderCost(root, null);
    return;
  }

  renderCost(root, data || []);
  msg && (msg.textContent = data?.length === 0 ? "No cost lines found for this Level 1 project and plan." : "");
}

function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="16">No cost lines found for this Level 1 project and plan.</td></tr>`;
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
      <td class="sticky-col-1 col-project">${r.project_name || ""}</td>
      <td class="sticky-col-2 col-person">${who}</td>
      <td class="sticky-col-3 col-role">${roleOrDesc}</td>
      ${monthCells}
      <td class="num row-total">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}
