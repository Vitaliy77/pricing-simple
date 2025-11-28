// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

let _costProjectIds = []; // all projects under current level-1

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Budget</h3>
    <p style="font-size:0.9rem; margin-bottom:1rem; color:#475569;">
      Build costs for all projects under the selected Level 1 project — direct labor, subcontractors, and other direct costs.
    </p>

    <section id="costMessage"
             style="min-height:1.25rem; font-size:0.9rem; color:#64748b; margin-bottom:0.75rem;"></section>

    <!-- Controls: pick project + add cost lines -->
    <section style="margin-bottom:0.75rem;">
      <h4 style="margin-bottom:0.35rem;font-size:0.9rem;">Add Cost Lines</h4>
      <div style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end;">
        <label style="min-width:260px;">
          Project
          <select id="costProjectSelect">
            <option value="">— Select project —</option>
          </select>
        </label>

        <button id="costAddEmpBtn" class="btn btn-sm">
          + Add Employees
        </button>
        <button id="costAddSubBtn" class="btn btn-sm">
          + Add Subcontractors
        </button>
        <button id="costAddOdcBtn" class="btn btn-sm">
          + Add ODC
        </button>
      </div>
      <p style="font-size:0.8rem;color:#6b7280;margin-top:0.25rem;">
        Pick any project under the Level 1 tree, then use these buttons to add or adjust cost lines
        (employees, subs, ODC) for that specific project.
      </p>
    </section>

    <section style="margin-top:0.25rem;">
      <div class="scroll-x">
        <table id="costTable" class="data-grid">
          <thead>
            <tr>
              <th class="sticky-col-1 col-person">Person / Vendor / Category</th>
              <th class="sticky-col-2 col-role">Role / Description</th>
              <th>Project</th>
              <th>Entry Type</th>
              <th>Jan</th><th>Feb</th><th>Mar</th><th>Apr</th><th>May</th><th>Jun</th>
              <th>Jul</th><th>Aug</th><th>Sep</th><th>Oct</th><th>Nov</th><th>Dec</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="costBody">
            <tr><td colspan="18">Loading…</td></tr>
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
        left: 220px; /* match sticky-col-1 width */
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

      .btn.btn-sm {
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        border: 1px solid #cbd5e1;
        background:#e5e7eb;
        font-size:0.8rem;
        cursor:pointer;
      }

      .btn.btn-sm:hover {
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

    // Wire buttons (stub behavior for now)
    const projSel = $("#costProjectSelect", root);
    $("#costAddEmpBtn", root)?.addEventListener("click", () => {
      console.log("[Cost] Add Employees clicked for project:", projSel?.value || "(none)");
      // TODO: open employee picker / create lines for selected project
    });
    $("#costAddSubBtn", root)?.addEventListener("click", () => {
      console.log("[Cost] Add Subcontractors clicked for project:", projSel?.value || "(none)");
      // TODO: open subcontractor picker / create lines for selected project
    });
    $("#costAddOdcBtn", root)?.addEventListener("click", () => {
      console.log("[Cost] Add ODC clicked for project:", projSel?.value || "(none)");
      // TODO: open ODC picker / create lines for selected project
    });

    await refreshCost(root, client);
  },
};

// Load all projects under a given Level 1 project, populate dropdown, and cache ids
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
      entry_type_id,
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
    tbody.innerHTML = `<tr><td colspan="18">No cost lines found for this Level 1 project and plan.</td></tr>`;
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
      <td>${r.project_name || ""}</td>
      <td>${r.entry_type_id || ""}</td>
      ${monthCells}
      <td class="num row-total">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}
