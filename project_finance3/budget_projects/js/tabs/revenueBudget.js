// js/tabs/revenueBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

// Month mapping
const MONTH_FIELDS = [
  { col: "amt_jan", idx: 0, label: "Jan" },
  { col: "amt_feb", idx: 1, label: "Feb" },
  { col: "amt_mar", idx: 2, label: "Mar" },
  { col: "amt_apr", idx: 3, label: "Apr" },
  { col: "amt_may", idx: 4, label: "May" },
  { col: "amt_jun", idx: 5, label: "Jun" },
  { col: "amt_jul", idx: 6, label: "Jul" },
  { col: "amt_aug", idx: 7, label: "Aug" },
  { col: "amt_sep", idx: 8, label: "Sep" },
  { col: "amt_oct", idx: 9, label: "Oct" },
  { col: "amt_nov", idx: 10, label: "Nov" },
  { col: "amt_dec", idx: 11, label: "Dec" },
];

let projectScope = [];
let projectMeta = {};

export const template = /*html*/`
  <article class="full-width-card">
    <style>
      .rev-table-wrapper {
        position: relative;
        width: 100%;
        max-height: 520px;
        overflow-y: auto;
        overflow-x: auto;
      }
      .rev-table {
        border-collapse: separate;
        border-spacing: 0;
        width: max-content;
        min-width: 100%;
      }
      .rev-table th,
      .rev-table td {
        padding: 2px 4px;
        white-space: nowrap;
        background-clip: padding-box;
      }
      .rev-sticky-1,
      .rev-sticky-2,
      .rev-sticky-3 {
        position: sticky;
        z-index: 40;
        background-color: #f8fafc;
      }
      .rev-sticky-1 { left: 0; }
      .rev-sticky-2 { left: 12rem; }
      .rev-sticky-3 { left: calc(12rem + 10rem); }
      .rev-col-project { width: 12rem; }
      .rev-col-type    { width: 10rem; }
      .rev-col-desc    { width: 18rem; }
      .rev-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .rev-row-striped:nth-child(even) { background-color: #ffffff; }
      .rev-row-striped:hover           { background-color: #dbeafe; }
      .rev-summary-row {
        background-color: #e5e7eb;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 30;
      }
      .rev-num-input {
        width: 5.2rem;
        text-align: right;
        border: 1px solid #cbd5f5;
        border-radius: 3px;
        padding: 0 4px;
        font-size: 11px;
        height: 1.4rem;
        background-color: #ffffff;
      }
    </style>

    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="revInlinePlan" class="font-medium"></span>
        <span id="revInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">· Revenue Budget</span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Revenue by project and type (T&M, Fixed, Software, Subs & ODC, etc.).
        </span>
      </div>
      <div id="revMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
      <div class="mt-1 flex flex-wrap items-end gap-3 text-xs">
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Project</span>
          <select id="revProjectSelect" class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select project —</option>
          </select>
        </label>
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Revenue Type</span>
          <select id="revTypeSelect" class="min-w-[160px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="FIXED">Fixed</option>
            <option value="SOFTWARE">Software</option>
            <option value="UNIT">Unit</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <button id="addRevLineBtn" class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Add Revenue Line
        </button>
      </div>
    </div>

    <div class="rev-table-wrapper">
      <table class="rev-table text-xs">
        <thead class="bg-slate-50">
          <tr>
            <th class="rev-sticky-1 rev-col-project sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Project</th>
            <th class="rev-sticky-2 rev-col-type sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Type</th>
            <th class="rev-sticky-3 rev-col-desc sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Description</th>
            ${MONTH_FIELDS.map(m => `<th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">${m.label}</th>`).join("")}
            <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Total</th>
          </tr>
        </thead>
        <tbody id="revBody" class="bg-white">
          <tr><td colspan="16" class="text-center py-10 text-slate-500 text-xs">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </article>
