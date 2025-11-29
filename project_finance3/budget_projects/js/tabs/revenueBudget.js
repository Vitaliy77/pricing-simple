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
let rows = []; // unified revenue rows

// Row shape:
// {
//   kind: "TM_LABOR" | "SUBS_ODC" | "MANUAL",
//   manualType?: "Fixed" | "Software" | "Unit",
//   editable: boolean,
//   project_id,
//   project_label,
//   typeLabel,
//   desc,
//   planning_line_id?: string,
//   months: { [key: string]: number }
// }

const _revEntryTypeCache = {};

// ─────────────────────────────────────────────
// TEMPLATE
// ─────────────────────────────────────────────
export const template = /*html*/ `
  <article class="full-width-card w-full">
    <style>
      .rev-table {
        border-collapse: collapse;
        width: max-content;
        min-width: 100%;
      }
      .rev-table th,
      .rev-table td {
        padding: 2px 4px;
        white-space: nowrap;
        box-sizing: border-box;
      }

      .rev-cell-input {
        min-width: 5.2rem;
        text-align: left;
        color: #0f172a !important;
        background-color: #ffffff !important;
        height: 1.5rem;
        line-height: 1.5rem;
      }

      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .no-spin { -moz-appearance: textfield; }

      .rev-col-project { width: 11rem; }
      .rev-col-type    { width: 8rem; }
      .rev-col-desc    { width: 18rem; }

      /* Sticky columns – explicit backgrounds so nothing "shows through" */
      .rev-sticky-1,
      .rev-sticky-2,
      .rev-sticky-3 {
        position: sticky;
        z-index: 25;
        background-color: #ffffff;
      }
      .rev-sticky-1 { left: 0; }
      .rev-sticky-2 { left: 11rem; }
      .rev-sticky-3 { left: 19rem; }

      .rev-table thead th.rev-sticky-1,
      .rev-table thead th.rev-sticky-2,
      .rev-table thead th.rev-sticky-3 {
        background-color: #f8fafc;
        z-index: 30;
      }

      .rev-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .rev-row-striped:nth-child(even) { background-color: #ffffff; }
      .rev-row-striped:hover           { background-color: #dbeafe; }
      .rev-row-active                  { background-color: #bfdbfe !important; }

      .rev-summary-row {
        background-color: #e5e7eb;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 20;
      }
    </style>

    <!-- Header -->
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

    <!-- Controls -->
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
              <th class="rev-sticky-1 rev-col-project sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Project
              </th>
              <th class="rev-sticky-2 rev-col-type sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Type
              </th>
              <th class="rev-sticky-3 rev-col-desc sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Description
              </th>
              ${MONTHS.map(m => `
                <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                  ${m.label}
                </th>
              `).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Total $
              </th>
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
  return Number.isNaN(n)
    ? ""
    : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
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
// PROJECT SCOPE (Level 1 + children)
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
// T&M LABOR REVENUE: labor_hours × employees.hourly_cost
// ─────────────────────────────────────────────
async function loadTmLaborRevenue(client, ctx, projectIds) {
  if (!projectIds.length) return [];

  const { data: hours, error: hErr } = await client
    .from("labor_hours")
    .select("project_id, employee_id, ym, hours")
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working");

  if (hErr) {
    console.error("[Revenue] labor_hours error", hErr);
    return [];
  }
  if (!hours || !hours.length) return [];

  const employeeIds = Array.from(new Set(hours.map(r => r.employee_id).filter(Boolean)));

  const empMap = new Map();
  if (employeeIds.length) {
    const { data: emps, error: eErr } = await client
      .from("employees")
      .select("id, full_name, department_name, hourly_cost");

    if (eErr) {
      console.error("[Revenue] employees error", eErr);
    } else {
      (emps || []).forEach(e => empMap.set(e.id, e));
    }
  }

  const byProj = new Map();

  for (const row of hours) {
    const projMeta = projectMeta[row.project_id];
    if (!projMeta) continue;

    const emp = empMap.get(row.employee_id);
    const rate = emp?.hourly_cost || 0; // later you can swap to billing_rate
    const hrs = Number(row.hours || 0);
    const amount = hrs * rate;

    const mKey = dateToMonthKey(row.ym);
    if (!mKey) continue;

    if (!byProj.has(row.project_id)) {
      byProj.set(row.project_id, {
        kind: "TM_LABOR",
        editable: false,
        project_id: row.project_id,
        project_label: projMeta.label,
        typeLabel: "T&M Labor",
        desc: "Labor revenue (hours × rates)",
        months: ensureMonthMap(),
      });
    }

    const rec = byProj.get(row.project_id);
    rec.months[mKey] += amount;
  }

  return Array.from(byProj.values());
}

// ─────────────────────────────────────────────
// SUBS & ODC REVENUE (equals cost)
// ─────────────────────────────────────────────
async function loadSubsOdcRevenue(client, ctx, projectIds) {
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      project_id,
      project_name,
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
    console.error("[Revenue] subs/odc planning_lines error", error);
    return [];
  }
  if (!data || !data.length) return [];

  const byProj = new Map();

  for (const line of data) {
    const projMeta = projectMeta[line.project_id];
    const projectLabel = projMeta?.label || line.project_name || "(Project)";

    if (!byProj.has(line.project_id)) {
      byProj.set(line.project_id, {
        kind: "SUBS_ODC",
        editable: false,
        project_id: line.project_id,
        project_label: projectLabel,
        typeLabel: "Subs & ODC",
        desc: "Subs & ODC revenue (equals cost)",
        months: ensureMonthMap(),
      });
    }

    const rec = byProj.get(line.project_id);

    MONTHS.forEach(m => {
      const val = Number(line[m.col] || 0);
      if (!Number.isNaN(val)) rec.months[m.key] += val;
    });
  }

  return Array.from(byProj.values());
}

// ─────────────────────────────────────────────
// MANUAL REVENUE (Fixed / Software / Unit) – read existing
// ─────────────────────────────────────────────
async function loadManualRevenue(client, ctx, projectIds) {
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      id,
      project_id,
      project_name,
      resource_name,
      description,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
      is_revenue
    `)
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", true);

  if (error) {
    console.error("[Revenue] manual revenue planning_lines error", error);
    return [];
  }
  if (!data || !data.length) return [];

  return data.map(line => {
    const projMeta = projectMeta[line.project_id];
    const projectLabel = projMeta?.label || line.project_name || "(Project)";

    const baseName = (line.resource_name || "").toLowerCase();
    let manualType = "Fixed";
    if (baseName.includes("software")) manualType = "Software";
    else if (baseName.includes("unit")) manualType = "Unit";

    const months = ensureMonthMap();
    MONTHS.forEach(m => { months[m.key] = Number(line[m.col] || 0); });

    return {
      kind: "MANUAL",
      manualType,
      editable: true,
      planning_line_id: line.id,
      project_id: line.project_id,
      project_label: projectLabel,
      typeLabel: manualType,
      desc: line.description || line.resource_name || `${manualType} revenue`,
      months,
    };
  });
}

