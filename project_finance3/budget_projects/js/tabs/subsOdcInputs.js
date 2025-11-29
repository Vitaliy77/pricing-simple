// js/tabs/subsOdcInputs.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

const MONTH_COLS = [
  "amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
  "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec",
];

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

let entryTypeIdByCode = null; // { SUBC_COST: uuid, ODC_COST: uuid }
let projectScope = []; // [{ id, project_code, name }]
let vendors = [];      // [{ id, vendor_name }]
let lines = [];        // planning_lines rows (SUBC/ODC only)

export const template = /*html*/ `
  <article class="full-width-card w-full">
    <style>
      .subs-table {
        border-collapse: collapse;
        width: 100%;
      }
      .subs-table th,
      .subs-table td {
        padding: 2px 4px;
        white-space: nowrap;
      }

      .subs-cell-input-num {
        min-width: 4.8rem;
        text-align: right;
      }
      .subs-cell-input-text {
        min-width: 9rem;
      }

      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .no-spin {
        -moz-appearance: textfield;
      }

      /* Sticky columns (Project, Type, Vendor, Description) */
      .subs-sticky-1,
      .subs-sticky-2,
      .subs-sticky-3,
      .subs-sticky-4 {
        position: sticky;
        z-index: 30;
        background-color: inherit; /* keep striping */
      }
      .subs-sticky-1 { left: 0; }
      .subs-sticky-2 { left: 8rem; }
      .subs-sticky-3 { left: 16rem; }
      .subs-sticky-4 { left: 28rem; }

      .subs-col-project { min-width: 8rem; }
      .subs-col-type { min-width: 8rem; }
      .subs-col-vendor { min-width: 10rem; }
      .subs-col-desc { min-width: 12rem; }

      .subs-row-striped:nth-child(odd) {
        background-color: #eff6ff;
      }
      .subs-row-striped:nth-child(even) {
        background-color: #ffffff;
      }
      .subs-row-striped:hover {
        background-color: #dbeafe;
      }
      .subs-row-active {
        background-color: #bfdbfe !important;
      }

      .subs-summary-row {
        background-color: #e5e7eb;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 20;
      }
    </style>

    <!-- Compact inline header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="subsInlinePlan" class="font-medium"></span>
        <span id="subsInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Subs &amp; ODC Costs
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Enter dollar costs per month for subcontractors and other direct costs.
        </span>
      </div>
      <div
        id="subsOdcMessage"
        class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"
      ></div>
    </div>

    <section id="subsOdcSection" class="border-t border-slate-200" style="display:none;">
      <div class="px-4 py-2 flex flex-wrap gap-2 text-xs">
        <button id="addSubsLineBtn" class="px-3 py-1.5 font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Add Subs Line
        </button>
        <button id="addOdcLineBtn" class="px-3 py-1.5 font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Add ODC Line
        </button>
      </div>

      <div class="w-full max-h-[520px] overflow-auto overflow-x-auto">
        <table class="subs-table min-w-full text-xs table-fixed">
          <thead class="bg-slate-50">
            <tr>
              <th
                class="subs-sticky-1 subs-col-project sticky top-0 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider"
              >
                Project
              </th>
              <th
                class="subs-sticky-2 subs-col-type sticky top-0 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider"
              >
                Type
              </th>
              <th
                class="subs-sticky-3 subs-col-vendor sticky top-0 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider"
              >
                Vendor
              </th>
              <th
                class="subs-sticky-4 subs-col-desc sticky top-0 bg-slate-50
                       text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider"
              >
                Description
              </th>
              ${MONTH_LABELS.map(
                (m) => `
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                ${m}
              </th>`
              ).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Total $
              </th>
            </tr>
          </thead>
          <tbody id="subsOdcTbody" class="bg-white">
            <tr>
              <td colspan="17" class="text-center py-10 text-slate-500 text-xs">
                Loading…
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  if (Number.isNaN(num)) return "";
  return num.toString();
}

function computeRowTotal(line) {
  return MONTH_COLS.reduce((sum, key) => {
    const val = Number(line[key] || 0);
    return sum + (Number.isNaN(val) ? 0 : val);
  }, 0);
}

// ─────────────────────────────────────────────
// LOADERS
// ─────────────────────────────────────────────

async function getProjectScope(client, level1ProjectId) {
  const { data: parent, error: parentError } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (parentError || !parent) {
    console.error("[subsOdc] parent project error", parentError);
    return [];
  }

  const { data: children, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error) {
    console.error("[subsOdc] child projects error", error);
    return [parent];
  }

  return [parent, ...(children || [])];
}

async function loadVendors(client) {
  const { data, error } = await client
    .from("vendors")
    .select("id, vendor_name, active")
    .eq("active", true)
    .order("vendor_name");

  if (error) {
    console.error("[subsOdc] loadVendors error", error);
    return [];
  }
  return data || [];
}

async function ensureEntryTypeIds(client) {
  if (entryTypeIdByCode) return entryTypeIdByCode;
  const { data, error } = await client
    .from("entry_types")
    .select("id, code");
  if (error) {
    console.error("[subsOdc] entry_types error", error);
    entryTypeIdByCode = {};
    return entryTypeIdByCode;
  }
  entryTypeIdByCode = {};
  (data || []).forEach((row) => {
    entryTypeIdByCode[row.code] = row.id;
  });
  return entryTypeIdByCode;
}

async function fetchSubsOdcLines(client, projectIds, ctx) {
  if (!projectIds.length) return [];

  let query = client
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
      is_revenue,
      entry_types ( code, display_name ),
      projects ( project_code, name )
    `)
    .in("project_id", projectIds)
    .eq("is_revenue", false);

  if (ctx.year) query = query.eq("plan_year", ctx.year);
  if (ctx.versionId) query = query.eq("plan_version_id", ctx.versionId);
  if (ctx.planType) query = query.eq("plan_type", ctx.planType);

  const { data, error } = await query;
  if (error) {
    console.error("[subsOdc] fetchSubsOdcLines error", error);
    return [];
  }

  return (data || [])
    .filter((r) => {
      const code = r.entry_types?.code;
      return code === "SUBC_COST" || code === "ODC_COST";
    })
    .map((r) => ({
      ...r,
      project_code: r.projects?.project_code || "",
      project_display_name: r.projects?.name || r.project_name || "",
    }));
}

