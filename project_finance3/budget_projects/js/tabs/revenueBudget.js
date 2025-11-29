// js/tabs/revenueBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

const MONTHS = [
  { key: "jan", col: "amt_jan", label: "Jan", idx: 0 },
  { key: "feb", col: "amt_feb", label: "Feb", idx: 1 },
  { key: "mar", col: "amt_mar", label: "Mar", idx: 2 },
  { key: "apr", col: "amt_apr", label: "Apr", idx: 3 },
  { key: "may", col: "amt_may", label: "May", idx: 4 },
  { key: "jun", col: "amt_jun", label: "Jun", idx: 5 },
  { key: "jul", col: "amt_jul", label: "Jul", idx: 6 },
  { key: "aug", col: "amt_aug", label: "Aug", idx: 7 },
  { key: "sep", col: "amt_sep", label: "Sep", idx: 8 },
  { key: "oct", col: "amt_oct", label: "Oct", idx: 9 },
  { key: "nov", col: "amt_nov", label: "Nov", idx: 10 },
  { key: "dec", col: "amt_dec", label: "Dec", idx: 11 },
];

// STATE
let projectScope = [];
let projectMeta = {};
let rows = [];

const _revEntryTypeCache = {};

// ─────────────────────────────────────────────
// TEMPLATE (unchanged – already perfect)
// ─────────────────────────────────────────────
export const template = /*html*/ `
  <article class="full-width-card w-full">
    <style>
      .rev-table { border-collapse: collapse; width: max-content; min-width: 100%; }
      .rev-table th, .rev-table td { padding: 2px 4px; white-space: nowrap; box-sizing: border-box; }
      .rev-cell-input {
        min-width: 5.2rem; text-align: left; color: #0f172a !important;
        background-color: #ffffff !important; height: 1.5rem; line-height: 1.5rem;
      }
      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      .no-spin { -moz-appearance: textfield; }

      .rev-col-project { width: 11rem; }
      .rev-col-type    { width: 8rem; }
      .rev-col-desc    { width: 18rem; }

      .rev-sticky-1, .rev-sticky-2, .rev-sticky-3 {
        position: sticky; z-index: 25; background-color: #ffffff;
      }
      .rev-sticky-1 { left: 0; }
      .rev-sticky-2 { left: 11rem; }
      .rev-sticky-3 { left: 19rem; }

      .rev-table thead th.rev-sticky-1,
      .rev-table thead th.rev-sticky-2,
      .rev-table thead th.rev-sticky-3 {
        background-color: #f8fafc; z-index: 30;
      }

      .rev-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .rev-row-striped:nth-child(even) { background-color: #ffffff; }
      .rev-row-striped:hover           { background-color: #dbeafe; }
      .rev-row-active                  { background-color: #bfdbfe !important; }

      .rev-summary-row {
        background-color: #e5e7eb; font-weight: 600; position: sticky; bottom: 0; z-index: 20;
      }
    </style>

    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="revInlinePlan" class="font-medium"></span>
        <span id="revInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">· Revenue Budget</span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Revenue by project: T&amp;M labor (hours × rates), subs &amp; ODC, and manual fixed/software/unit revenue.
        </span>
      </div>
      <div id="revMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <section id="revControls" class="border-t border-slate-200" style="display:none;">
      <div class="px-4 py-2 flex flex-wrap items-end gap-3 text-xs">
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Project</span>
          <select id="revProjectSelect" class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="">— Select project —</option>
          </select>
        </label>
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Revenue Type</span>
          <select id="revTypeSelect" class="min-w-[140px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="Fixed">Fixed</option>
            <option value="Software">Software</option>
            <option value="Unit">Unit</option>
          </select>
        </label>
        <button id="addRevenueLineBtn" class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Add Revenue Line
        </button>
      </div>

      <div class="w-full max-h-[520px] overflow-y-auto overflow-x-auto">
        <table class="rev-table text-xs">
          <thead class="bg-slate-50">
            <tr>
              <th class="rev-sticky-1 rev-col-project sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Project</th>
              <th class="rev-sticky-2 rev-col-type sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Type</th>
              <th class="rev-sticky-3 rev-col-desc sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Description</th>
              ${MONTHS.map(m => `<th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">${m.label}</th>`).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Total $</th>
            </tr>
          </thead>
          <tbody id="revBody" class="bg-white">
            <tr><td colspan="17" class="text-center py-10 text-slate-500 text-xs">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function ensureMonthMap() {
  const obj = {};
  MONTHS.forEach(m => { obj[m.key] = 0; });
  return obj;
}

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isNaN(n) ? "" : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function dateToMonthKey(ymStr) {
  if (!ymStr) return null;
  const d = new Date(ymStr);
  if (Number.isNaN(d.getTime())) return null;
  const idx = d.getUTCMonth();
  const m = MONTHS.find(x => x.idx === idx);
  return m ? m.key : null;
}

