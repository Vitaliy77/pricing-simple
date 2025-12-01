// js/tabs/subsOdcInputs.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

const MONTH_COLS = [
  "amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
  "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec",
];
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let projectScope = [];
let vendors = [];
let lines = [];

// Helper copied from laborHours.js – finds Level 1 + all children
async function getProjectScope(client, level1ProjectId) {
  if (!level1ProjectId) return [];

  const { data: parent, error: pErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (pErr || !parent) {
    console.error("[SubsOdcInputs] load parent project error", pErr);
    return [];
  }

  const { data: children, error: cErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (cErr) {
    console.error("[SubsOdcInputs] load child projects error", cErr);
    return [parent];
  }

  return [parent, ...(children || [])];
}

async function loadVendors(client) {
  const { data, error } = await client
    .from("vendors")
    .select("id, vendor_name")
    .eq("active", true)
    .order("vendor_name");

  if (error) {
    console.error("[SubsOdcInputs] loadVendors error", error);
    return [];
  }
  return data || [];
}

async function fetchSubsOdcLines(client, projectIds, ctx) {
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      id,
      project_id,
      project_name,
      vendor_id,
      resource_name,
      description,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
      entry_types ( code )
    `)
    .in("project_id", projectIds)
    .in("entry_types.code", ["SUBC_COST", "ODC_COST"])
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (error) {
    console.error("[SubsOdcInputs] fetch lines error", error);
    return [];
  }

  return (data || []).map(line => ({
    ...line,
    entry_types: line.entry_types || { code: line.vendor_id ? "SUBC_COST" : "ODC_COST" }
  }));
}

export const template = /*html*/ `
  <article class="full-width-card w-full">
    <style>
      .subs-table {
        border-collapse: collapse;
        width: max-content;
        min-width: 100%;
      }
      .subs-table th,
      .subs-table td {
        padding: 2px 4px;
        white-space: nowrap;
        background-clip: padding-box;
      }

      /* smaller, right-aligned entry cells */
      .subs-cell-input {
        width: 3rem;
        min-width: 3rem;
        max-width: 3rem;
        text-align: right;
        color: #0f172a !important;
        background-color: #ffffff !important;
        height: 1.5rem;
        line-height: 1.5rem;
        font-variant-numeric: tabular-nums;
      }

      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .no-spin { -moz-appearance: textfield; }

      /* Sticky column widths */
      .subs-col-project { width: 9rem; }
      .subs-col-type    { width: 7rem; }
      .subs-col-vendor  { width: 11rem; }
      .subs-col-desc    { width: 16rem; }

      .subs-sticky-1, .subs-sticky-2, .subs-sticky-3, .subs-sticky-4 {
        position: sticky;
        z-index: 30;
      }
      .subs-sticky-1 { left: 0; }
      .subs-sticky-2 { left: 9rem; }
      .subs-sticky-3 { left: 16rem; }
      .subs-sticky-4 { left: 27rem; }

      /* opaque sticky backgrounds (no bleed-through) */
      .subs-table thead .subs-sticky-1,
      .subs-table thead .subs-sticky-2,
      .subs-table thead .subs-sticky-3,
      .subs-table thead .subs-sticky-4 {
        background-color: #f8fafc;
        z-index: 40;
      }
      .subs-table tbody .subs-sticky-1,
      .subs-table tbody .subs-sticky-2,
      .subs-table tbody .subs-sticky-3,
      .subs-table tbody .subs-sticky-4 {
        background-color: #ffffff;
        z-index: 35;
        border-right: 1px solid #e2e8f0;
      }

      .subs-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .subs-row-striped:nth-child(even) { background-color: #ffffff; }
      .subs-row-striped:hover           { background-color: #dbeafe; }
      .subs-row-active                  { background-color: #bfdbfe !important; }

      .subs-summary-row {
        background-color: #e5e7eb;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 20;
      }
    </style>

    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="subsInlinePlan" class="font-medium"></span>
        <span id="subsInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">· Subs &amp; ODC Costs</span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Enter dollar costs per month for subcontractors and other direct costs.
        </span>
      </div>
      <div id="subsOdcMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <section id="subsOdcSection" class="border-t border-slate-200" style="display:none;">
      <div class="px-4 py-2 flex flex-wrap items-end gap-3 text-xs">
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Project</span>
          <select
            id="subsProjectSelect"
            class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">— Select project —</option>
          </select>
        </label>

        <button id="addSubsLineBtn" class="px-3 py-1.5 font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Add Subs Line
        </button>
        <button id="addOdcLineBtn" class="px-3 py-1.5 font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Add ODC Line
        </button>
      </div>

      <div class="w-full max-h-[520px] overflow-y-auto overflow-x-auto">
        <table class="subs-table text-xs">
          <thead class="bg-slate-50">
            <tr>
              <th class="subs-sticky-1 subs-col-project sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Project</th>
              <th class="subs-sticky-2 subs-col-type    sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Type</th>
              <th class="subs-sticky-3 subs-col-vendor  sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Vendor</th>
              <th class="subs-sticky-4 subs-col-desc    sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Description</th>
              ${MONTH_LABELS.map(m => `<th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">${m}</th>`).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Total $</th>
            </tr>
          </thead>
          <tbody id="subsOdcTbody" class="bg-white">
            <tr><td colspan="17" class="text-center py-10 text-slate-500 text-xs">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isNaN(n) ? "" : n.toString();
}

function computeRowTotal(line) {
  return MONTH_COLS.reduce((sum, key) => sum + (Number(line[key] || 0) || 0), 0);
}

// ─────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────
function renderLines(root) {
  const tbody = $("#subsOdcTbody", root);
  if (!tbody) return;

  if (!lines.length) {
    tbody.innerHTML = `<tr><td colspan="17" class="text-center py-10 text-slate-500 text-xs">No lines yet. Use the buttons above to add.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  lines.forEach((line, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.lineId = line.id;
    tr.dataset.index = idx;
    tr.className = "subs-row-striped";

    const typeLabel = line.entry_types?.code === "SUBC_COST" ? "Subs" : "ODC";
    const total = computeRowTotal(line);

    const projectOptions = projectScope.map(p =>
      `<option value="${p.id}" ${p.id === line.project_id ? "selected" : ""}>${p.project_code} – ${p.name}</option>`
    ).join("");

    const vendorOptions = [
      '<option value="">— Vendor —</option>',
      ...vendors.map(v => `<option value="${v.id}" ${v.id === line.vendor_id ? "selected" : ""}>${v.vendor_name}</option>`)
    ].join("");

    const monthCells = MONTH_COLS.map(key => `
      <td class="text-right">
        <input
          class="cell-input cell-input-num subs-cell-input no-spin border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]"
          data-row="${idx}"
          data-field="${key}"
          type="number"
          step="1"
          value="${fmtNum(line[key])}"
        />
      </td>
    `).join("");

    tr.innerHTML = `
      <td class="subs-sticky-1 subs-col-project">
        <select class="cell-input subs-cell-input border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]" data-row="${idx}" data-field="project_id">
          ${projectOptions}
        </select>
      </td>
      <td class="subs-sticky-2 subs-col-type text-[11px] text-slate-800">${typeLabel}</td>
      <td class="subs-sticky-3 subs-col-vendor">
        <select class="cell-input subs-cell-input border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]" data-row="${idx}" data-field="vendor_id">
          ${vendorOptions}
        </select>
      </td>
      <td class="subs-sticky-4 subs-col-desc">
        <input class="cell-input subs-cell-input border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]"
               data-row="${idx}" data-field="description" type="text" value="${line.description || ""}" />
      </td>
      ${monthCells}
      <td class="text-right text-[11px] font-semibold text-slate-900" data-total-row="${idx}">
        ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Summary row
  const summaryTr = document.createElement("tr");
  summaryTr.dataset.summaryRow = "subs";
  summaryTr.className = "subs-summary-row";
  summaryTr.innerHTML = `
    <td class="text-[11px] font-semibold text-slate-900" colspan="4">Totals</td>
    ${MONTH_COLS.map(c => `<td class="text-right text-[11px]" data-total-col="${c}"></td>`).join("")}
    <td class="text-right text-[11px] font-semibold" data-total-col="all"></td>
  `;
  tbody.appendChild(summaryTr);

  updateSubsTotals(root);
}

function updateSubsTotals(root) {
  const summaryRow = root.querySelector("tr[data-summary-row='subs']");
  if (!summaryRow || !lines.length) return;

  const colTotals = {};
  MONTH_COLS.forEach(c => colTotals[c] = 0);
  let grand = 0;

  lines.forEach(line => {
    MONTH_COLS.forEach(c => {
      const val = Number(line[c] || 0);
      if (!Number.isNaN(val)) {
        colTotals[c] += val;
        grand += val;
      }
    });
  });

  MONTH_COLS.forEach(c => {
    const cell = summaryRow.querySelector(`[data-total-col="${c}"]`);
    if (cell) cell.textContent = colTotals[c].toLocaleString(undefined, { maximumFractionDigits: 0 });
  });

  const grandCell = summaryRow.querySelector('[data-total-col="all"]');
  if (grandCell) grandCell.textContent = grand.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ─────────────────────────────────────────────
// DATA MUTATIONS
// ─────────────────────────────────────────────
async function addNewSubsOdcLine(client, ctx, typeCode, projectId) {
  if (!projectId) return null;

  const { data: et, error: etErr } = await client
    .from("entry_types")
    .select("id")
    .eq("code", typeCode)
    .single();

  if (etErr || !et) {
    console.error("[SubsOdcInputs] entry_type lookup error", etErr);
    return null;
  }

  const entryTypeId = et.id;
  const proj = projectScope.find(p => p.id === projectId);

  const payload = {
    project_id: projectId,
    project_name: proj?.name || null,
    entry_type_id: entryTypeId,
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
    plan_type: ctx.planType || "Working",
    description: "",
  };
  MONTH_COLS.forEach(c => { payload[c] = 0; });

  const { data, error } = await client
    .from("planning_lines")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[SubsOdcInputs] insert error", error);
    return null;
  }
  return data;
}

async function updateNumericCell(client, lineId, field, value) {
  const { error } = await client
    .from("planning_lines")
    .update({ [field]: value === "" ? 0 : Number(value) })
    .eq("id", lineId);
  if (error) console.error("[SubsOdcInputs] update numeric error", error);
}

async function updateTextField(client, lineId, field, value) {
  const { error } = await client
    .from("planning_lines")
    .update({ [field]: value || null })
    .eq("id", lineId);
  if (error) console.error("[SubsOdcInputs] update text error", error);
}

async function updateProjectOnLine(client, lineId, projectId) {
  const proj = projectScope.find(p => p.id === projectId);
  const { error } = await client
    .from("planning_lines")
    .update({ project_id: projectId, project_name: proj?.name || null })
    .eq("id", lineId);
  if (error) console.error("[SubsOdcInputs] update project error", error);
}

async function updateVendorOnLine(client, lineId, vendorId) {
  const vendor = vendors.find(v => v.id === vendorId);
  const { error } = await client
    .from("planning_lines")
    .update({ vendor_id: vendorId || null, resource_name: vendor?.vendor_name || null })
    .eq("id", lineId);
  if (error) console.error("[SubsOdcInputs] update vendor error", error);
}

// ──────────────────────────────────────────────
// TAB INIT
//─────────────────────────────────────────────
export const subsOdcInputsTab = {
  template,
  async init({ root, client }) {
    const msg = $("#subsOdcMessage", root);
    const section = $("#subsOdcSection", root);
    const ctx = getPlanContext();

    // Header labels – same logic as laborHours style
    $("#subsInlinePlan", root).textContent =
      ctx?.planLabel || (ctx?.year ? `BUDGET – ${ctx.year} · ${ctx.planType || "Working"}` : "Subs & ODC");
    if (ctx?.level1ProjectCode && ctx?.level1ProjectName) {
      $("#subsInlinePlan", root).textContent += ` · Level 1 Project: ${ctx.level1ProjectCode} – ${ctx.level1ProjectName}`;
    }
    if (ctx?.projectCode && ctx?.projectName) {
      $("#subsInlineProject", root).textContent = `, ${ctx.projectCode} – ${ctx.projectName}`;
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg.textContent = "Please select a Level 1 project and plan first.";
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    msg.textContent = "Loading subs & ODC costs…";

    projectScope = await getProjectScope(client, ctx.level1ProjectId);
    vendors = await loadVendors(client);
    const projectIds = projectScope.map(p => p.id);

    // Fill project dropdown
    const projSel = $("#subsProjectSelect", root);
    if (projSel) {
      projSel.innerHTML = `<option value="">— Select project —</option>`;
      projectScope.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.project_code} – ${p.name}`;
        projSel.appendChild(opt);
      });
    }

    lines = await fetchSubsOdcLines(client, projectIds, ctx);

    renderLines(root);
    updateSubsTotals(root);
    msg.textContent = lines.length ? "" : "No lines yet. Use the buttons above to add.";

    // Add buttons
    $("#addSubsLineBtn", root)?.addEventListener("click", async () => {
      const projId = $("#subsProjectSelect", root)?.value || "";
      if (!projId) {
        msg.textContent = "Please select a project before adding a Subs line.";
        return;
      }
      await addNewSubsOdcLine(client, ctx, "SUBC_COST", projId);
      lines = await fetchSubsOdcLines(client, projectIds, ctx);
      renderLines(root);
      updateSubsTotals(root);
    });

    $("#addOdcLineBtn", root)?.addEventListener("click", async () => {
      const projId = $("#subsProjectSelect", root)?.value || "";
      if (!projId) {
        msg.textContent = "Please select a project before adding an ODC line.";
        return;
      }
      await addNewSubsOdcLine(client, ctx, "ODC_COST", projId);
      lines = await fetchSubsOdcLines(client, projectIds, ctx);
      renderLines(root);
      updateSubsTotals(root);
    });

    // Input changes
    $("#subsOdcTbody", root)?.addEventListener("change", async (e) => {
      const input = e.target;
      if (!input.classList.contains("cell-input")) return;

      const idx = Number(input.dataset.row);
      const field = input.dataset.field;
      if (Number.isNaN(idx) || !field || !lines[idx]) return;

      const line = lines[idx];
      const val = input.value;

      if (MONTH_COLS.includes(field)) {
        line[field] = val === "" ? 0 : Number(val);
        input.value = fmtNum(line[field]);
        await updateNumericCell(client, line.id, field, line[field]);
      } else if (field === "description") {
        line.description = val;
        await updateTextField(client, line.id, field, val);
      } else if (field === "project_id") {
        await updateProjectOnLine(client, line.id, val || null);
      } else if (field === "vendor_id") {
        await updateVendorOnLine(client, line.id, val || null);
      }

      renderLines(root);
      updateSubsTotals(root);
    });

    // Row highlight
    $("#subsOdcTbody", root)?.addEventListener("click", (e) => {
      const tr = e.target.closest("tr.subs-row-striped");
      if (!tr) return;
      root.querySelectorAll("tr.subs-row-striped").forEach(r => r.classList.remove("subs-row-active"));
      tr.classList.add("subs-row-active");
    });
  },
};
