// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import { getSelectedProject, getSelectedProjectId } from "../lib/projectContext.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Budget</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;">
      Build costs for the selected project. This view summarizes planning lines
      where the entry is marked as cost (not revenue) – e.g., direct labor,
      subcontractors, and other direct costs.
    </p>

    <!-- Selected project -->
    <section id="costProjectInfo" style="font-size:0.9rem;font-weight:500;margin-bottom:0.5rem;"></section>

    <!-- Filters -->
    <section style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.75rem;">
      <label>
        Plan Year
        <select id="costYearSelect">
          <option value="2026">2026</option>
          <option value="2027">2027</option>
          <option value="2028">2028</option>
        </select>
      </label>

      <label>
        Plan Version
        <select id="costVersionSelect">
          <option value="">Loading…</option>
        </select>
      </label>

      <label>
        Plan Type
        <select id="costTypeSelect">
          <option value="Working">Working</option>
          <option value="Final">Final</option>
        </select>
      </label>
    </section>

    <section id="costMessage" style="min-height:1.25rem;font-size:0.9rem;"></section>

    <!-- Cost table -->
    <section style="margin-top:0.75rem;">
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr>
              <th>Line</th>
              <th>Entry Type</th>
              <th>Person / Vendor</th>
              <th>Description</th>
              <th>Jan</th>
              <th>Feb</th>
              <th>Mar</th>
              <th>Apr</th>
              <th>May</th>
              <th>Jun</th>
              <th>Jul</th>
              <th>Aug</th>
              <th>Sep</th>
              <th>Oct</th>
              <th>Nov</th>
              <th>Dec</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="costBody">
            <tr><td colspan="17">Select a project and plan filters to view costs.</td></tr>
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
    const projInfo = $("#costProjectInfo", root);

    const project = getSelectedProject();
    const projectId = getSelectedProjectId();

    if (!project || !projectId) {
      if (projInfo) projInfo.textContent = "";
      if (msg) msg.textContent = "Select a project on the Projects tab first.";
      renderCost(root, null);
      return;
    }

    // Show project in this tab as well
    if (projInfo) {
      const code = project.project_code || "";
      const name = project.name || "";
      projInfo.textContent = `Project: ${code} ${name}`.trim();
    }

    // Load plan versions
    await loadPlanVersions(root, client);

    // Wire filters
    ["costYearSelect", "costVersionSelect", "costTypeSelect"].forEach((id) => {
      const el = $(`#${id}`, root);
      if (!el) return;
      el.addEventListener("change", () => refreshCost(root, client));
    });

    if (msg) msg.textContent = "Select year, version, and plan type to view costs.";

    // Optionally auto-load with default filter combination
    await refreshCost(root, client);
  },
};

// ---------- helpers ----------

async function loadPlanVersions(root, client) {
  const sel = $("#costVersionSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    sel.innerHTML = `<option value="">Error loading versions</option>`;
    return;
  }

  sel.innerHTML = `<option value="">— Select version —</option>`;
  for (const pv of data) {
    const opt = document.createElement("option");
    opt.value = pv.id;
    opt.textContent = `${pv.code} – ${pv.description}`;
    sel.appendChild(opt);
  }
}

async function refreshCost(root, client) {
  const msg = $("#costMessage", root);
  const yearSel = $("#costYearSelect", root);
  const verSel  = $("#costVersionSelect", root);
  const typeSel = $("#costTypeSelect", root);

  const projectId = getSelectedProjectId();

  if (!projectId) {
    if (msg) msg.textContent = "Select a project on the Projects tab first.";
    renderCost(root, null);
    return;
  }

  const plan_year  = yearSel?.value ? parseInt(yearSel.value, 10) : null;
  const version_id = verSel?.value || null;
  const plan_type  = typeSel?.value || null;

  if (!plan_year || !version_id || !plan_type) {
    if (msg) msg.textContent = "Please select year, version, and plan type.";
    renderCost(root, null);
    return;
  }

  if (msg) msg.textContent = "Loading costs…";

  // Adjust column names if your planning_lines schema differs
  const { data, error } = await client
    .from("planning_lines")
    .select(
      "id, entry_type_name, employee_name, vendor_name, description, is_revenue, " +
      "jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec"
    )
    .eq("project_id", projectId)
    .eq("plan_year", plan_year)
    .eq("plan_type", plan_type)
    .eq("plan_version_id", version_id)
    .eq("is_revenue", false)               // 🔴 cost lines only
    .order("entry_type_name", { ascending: true });

  if (error) {
    console.error(error);
    if (msg) msg.textContent = "Error loading cost lines.";
    renderCost(root, null);
    return;
  }

  renderCost(root, data || []);
  if (msg) msg.textContent = "";
}

function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="17">No cost lines for the selected filters.</td></tr>`;
    return;
  }

  const months = [
    "jan","feb","mar","apr","may","jun",
    "jul","aug","sep","oct","nov","dec",
  ];

  const fmt = (v) =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : (v ? String(v) : "");

  tbody.innerHTML = "";

  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");

    const who =
      r.employee_name ||
      r.vendor_name ||
      "";

    let total = 0;
    const monthTds = months
      .map((m) => {
        const val = Number(r[m] || 0);
        total += val;
        return `<td class="num">${fmt(val)}</td>`;
      })
      .join("");

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${r.entry_type_name || ""}</td>
      <td>${who}</td>
      <td>${r.description || ""}</td>
      ${monthTds}
      <td class="num">${fmt(total)}</td>
    `;

    tbody.appendChild(tr);
  });
}