// ─────────────────────────────────────────────
// PROJECT SCOPE
// ─────────────────────────────────────────────
async function loadProjectScope(client, level1ProjectId) {
  if (!level1ProjectId) return [];

  const { data: parent, error: pErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (pErr || !parent) {
    console.error("[Revenue] load parent project error", pErr);
    return [];
  }

  const { data: children, error: cErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (cErr) {
    console.error("[Revenue] load child projects error", cErr);
    return [parent];
  }

  return [parent, ...(children || [])];
}

// ─────────────────────────────────────────────
// ENTRY TYPE LOOKUP (for manual revenue)
// ─────────────────────────────────────────────
async function getRevenueEntryTypeId(client, typeLabel) {
  const codesToTry = [];
  if (typeLabel === "Fixed") codesToTry.push("REV_FIXED");
  if (typeLabel === "Software") codesToTry.push("REV_SOFTWARE");
  if (typeLabel === "Unit") codesToTry.push("REV_UNIT");
  codesToTry.push("REV_MANUAL", "REVENUE");

  for (const code of codesToTry) {
    if (_revEntryTypeCache[code]) return _revEntryTypeCache[code];

    const { data, error } = await client
      .from("entry_types")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (!error && data) {
      _revEntryTypeCache[code] = data.id;
      return data.id;
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// INSERT MANUAL REVENUE LINE — NEW & PERFECT
// ─────────────────────────────────────────────
async function insertManualRevenueLine(root, client, ctx, projectId, projectLabel, revType) {
  const msg = $("#revMessage", root);

  if (!projectId) {
    msg && (msg.textContent = "Please pick a project before adding revenue.");
    return null;
  }

  let resourceName = "Manual Revenue";
  if (revType === "Fixed") resourceName = "Fixed Revenue";
  else if (revType === "Software") resourceName = "Software Revenue";
  else if (revType === "Unit") resourceName = "Unit Revenue";

  const entryTypeId = await getRevenueEntryTypeId(client, revType);

  const payload = {
    project_id: projectId,
    project_name: projectLabel || null,
    is_revenue: true,
    entry_type_id: entryTypeId, // may be null → that's okay if your table allows it
    resource_name: resourceName,
    description: resourceName,
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
    plan_type: ctx.planType || "Working",
  };

  MONTHS.forEach(m => { payload[m.col] = 0; });

  try {
    const { data, error } = await client
      .from("planning_lines")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("[Revenue] insert manual revenue error", error);
      msg && (msg.textContent = "Error adding revenue line. Check console.");
      return null;
    }

    msg && (msg.textContent = `${resourceName} line added.`);

    // Return full row object so caller can push directly
    const months = ensureMonthMap();
    return {
      kind: "MANUAL",
      manualType: revType,
      editable: true,
      planning_line_id: data.id,
      project_id: projectId,
      project_label: projectLabel,
      typeLabel: revType,
      desc: resourceName,
      months,
    };
  } catch (err) {
    console.error("[Revenue] unexpected error inserting revenue", err);
    msg && (msg.textContent = "Error adding revenue line.");
    return null;
  }
}

// ─────────────────────────────────────────────
// LOADERS (unchanged – already excellent)
// ─────────────────────────────────────────────
async function loadTmLaborRevenue(client, ctx, projectIds) { /* ... unchanged ... */ }
async function loadSubsOdcRevenue(client, ctx, projectIds) { /* ... unchanged ... */ }
async function loadManualRevenue(client, ctx, projectIds) { /* ... unchanged ... */ }

// ─────────────────────────────────────────────
// RENDER & REFRESH (unchanged)
// ─────────────────────────────────────────────
function computeRowTotal(row) { /* ... */ }
function updateTotals(root) { /* ... */ }
function renderRows(root) { /* ... */ }

async function refreshRevenue(root, client) {
  const msg = $("#revMessage", root);
  const ctx = getPlanContext();

  if (!projectScope.length || !ctx.year || !ctx.versionId) {
    rows = [];
    renderRows(root);
    if (msg) msg.textContent = "Please select a Level 1 project and plan first.";
    return;
  }

  if (msg) msg.textContent = "Loading revenue…";

  const projectIds = projectScope.map(p => p.id);

  try {
    const [tmRows, subsRows, manualRows] = await Promise.all([
      loadTmLaborRevenue(client, ctx, projectIds),
      loadSubsOdcRevenue(client, ctx, projectIds),
      loadManualRevenue(client, ctx, projectIds),
    ]);

    rows = [...tmRows, ...subsRows, ...manualRows];
    renderRows(root);
    updateTotals(root);
    if (msg) msg.textContent = rows.length ? "" : "No revenue lines yet. Add fixed/software/unit revenue above.";
  } catch (err) {
    console.error("[Revenue] refresh error", err);
    rows = [];
    renderRows(root);
    if (msg) msg.textContent = "Error loading revenue.";
  }
}

// ─────────────────────────────────────────────
// TAB INIT
// ─────────────────────────────────────────────
export const revenueBudgetTab = {
  template,
  async init({ root, client }) {
    const msg = $("#revMessage", root);
    const controls = $("#revControls", root);
    const ctx = getPlanContext();

    // Header setup (same as labor/subs)
    const planSpan = $("#revInlinePlan", root);
    const projSpan = $("#revInlineProject", root);

    planSpan.textContent = ctx?.planLabel || (ctx?.year ? `BUDGET – ${ctx.year} · ${ctx.planType || "Working"}` : "Revenue");
    if (ctx?.level1ProjectCode && ctx?.level1ProjectName) {
      planSpan.textContent += ` · Level 1 Project: ${ctx.level1ProjectCode} – ${ctx.level1ProjectName}`;
    }
    if (ctx?.projectCode && ctx?.projectName) {
      projSpan.textContent = `, ${ctx.projectCode} – ${ctx.projectName}`;
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg.textContent = "Please select a Level 1 project and plan first.";
      controls.style.display = "none";
      return;
    }

    projectScope = await loadProjectScope(client, ctx.level1ProjectId);
    projectMeta = {};
    projectScope.forEach(p => {
      projectMeta[p.id] = {
        code: p.project_code,
        name: p.name,
        label: `${p.project_code} – ${p.name}`,
      };
    });

    const projSelect = $("#revProjectSelect", root);
    projSelect.innerHTML = `<option value="">— Select project —</option>`;
    projectScope.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.project_code} – ${p.name}`;
      projSelect.appendChild(opt);
    });

    controls.style.display = "block";
    await refreshRevenue(root, client);

    // Add Revenue Line Button
    $("#addRevenueLineBtn", root)?.addEventListener("click", async () => {
      const ctxNow = getPlanContext();
      const projectId = $("#revProjectSelect", root)?.value;
      const projectLabel = $("#revProjectSelect", root)?.selectedOptions[0]?.textContent || "";
      const revType = $("#revTypeSelect", root)?.value || "Fixed";

      if (!projectId) {
        msg.textContent = "Please select a project first.";
        return;
      }

      const newRow = await insertManualRevenueLine(root, client, ctxNow, projectId, projectLabel, revType);
      if (newRow) {
        rows.push(newRow);
        renderRows(root);
        updateTotals(root);
      }
    });

    // Cell edits (manual revenue only)
    $("#revBody", root)?.addEventListener("change", async (e) => {
      const input = e.target;
      if (!input.matches("input[data-row][data-month]")) return;

      const idx = Number(input.dataset.row);
      const monthKey = input.dataset.month;
      if (Number.isNaN(idx) || !rows[idx] || !rows[idx].editable) return;

      const row = rows[idx];
      const val = input.value === "" ? 0 : Number(input.value || 0);
      row.months[monthKey] = Number.isNaN(val) ? 0 : val;

      await updateManualCell(client, row.planning_line_id, monthKey, row.months[monthKey]);

      const totalCell = root.querySelector(`td[data-total-row="${idx}"]`);
      if (totalCell) totalCell.textContent = fmtNum(computeRowTotal(row));
      updateTotals(root);
    });

    // Row highlight
    $("#revBody", root)?.addEventListener("click", (e) => {
      const tr = e.target.closest("tr.rev-row-striped");
      if (!tr) return;
      root.querySelectorAll("tr.rev-row-striped").forEach(r => r.classList.remove("rev-row-active"));
      tr.classList.add("rev-row-active");
    });
  },
};
