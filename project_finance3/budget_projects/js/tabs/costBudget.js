// js/tabs/costBudget.js
import { $, h } from "../lib/dom.js";
import {
  getSelectedProject,
  getSelectedProjectId,
  getPlanContext,
  setPlanContext,
} from "../lib/projectContext.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Budget</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;">
      Build costs for the selected project. This view summarizes planning lines
      where the entry is marked as cost (not revenue) – e.g., direct labor,
      subcontractors, and other direct costs.
    </p>

    <!-- Selected project -->
    <section id="costProjectInfo" style="font-size:0.9rem;font-weight:500;margin-bottom:0.5rem;color:#1d4ed8;"></section>

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

    <section id="costMessage" style="min-height:1.25rem;font-size:0.9rem;color:#64748b;"></section>

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

    // Show current project
    const project = getSelectedProject();
    const projectId = getSelectedProjectId();

    if (!project || !projectId) {
      projInfo && (projInfo.textContent = "No project selected");
      msg && (msg.textContent = "Please select a project on the Projects tab first.");
      renderCost(root, null);
      return;
    }

    projInfo && (projInfo.textContent = `Project: ${project.project_code} – ${project.name}`);

    // DOM references
    const yearSel = $("#costYearSelect", root);
    const verSel  = $("#costVersionSelect", root);
    const typeSel = $("#costTypeSelect", root);

    // Load versions first (needed for pre-fill)
    await loadPlanVersions(root, client);

    // PRE-FILL FROM SHARED CONTEXT
    const ctx = getPlanContext();
    if (ctx.year && yearSel) yearSel.value = String(ctx.year);
    if (ctx.planType && typeSel) typeSel.value = ctx.planType;
    if (ctx.versionId && verSel) verSel.value = ctx.versionId;

    // WIRE EVENTS: Update context + refresh data
    yearSel?.addEventListener("change", () => {
      const year = yearSel.value ? parseInt(yearSel.value, 10) : null;
      setPlanContext({ year });
      refreshCost(root, client);
    });

    typeSel?.addEventListener("change", () => {
      const planType = typeSel.value || "Working";
      setPlanContext({ planType });
      refreshCost(root, client);
    });

    verSel?.addEventListener("change", () => {
      const versionId = verSel.value || null;
      const versionText = verSel.selectedOptions[0]?.textContent || null;
      setPlanContext({ 
        versionId, 
        versionCode: versionText?.split(" – ")[0] 
      });
      refreshCost(root, client);
    });

    // Auto-load if context is complete
    if (ctx.year && ctx.versionId && ctx.planType) {
      await refreshCost(root, client);
    } else {
      msg && (msg.textContent = "Select year, version, and plan type to load costs.");
    }
  },
};

// Load plan versions with dataset.code
async function loadPlanVersions(root, client) {
  const sel = $("#costVersionSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    sel.innerHTML = `<option value="">Error loading versions</option>`;
    return console.error(error);
  }

  sel.innerHTML = `<option value="">— Select version —</option>`;
  data.forEach(pv => {
    const opt = document.createElement("option");
    opt.value = pv.id;
    opt.textContent = `${pv.code} – ${pv.description}`;
    opt.dataset.code = pv.code;
    sel.appendChild(opt);
  });
}

async function refreshCost(root, client) {
  const msg = $("#costMessage", root);
  const yearSel = $("#costYearSelect", root);
  const verSel  = $("#costVersionSelect", root);
  const typeSel = $("#costTypeSelect", root);
  const projectId = getSelectedProjectId();

  if (!projectId) {
    msg && (msg.textContent = "No project selected.");
    renderCost(root, null);
    return;
  }

  const plan_year = yearSel?.value ? parseInt(yearSel.value, 10) : null;
  const version_id = verSel?.value || null;
  const plan_type = typeSel?.value || "Working";

  if (!plan_year || !version_id) {
    msg && (msg.textContent = "Please select year and version.");
    renderCost(root, null);
    return;
  }

  msg && (msg.textContent = "Loading costs…");

  const { data, error } = await client
    .from("planning_lines")
    .select(
      "id, entry_type_name, employee_name, vendor_name, description, " +
      "jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec"
    )
    .eq("project_id", projectId)
    .eq("plan_year", plan_year)
    .eq("plan_version_id", version_id)
    .eq("plan_type", plan_type)
    .eq("is_revenue", false)  // Only cost lines
    .order("entry_type_name");

  if (error) {
    console.error(error);
    msg && (msg.textContent = "Error loading cost lines.");
    renderCost(root, null);
    return;
  }

  renderCost(root, data || []);
  msg && (msg.textContent = data?.length ? "" : "No cost lines found.");
}

function renderCost(root, rows) {
  const tbody = $("#costBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="17">No cost lines for the selected filters.</td></tr>`;
    return;
  }

  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const fmt = v => typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  tbody.innerHTML = "";
  rows.forEach((r, i) => {
    const who = r.employee_name || r.vendor_name || "";
    let total = 0;
    const cells = months.map(m => {
      const val = Number(r[m] || 0);
      total += val;
      return `<td class="num">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${r.entry_type_name || ""}</td>
      <td>${who}</td>
      <td>${r.description || ""}</td>
      ${cells}
      <td class="num font-semibold">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });
}