// ─────────────────────────────────────────────
// ENTRY TYPE FOR MANUAL REVENUE (best-effort)
// ─────────────────────────────────────────────
async function getRevenueEntryTypeId(client, typeLabel) {
  // Best guess: try more specific codes first, then a generic one.
  const codesToTry = [];
  if (typeLabel === "Fixed") codesToTry.push("REV_FIXED");
  if (typeLabel === "Software") codesToTry.push("REV_SOFTWARE");
  if (typeLabel === "Unit") codesToTry.push("REV_UNIT");
  codesToTry.push("REV_MANUAL");
  codesToTry.push("REVENUE");

  for (const code of codesToTry) {
    if (_revEntryTypeCache[code]) return _revEntryTypeCache[code];

    const { data, error } = await client
      .from("entry_types")
      .select("id")
      .eq("code", code);

    if (error) {
      console.warn("[Revenue] entry_types lookup error for code", code, error);
      continue;
    }

    if (data && data.length) {
      _revEntryTypeCache[code] = data[0].id;
      return data[0].id;
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// DB UPDATE HELPERS FOR MANUAL REVENUE
// ─────────────────────────────────────────────
async function updateManualCell(client, lineId, monthKey, value) {
  const m = MONTHS.find(x => x.key === monthKey);
  if (!m) return;

  const payload = {
    [m.col]: value === "" ? 0 : Number(value),
  };

  const { error } = await client
    .from("planning_lines")
    .update(payload)
    .eq("id", lineId);

  if (error) console.error("[Revenue] update cell error", error);
}

async function insertManualRevenueLine(client, ctx, projectId, typeLabel, msgEl) {
  const meta = projectMeta[projectId];
  if (!meta) {
    msgEl && (msgEl.textContent = "Cannot add revenue line: unknown project.");
    return null;
  }

  // Try to get an entry_type_id for revenue
  const entryTypeId = await getRevenueEntryTypeId(client, typeLabel);
  if (!entryTypeId) {
    console.error("[Revenue] No suitable entry_types code found for manual revenue.");
    msgEl && (msgEl.textContent =
      "Cannot add revenue line: no revenue entry type found in entry_types table (e.g., REV_MANUAL). Please add one or adjust the code.");
    return null;
  }

  const desc = `${typeLabel} revenue`;
  const resource_name = `${typeLabel} revenue`;

  const payload = {
    project_id: projectId,
    project_name: meta.name,
    entry_type_id: entryTypeId,
    is_revenue: true,
    resource_name,
    description: desc,
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
    plan_type: ctx.planType || "Working",
  };

  MONTHS.forEach(m => { payload[m.col] = 0; });

  const { data, error } = await client
    .from("planning_lines")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[Revenue] insert manual revenue error", error);
    msgEl && (msgEl.textContent =
      "Error adding revenue line. The planning_lines table may require additional fields; check constraints/NOT NULL columns.");
    return null;
  }

  const months = ensureMonthMap();

  return {
    kind: "MANUAL",
    manualType: typeLabel,
    editable: true,
    planning_line_id: data.id,
    project_id: projectId,
    project_label: meta.label,
    typeLabel,
    desc,
    months,
  };
}

// ─────────────────────────────────────────────
// RENDER & TOTALS
// ─────────────────────────────────────────────
function computeRowTotal(row) {
  return Object.values(row.months || {}).reduce(
    (sum, v) => sum + (Number(v || 0) || 0),
    0
  );
}

function updateTotals(root) {
  const summaryRow = root.querySelector("tr[data-summary-row='rev']");
  if (!summaryRow || !rows.length) return;

  const monthTotals = {};
  MONTHS.forEach(m => { monthTotals[m.key] = 0; });
  let grand = 0;

  rows.forEach(row => {
    MONTHS.forEach(m => {
      const v = Number(row.months[m.key] || 0);
      if (!Number.isNaN(v)) {
        monthTotals[m.key] += v;
        grand += v;
      }
    });
  });

  MONTHS.forEach(m => {
    const cell = summaryRow.querySelector(`[data-total-col="${m.key}"]`);
    if (cell) cell.textContent = fmtNum(monthTotals[m.key]);
  });

  const gCell = summaryRow.querySelector('[data-total-col="all"]');
  if (gCell) gCell.textContent = fmtNum(grand);
}

function renderRows(root) {
  const tbody = $("#revBody", root);
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="17" class="text-center py-10 text-slate-500 text-xs">
          No revenue lines yet for this plan and project scope.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = idx;
    tr.className = "rev-row-striped";

    const total = computeRowTotal(row);

    const monthCells = MONTHS.map(m => {
      const val = row.months[m.key] || 0;

      if (row.editable) {
        return `
          <td>
            <input
              class="rev-input rev-cell-input no-spin border border-slate-200 rounded-sm px-1 py-0.5 text-[11px]"
              type="number"
              step="1"
              data-row="${idx}"
              data-month="${m.key}"
              value="${val === 0 ? "" : val}"
            />
          </td>
        `;
      } else {
        return `
          <td class="text-right text-[11px] px-2">
            ${fmtNum(val)}
          </td>
        `;
      }
    }).join("");

    tr.innerHTML = `
      <td class="rev-sticky-1 rev-col-project text-[11px] font-medium text-slate-900">
        ${row.project_label || ""}
      </td>
      <td class="rev-sticky-2 rev-col-type text-[11px] text-slate-800">
        ${row.typeLabel || ""}
      </td>
      <td class="rev-sticky-3 rev-col-desc text-[11px] text-slate-600">
        ${row.desc || ""}
      </td>
      ${monthCells}
      <td class="text-right text-[11px] font-semibold text-slate-900" data-total-row="${idx}">
        ${fmtNum(total)}
      </td>
    `;

    tbody.appendChild(tr);
  });

  const summaryTr = document.createElement("tr");
  summaryTr.dataset.summaryRow = "rev";
  summaryTr.className = "rev-summary-row";
  summaryTr.innerHTML = `
    <td class="rev-sticky-1 rev-col-project text-[11px] font-semibold text-slate-900">Totals</td>
    <td class="rev-sticky-2 rev-col-type"></td>
    <td class="rev-sticky-3 rev-col-desc"></td>
    ${MONTHS.map(m => `<td class="text-right text-[11px]" data-total-col="${m.key}"></td>`).join("")}
    <td class="text-right text-[11px] font-semibold" data-total-col="all"></td>
  `;
  tbody.appendChild(summaryTr);

  updateTotals(root);
}