`;

// ─────────────────────────────────────────────
// TAB INIT
// ─────────────────────────────────────────────
export const revenueBudgetTab = {
  template,
  async init({ root, client }) {
    const msg = $("#revMessage", root);
    const ctx = getPlanContext();

    $("#revInlinePlan", root).textContent = document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    $("#revInlineProject", root).textContent = document.querySelector("#currentProject")?.textContent?.trim() ? `, ${document.querySelector("#currentProject").textContent.trim()}` : "";

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg && (msg.textContent = "Please select a Level 1 project and plan first.");
      renderRevenue(root, null);
      return;
    }

    await loadProjectsUnderLevel1(client, ctx.level1ProjectId);

    const projSelect = $("#revProjectSelect", root);
    projSelect.innerHTML = `<option value="">— Select project —</option>`;
    projectScope.forEach(p => {
      const opt = new Option(projectMeta[p.id]?.label || `${p.project_code} – ${p.name}`, p.id);
      projSelect.appendChild(opt);
    });

    $("#addRevLineBtn", root)?.addEventListener("click", () => insertManualRevenueLine(root, client, getPlanContext()));
    $("#revBody", root)?.addEventListener("change", e => handleRevenueChange(e, root, client));

    await refreshRevenue(root, client);
  },
};

// ─────────────────────────────────────────────
// PROJECT SCOPE + HELPERS
// ─────────────────────────────────────────────
async function loadProjectsUnderLevel1(client, level1ProjectId) {
  projectScope = [];
  projectMeta = {};

  const { data: parent } = await client.from("projects").select("id, project_code, name").eq("id", level1ProjectId).single();
  if (!parent) return console.error("[Revenue] Parent project not found");

  const { data: children } = await client.from("projects").select("id, project_code, name").like("project_code", `${parent.project_code}.%`).order("project_code");

  const all = [parent, ...(children || [])];
  projectScope = all;

  all.forEach(p => {
    projectMeta[p.id] = {
      project_code: p.project_code,
      name: p.name,
      label: `${p.project_code} – ${p.name}`
    };
  });
}

function ensureMonthFields(rec) {
  MONTH_FIELDS.forEach(({ col }) => {
    if (typeof rec[col] !== "number") rec[col] = 0;
  });
}

function addToMonthFromYm(rec, dateStr, amount) {
  if (!dateStr) return;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return;
  const mf = MONTH_FIELDS.find(m => m.idx === d.getUTCMonth());
  if (mf) rec[mf.col] += amount;
}

// ─────────────────────────────────────────────
// LOADERS — FULLY IMPLEMENTED
// ─────────────────────────────────────────────

// 1) T&M Revenue
async function loadTmRevenueRows(client, ctx) {
  const projectIds = projectScope.map(p => p.id);
  if (!projectIds.length) return [];

  const { data: hours, error: hErr } = await client
    .from("labor_hours")
    .select("project_id, employee_id, ym, hours")
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (hErr || !hours?.length) return [];

  const employeeIds = [...new Set(hours.map(r => r.employee_id).filter(Boolean))];
  const empMap = new Map();

  if (employeeIds.length) {
    const { data: emps } = await client
      .from("employees")
      .select("id, hourly_cost, labor_categories(billing_rate)")
      .in("id", employeeIds);

    (emps || []).forEach(e => {
      const rate = Number(e.labor_categories?.billing_rate || e.hourly_cost || 0);
      empMap.set(e.id, { billing_rate: rate });
    });
  }

  const byProject = new Map();

  for (const h of hours) {
    const proj = projectMeta[h.project_id];
    if (!proj) continue;

    const rate = empMap.get(h.employee_id)?.billing_rate || 0;
    const revenue = Number(h.hours || 0) * rate;

    const key = h.project_id;
    if (!byProject.has(key)) {
      byProject.set(key, {
        source: "TM",
        project_id: h.project_id,
        project_label: proj.label,
        type_label: "T&M Labor",
        description: "Hours × billing rates",
      });
      ensureMonthFields(byProject.get(key));
    }
    addToMonthFromYm(byProject.get(key), h.ym, revenue);
  }

  return Array.from(byProject.values());
}

// 2) Subs & ODC Revenue
async function loadSubsOdcRevenueRows(client, ctx) {
  const projectIds = projectScope.map(p => p.id);
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("planning_lines")
    .select("project_id, amt_*, entry_types(code)")
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", false);

  if (error || !data?.length) return [];

  const byProject = new Map();

  data.forEach(line => {
    if (!["SUBC_COST", "ODC_COST"].includes(line.entry_types?.code)) return;
    const proj = projectMeta[line.project_id];
    if (!proj) return;

    const key = line.project_id;
    if (!byProject.has(key)) {
      byProject.set(key, {
        source: "SUBS_ODC",
        project_id: line.project_id,
        project_label: proj.label,
        type_label: "Subs & ODC",
        description: "Revenue = cost",
      });
      ensureMonthFields(byProject.get(key));
    }

    const rec = byProject.get(key);
    MONTH_FIELDS.forEach(m => rec[m.col] += Number(line[m.col] || 0));
  });

  return Array.from(byProject.values());
}

// 3) Manual Revenue
async function loadManualRevenueRows(client, ctx) {
  const projectIds = projectScope.map(p => p.id);
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("planning_lines")
    .select("id, project_id, project_name, resource_name, description, amt_*, entry_types(code)")
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", true);

  if (error || !data?.length) return [];

  return data.map(line => {
    const proj = projectMeta[line.project_id];
    const code = line.entry_types?.code || "";
    const typeMap = {
      FIXED_REV: "Fixed Revenue",
      SOFT_REV: "Software Revenue",
      UNIT_REV: "Unit Revenue",
      OTHER_REV: "Other Revenue"
    };

    const rec = {
      source: "MANUAL",
      id: line.id,
      project_id: line.project_id,
      project_label: proj?.label || line.project_name || "",
      type_label: typeMap[code] || "Manual Revenue",
      description: line.description || line.resource_name || "",
    };
    ensureMonthFields(rec);
    MONTH_FIELDS.forEach(m => rec[m.col] = Number(line[m.col] || 0));
    return rec;
  });
}

// ─────────────────────────────────────────────
// SAFE REFRESH + RENDER
// ─────────────────────────────────────────────
async function refreshRevenue(root, client) {
  const msg = $("#revMessage", root);
  const ctx = getPlanContext();

  if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
    renderRevenue(root, null);
    msg && (msg.textContent = "Please select a Level 1 project and plan first.");
    return;
  }

  if (!projectScope.length) {
    renderRevenue(root, null);
    msg && (msg.textContent = "No projects under selected Level 1.");
    return;
  }

  msg && (msg.textContent = "Loading revenue…");

  try {
    const [
      tmRows = [],
      subsRows = [],
      manualRows = [],
    ] = await Promise.all([
      loadTmRevenueRows(client, ctx),
      loadSubsOdcRevenueRows(client, ctx),
      loadManualRevenueRows(client, ctx),
    ]);

    const allRows = [...tmRows, ...subsRows, ...manualRows];
    renderRevenue(root, allRows);
    msg && (msg.textContent = allRows.length ? "" : "No revenue found.");
  } catch (err) {
    console.error("[Revenue] Load failed", err);
    msg && (msg.textContent = "Error loading revenue.");
    renderRevenue(root, null);
  }
}

function renderRevenue(root, rows) {
  const tbody = $("#revBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="16" class="text-center py-10 text-slate-500 text-xs">No revenue lines found.</td></tr>`;
    return;
  }

  const fmt = v => typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  tbody.innerHTML = "";

  rows.forEach(r => {
    let total = 0;
    const monthCells = MONTH_FIELDS.map(mf => {
      const val = Number(r[mf.col] || 0);
      total += val;
      if (r.source === "MANUAL") {
        const display = val === 0 ? "" : val;
        return `<td class="text-right text-[11px] px-2 py-1"><input type="number" class="rev-num-input" data-id="${r.id}" data-field="${mf.col}" value="${display}"></td>`;
      }
      return `<td class="text-right text-[11px] px-2 py-1">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.className = "rev-row-striped";
    tr.innerHTML = `
      <td class="rev-sticky-1 rev-col-project text-[11px] font-medium text-slate-900">${r.project_label}</td>
      <td class="rev-sticky-2 rev-col-type text-[11px] text-slate-800">${r.type_label}</td>
      <td class="rev-sticky-3 rev-col-desc text-[11px] text-slate-600">${r.description}</td>
      ${monthCells}
      <td class="text-right text-[11px] font-bold text-slate-900 bg-slate-50 px-2 py-1">${fmt(total)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Summary Row
  const monthTotals = Object.fromEntries(MONTH_FIELDS.map(m => [m.col, 0]));
  let grandTotal = 0;

  rows.forEach(r => MONTH_FIELDS.forEach(m => {
    const v = Number(r[m.col] || 0);
    monthTotals[m.col] += v;
    grandTotal += v;
  }));

  const summary = document.createElement("tr");
  summary.className = "rev-summary-row";
  summary.innerHTML = `
    <td class="rev-sticky-1 rev-col-project text-[11px] font-semibold text-slate-900">Totals</td>
    <td class="rev-sticky-2 rev-col-type"></td>
    <td class="rev-sticky-3 rev-col-desc"></td>
    ${MONTH_FIELDS.map(m => `<td class="text-right text-[11px]">${fmt(monthTotals[m.col])}</td>`).join("")}
    <td class="text-right text-[11px] font-semibold">${fmt(grandTotal)}</td>
  `;
  tbody.appendChild(summary);
}

// ─────────────────────────────────────────────
// INSERT & UPDATE
// ─────────────────────────────────────────────
async function getEntryTypeIdForManual(client, revType) {
  const map = { FIXED: "FIXED_REV", SOFTWARE: "SOFT_REV", UNIT: "UNIT_REV", OTHER: "OTHER_REV" };
  const code = map[revType] || "OTHER_REV";
  const { data } = await client.from("entry_types").select("id").eq("code", code);
  return data?.[0]?.id || null;
}

async function insertManualRevenueLine(root, client, ctx) {
  const projSel = $("#revProjectSelect", root);
  const typeSel = $("#revTypeSelect", root);
  const projectId = projSel?.value;
  if (!projectId) return $("#revMessage", root).textContent = "Select a project first.";

  const entryTypeId = await getEntryTypeIdForManual(client, typeSel?.value || "FIXED");
  if (!entryTypeId) return $("#revMessage", root).textContent = "Revenue type not configured.";

  const payload = {
    project_id: projectId,
    is_revenue: true,
    entry_type_id: entryTypeId,
    resource_name: typeSel?.selectedOptions[0]?.text || "Manual Revenue",
    description: typeSel?.selectedOptions[0]?.text || "Manual Revenue",
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
    plan_type: ctx.planType || "Working",
    ...Object.fromEntries(MONTH_FIELDS.map(m => [m.col, 0]))
  };

  const { error } = await client.from("planning_lines").insert(payload);
  if (error) console.error(error);

  await refreshRevenue(root, client);
}

async function handleRevenueChange(e, root, client) {
  const input = e.target;
  if (!input.classList.contains("rev-num-input")) return;

  const id = input.dataset.id;
  const field = input.dataset.field;
  const val = input.value === "" ? 0 : Number(input.value);
  if (Number.isNaN(val)) return;

  await client.from("planning_lines").update({ [field]: val }).eq("id", id);
  await refreshRevenue(root, client);
}