function getTypeLabel(line) {
  const code = line.entry_types?.code;
  if (code === "SUBC_COST") return "Subs";
  if (code === "ODC_COST") return "ODC";
  return line.entry_types?.display_name || "Cost";
}

// ─────────────────────────────────────────────
// RENDERING & TOTALS
// ─────────────────────────────────────────────

function updateSubsTotals(root) {
  const summaryRow = root.querySelector("tr[data-summary-row='subs']");
  if (!summaryRow || !lines.length) return;

  const colTotals = {};
  MONTH_COLS.forEach((c) => (colTotals[c] = 0));
  let grand = 0;

  lines.forEach((line) => {
    MONTH_COLS.forEach((c) => {
      const val = Number(line[c] || 0);
      if (!Number.isNaN(val)) {
        colTotals[c] += val;
        grand += val;
      }
    });
  });

  MONTH_COLS.forEach((c) => {
    const cell = summaryRow.querySelector(`[data-total-col="${c}"]`);
    if (cell) {
      cell.textContent = colTotals[c].toLocaleString(undefined, {
        maximumFractionDigits: 0,
      });
    }
  });

  const grandCell = summaryRow.querySelector('[data-total-col="all"]');
  if (grandCell) {
    grandCell.textContent = grand.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
  }
}

function renderLines(root) {
  const tbody = $("#subsOdcTbody", root);
  if (!tbody) return;

  if (!lines.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="17" class="text-center py-10 text-slate-500 text-xs">
          No subcontractor or ODC lines yet. Use the buttons above to add lines.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  lines.forEach((line, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.lineId = line.id;
    tr.dataset.index = idx.toString();
    tr.className = "subs-row-striped";

    const typeLabel = getTypeLabel(line);
    const total = computeRowTotal(line);

    const projectOptions = projectScope
      .map(
        (p) => `
          <option value="${p.id}" ${
          p.id === line.project_id ? "selected" : ""
        }>
            ${p.project_code} – ${p.name}
          </option>`
      )
      .join("");

    const vendorOptions = [
      '<option value="">— Vendor —</option>',
      ...vendors.map(
        (v) => `
        <option value="${v.id}" ${
          v.id === line.vendor_id ? "selected" : ""
        }>${v.vendor_name}</option>`
      ),
    ].join("");

    const monthCells = MONTH_COLS
      .map(
        (key) => `
        <td>
          <input
            class="cell-input cell-input-num subs-cell-input-num no-spin border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]"
            data-row="${idx}"
            data-field="${key}"
            type="number"
            step="1"
            value="${fmtNum(line[key])}"
          />
        </td>
      `
      )
      .join("");

    tr.innerHTML = `
      <td class="subs-sticky-1 subs-col-project text-[11px] font-medium text-slate-900">
        <select
          class="cell-input subs-cell-input-text border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]"
          data-row="${idx}"
          data-field="project_id"
        >
          ${projectOptions}
        </select>
      </td>
      <td class="subs-sticky-2 subs-col-type text-[11px] text-slate-800">
        ${typeLabel}
      </td>
      <td class="subs-sticky-3 subs-col-vendor text-[11px] text-slate-800">
        <select
          class="cell-input subs-cell-input-text border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]"
          data-row="${idx}"
          data-field="vendor_id"
        >
          ${vendorOptions}
        </select>
      </td>
      <td class="subs-sticky-4 subs-col-desc text-[11px] text-slate-700">
        <input
          class="cell-input subs-cell-input-text border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]"
          data-row="${idx}"
          data-field="description"
          type="text"
          value="${line.description || ""}"
        />
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
  const labelCells = `
    <td class="text-[11px] font-semibold text-slate-900">Totals</td>
    <td></td>
    <td></td>
    <td></td>
  `;
  const monthTotalsCells = MONTH_COLS.map(
    (c) =>
      `<td class="text-right text-[11px]" data-total-col="${c}"></td>`
  ).join("");
  const grandTotalCell = `
    <td class="text-right text-[11px] font-semibold" data-total-col="all"></td>
  `;
  summaryTr.innerHTML = labelCells + monthTotalsCells + grandTotalCell;
  tbody.appendChild(summaryTr);

  updateSubsTotals(root);
}

// ─────────────────────────────────────────────
// UPSERTS
// ─────────────────────────────────────────────

async function addNewSubsOdcLine(client, ctx, typeCode) {
  await ensureEntryTypeIds(client);
  const entryTypeId = entryTypeIdByCode?.[typeCode];
  if (!entryTypeId) {
    console.error("[subsOdc] missing entry_type_id for", typeCode);
    return null;
  }

  if (!projectScope.length) return null;
  const firstProj = projectScope[0];

  const payload = {
    project_id: firstProj.id,
    project_name: firstProj.name,
    entry_type_id: entryTypeId,
    is_revenue: false,
    vendor_id: null,
    resource_name: "",
    description: "",
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
    plan_type: ctx.planType || "Working",
  };
  MONTH_COLS.forEach((c) => {
    payload[c] = 0;
  });

  const { data, error } = await client
    .from("planning_lines")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[subsOdc] add line error", error);
    return null;
  }
  return data;
}

async function updateNumericCell(client, lineId, field, value) {
  const patch = {};
  patch[field] = value === "" ? 0 : Number(value);

  const { error } = await client
    .from("planning_lines")
    .update(patch)
    .eq("id", lineId);

  if (error) {
    console.error("[subsOdc] updateNumericCell error", error);
  }
}

async function updateTextField(client, lineId, field, value) {
  const patch = {};
  patch[field] = value || null;

  const { error } = await client
    .from("planning_lines")
    .update(patch)
    .eq("id", lineId);

  if (error) {
    console.error("[subsOdc] updateTextField error", error);
  }
}

async function updateProjectOnLine(client, lineId, projectId) {
  const patch = { project_id: projectId };
  const proj = projectScope.find((p) => p.id === projectId);
  if (proj) {
    patch.project_name = proj.name;
  }
  const { error } = await client
    .from("planning_lines")
    .update(patch)
    .eq("id", lineId);

  if (error) {
    console.error("[subsOdc] updateProjectOnLine error", error);
  }
}

async function updateVendorOnLine(client, lineId, vendorId) {
  const patch = { vendor_id: vendorId || null };
  const v = vendors.find((vv) => vv.id === vendorId);
  if (v) {
    patch.resource_name = v.vendor_name;
  }
  const { error } = await client
    .from("planning_lines")
    .update(patch)
    .eq("id", lineId);

  if (error) {
    console.error("[subsOdc] updateVendorOnLine error", error);
  }
}

// ─────────────────────────────────────────────
// ROW HIGHLIGHT
// ─────────────────────────────────────────────

function wireSubsRowHighlight(root) {
  const tbody = $("#subsOdcTbody", root);
  if (!tbody) return;

  const setActive = (tr) => {
    tbody
      .querySelectorAll("tr.subs-row-striped, tr.subs-summary-row")
      .forEach((row) => row.classList.remove("subs-row-active"));
    if (tr && tr.matches(".subs-row-striped")) {
      tr.classList.add("subs-row-active");
    }
  };

  tbody.addEventListener("focusin", (evt) => {
    const tr = evt.target.closest("tr");
    if (tr) setActive(tr);
  });

  tbody.addEventListener("click", (evt) => {
    const tr = evt.target.closest("tr");
    if (tr) setActive(tr);
  });
}

// ─────────────────────────────────────────────
// TAB INIT
// ─────────────────────────────────────────────

export const subsOdcInputsTab = {
  template,
  async init({ root, client }) {
    const msgEl = $("#subsOdcMessage", root);
    const sectionEl = $("#subsOdcSection", root);
    const tbody = $("#subsOdcTbody", root);
    const ctx = getPlanContext();

    // compact header from global header
    const globalPlan =
      document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    const globalProject =
      document.querySelector("#currentProject")?.textContent?.trim() || "";
    const planSpan = $("#subsInlinePlan", root);
    const projSpan = $("#subsInlineProject", root);
    if (planSpan) planSpan.textContent = globalPlan;
    if (projSpan) {
      if (globalProject) {
        projSpan.textContent = `, ${globalProject}`;
      } else {
        projSpan.textContent = "";
      }
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      if (msgEl) {
        msgEl.textContent =
          "Please select a Level 1 project and plan first.";
      }
      if (sectionEl) sectionEl.style.display = "none";
      return;
    }

    if (msgEl) msgEl.textContent = "Loading subs & ODC costs…";

    projectScope = await getProjectScope(client, ctx.level1ProjectId);
    vendors = await loadVendors(client);
    const projectIds = projectScope.map((p) => p.id);

    lines = await fetchSubsOdcLines(client, projectIds, ctx);

    if (sectionEl) sectionEl.style.display = "block";
    renderLines(root);
    if (msgEl) msgEl.textContent = "";

    $("#addSubsLineBtn", root).addEventListener("click", async () => {
      const newLine = await addNewSubsOdcLine(client, ctx, "SUBC_COST");
      if (newLine) {
        lines = await fetchSubsOdcLines(client, projectIds, ctx);
        renderLines(root);
      }
    });

    $("#addOdcLineBtn", root).addEventListener("click", async () => {
      const newLine = await addNewSubsOdcLine(client, ctx, "ODC_COST");
      if (newLine) {
        lines = await fetchSubsOdcLines(client, projectIds, ctx);
        renderLines(root);
      }
    });

    // Delegated changes
    tbody.addEventListener("change", async (evt) => {
      const input = evt.target;
      if (!input.classList.contains("cell-input")) return;
      const rowIdx = Number(input.dataset.row);
      const field = input.dataset.field;
      if (Number.isNaN(rowIdx) || !field) return;

      const line = lines[rowIdx];
      if (!line) return;
      const lineId = line.id;
      const newVal = input.value;

      if (MONTH_COLS.includes(field)) {
        line[field] = newVal === "" ? 0 : Number(newVal);
        // keep the value visible
        input.value = fmtNum(line[field]);

        await updateNumericCell(client, lineId, field, newVal);

        const totalCell = root.querySelector(`[data-total-row="${rowIdx}"]`);
        if (totalCell) {
          totalCell.textContent = computeRowTotal(line).toLocaleString(
            undefined,
            { maximumFractionDigits: 0 }
          );
        }
        updateSubsTotals(root);
      } else if (field === "description") {
        line[field] = newVal;
        await updateTextField(client, lineId, field, newVal);
      } else if (field === "project_id") {
        line.project_id = newVal || null;
        await updateProjectOnLine(client, lineId, newVal || null);
      } else if (field === "vendor_id") {
        line.vendor_id = newVal || null;
        await updateVendorOnLine(client, lineId, newVal || null);
      }
    });

    wireSubsRowHighlight(root);
  },
};