// ─────────────────────────────────────────────
// REFRESH
// ─────────────────────────────────────────────
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
    if (msg) {
      msg.textContent = rows.length
        ? ""
        : "No revenue lines yet. You can add fixed/software/unit revenue above.";
    }
  } catch (err) {
    console.error("[Revenue] refreshRevenue error", err);
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

    // Header labels (same style as other tabs)
    const globalPlan =
      document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    const globalProject =
      document.querySelector("#currentProject")?.textContent?.trim() || "";

    const planSpan = $("#revInlinePlan", root);
    const projSpan = $("#revInlineProject", root);

    if (planSpan) {
      planSpan.textContent =
        globalPlan ||
        (ctx?.year ? `BUDGET – ${ctx.year} · ${ctx.planType || "Working"}` : "Revenue");
    }
    if (projSpan) {
      if (globalProject) {
        projSpan.textContent = `, ${globalProject}`;
      } else if (ctx?.level1ProjectCode && ctx?.level1ProjectName) {
        projSpan.textContent = ` · Level 1 Project: ${ctx.level1ProjectCode} – ${ctx.level1ProjectName}`;
      } else {
        projSpan.textContent = "";
      }
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      if (msg) msg.textContent = "Please select a Level 1 project and plan first.";
      controls.style.display = "none";
      return;
    }

    // Load project scope & meta
    projectScope = await loadProjectScope(client, ctx.level1ProjectId);
    projectMeta = {};
    projectScope.forEach(p => {
      projectMeta[p.id] = {
        code: p.project_code,
        name: p.name,
        label: `${p.project_code} – ${p.name}`,
      };
    });

    if (!projectScope.length) {
      if (msg) msg.textContent = "No projects found under this Level 1 project.";
      controls.style.display = "none";
      return;
    }

    // Populate project dropdown
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

    // Add manual revenue line
    $("#addRevenueLineBtn", root)?.addEventListener("click", async () => {
      const ctxNow = getPlanContext();
      const projectId = projSelect.value || null;
      const typeLabel = $("#revTypeSelect", root)?.value || "Fixed";

      if (!projectId) {
        msg && (msg.textContent = "Please pick a project to add a revenue line.");
        return;
      }

      const newRow = await insertManualRevenueLine(client, ctxNow, projectId, typeLabel, msg);
      if (!newRow) {
        // insert failed; message already set
        return;
      }

      rows.push(newRow);
      renderRows(root);
      msg && (msg.textContent = "");
    });

    // Input change for manual rows
    $("#revBody", root)?.addEventListener("change", async (e) => {
      const input = e.target;
      if (!input.classList.contains("rev-input")) return;

      const idx = Number(input.dataset.row);
      const monthKey = input.dataset.month;
      if (Number.isNaN(idx) || !monthKey || !rows[idx]) return;

      const row = rows[idx];
      if (!row.editable || row.kind !== "MANUAL" || !row.planning_line_id) {
        input.value = row.months[monthKey] || "";
        return;
      }

      const raw = input.value;
      const num = raw === "" ? 0 : Number(raw || 0);
      row.months[monthKey] = Number.isNaN(num) ? 0 : num;

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
