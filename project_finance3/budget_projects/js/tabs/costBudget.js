// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Budget</h3>
    <p style="font-size:0.9rem; margin-bottom:0.75rem; color:#475569;">
      Build costs for the selected project — direct labor, subcontractors, and other direct costs.
    </p>

    <section id="costMessage"
             style="min-height:1.25rem; font-size:0.9rem; color:#64748b; margin-bottom:0.5rem;"></section>

    <!-- Toolbar -->
    <section style="margin-bottom:0.75rem; display:flex; flex-wrap:wrap; gap:0.5rem;">
      <button id="btnAddEmpCost" class="btn-primary">Add Employee</button>
      <button id="btnAddSubCost" class="btn-secondary">Add Sub</button>
      <button id="btnAddOdcCost" class="btn-secondary">Add ODC</button>
    </section>

    <!-- Mapped employees overview -->
    <section id="mappedEmployeesSection" style="margin-bottom:0.75rem;">
      <h4 style="margin-bottom:0.25rem; font-size:0.9rem;">Mapped Employees (staffing)</h4>
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Allocation %</th>
              <th>Start</th>
              <th>End</th>
            </tr>
          </thead>
          <tbody id="mappedEmployeesBody">
            <tr><td colspan="5">Loading mapped employees…</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Cost planning grid -->
    <section style="margin-top:0.5rem;">
      <h4 style="margin-bottom:0.25rem; font-size:0.9rem;">Cost Lines</h4>
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
    const ctx = getPlanContext();
    const projectId = ctx.projectId;

    console.log("[Cost:init] projectId:", projectId);
    console.log("[Cost:init] planContext:", ctx);

    if (!projectId) {
      msg && (msg.textContent = "No project selected. Please go to the Projects tab.");
      renderCost(root, null);
      renderMappedEmployees(root, null);
      return;
    }

    if (!ctx.year || !ctx.versionId) {
      msg && (msg.textContent = "Plan not fully selected. Please complete selection in the Projects tab.");
      renderCost(root, null);
      renderMappedEmployees(root, null);
      return;
    }

    // Wire buttons (placeholders for now)
    const btnEmp = $("#btnAddEmpCost", root);
    const btnSub = $("#btnAddSubCost", root);
    const btnOdc = $("#btnAddOdcCost", root);

    btnEmp?.addEventListener("click", () => {
      alert("Add Employee cost line – implementation to be added.");
    });
    btnSub?.addEventListener("click", () => {
      alert("Add Subcontractor cost line – implementation to be added.");
    });
    btnOdc?.addEventListener("click", () => {
      alert("Add ODC cost line – implementation to be added.");
    });

    // Load mapped employees + cost lines
    await Promise.all([
      refreshMappedEmployees(root, client),
      refreshCost(root, client),
    ]);
  },
};

// ────────────────────────────────────────────────────────────────
// Mapped employees (from project_employee_assignments + employees)
// ────────────────────────────────────────────────────────────────
async function refreshMappedEmployees(root, client) {
  const tbody = $("#mappedEmployeesBody", root);
  const ctx = getPlanContext();
  const projectId = ctx.projectId;

  if (!tbody) return;

  if (!projectId) {
    tbody.innerHTML = `<tr><td colspan="5">No project selected.</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="5">Loading mapped employees…</td></tr>`;

  // 1) Get assignments
  const { data: assigns, error: assignErr } = await client
    .from("project_employee_assignments")
    .select("employee_id, allocation_pct, start_date, end_date")
    .eq("project_id", projectId);

  if (assignErr) {
    console.error("[Cost] Error loading assignments:", assignErr);
    tbody.innerHTML = `<tr><td colspan="5">Error loading mapped employees.</td></tr>`;
    return;
  }

  if (!assigns || assigns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No employees mapped to this project.</td></tr>`;
    return;
  }

  const employeeIds = [...new Set(assigns.map(a => a.employee_id).filter(Boolean))];
  if (employeeIds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No employees mapped to this project.</td></tr>`;
    return;
  }

  // 2) Get employee details
  const { data: emps, error: empErr } = await client
    .from("employees")
    .select("id, full_name, department_code, department_name")
    .in("id", employeeIds);

  if (empErr) {
    console.error("[Cost] Error loading employees:", empErr);
    tbody.innerHTML = `<tr><td colspan="5">Error loading mapped employees.</td></tr>`;
    return;
  }

  const empById = new Map((emps || []).map(e => [e.id, e]));

  const rows = assigns.map(a => {
    const e = empById.get(a.employee_id) || {};
    return {
      full_name: e.full_name || "(unknown)",
      dept: e.department_name || e.department_code || "",
      allocation_pct: a.allocation_pct,
      start_date: a.start_date,
      end_date: a.end_date,
    };
  });

  renderMappedEmployees(root, rows);
}

function renderMappedEmployees(root, rows) {
  const tbody = $("#mappedEmployeesBody", root);
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No employees mapped to this project.</td></tr>`;
    return;
  }

  const fmtDate = d => (d ? new Date(d).toLocaleDateString() : "");
  const fmtPct = v =>
    typeof v === "number" ? `${v.toFixed(0)}%` : (v ? `${Number(v).toFixed(0)}%` : "");

  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.full_name}</td>
      <td>${r.dept || ""}</td>
      <td class="num">${fmtPct(r.allocation_pct)}</td>
      <td>${fmtDate(r.start_date)}</td>
      <td>${fmtDate(r.end_date)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ────────────────────────────────────────────────────────────────
// Cost planning lines from planning_lines (is_revenue = false)
// ────────────────────────────────────────────────────────────────
async function refreshCost(root, client) {
  const msg = $("#costMessage", root);
  const ctx = getPlanContext();
  const projectId = ctx.projectId;

  if (!projectId || !ctx.year || !ctx.versionId) {
    renderCost(root, null);
    return;
  }

  msg && (msg.textContent = "Loading costs…");

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
    .eq("is_revenue", false);

  console.log("[Cost] rows:", data, "error:", error);

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

  const monthCols = [
    "amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
    "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec"
  ];
  const fmt = v =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "";

  tbody.innerHTML = "";
  rows.forEach((r, i) => {
    const who = r.resource_name || "";
    const entryType = r.is_revenue ? "Revenue" : "Cost"; // placeholder until you join entry_types
    let total = 0;

    const monthCells = monthCols.map(col => {
      const val = Number(r[col] || 0);
      total += val;
      return `<td class="num">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${entryType}</td>
      <td>${who}</td>
      <td>${r.description || ""}</td>
      ${monthCells}
      <td class="num font-semibold">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}
