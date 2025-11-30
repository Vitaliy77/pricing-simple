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

export const template = /*html*/ `
  <article class="full-width-card">
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
      }

      .rev-sticky-1,
      .rev-sticky-2,
      .rev-sticky-3 {
        position: sticky;
        z-index: 30;
        background-color: #f8fafc; /* opaque so nothing "shines through" */
      }
      .rev-sticky-1 { left: 0; }
      .rev-sticky-2 { left: 12rem; }
      .rev-sticky-3 { left: 22rem; }

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
        z-index: 20;
      }

      .rev-num-input {
        width: 5.2rem;
        text-align: right;
        border: 1px solid #cbd5f5;
        border-radius: 3px;
        padding: 0 4px;
        font-size: 11px;
        height: 1.4rem;
      }
    </style>

    <!-- Header + controls -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="revInlinePlan" class="font-medium"></span>
        <span id="revInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Revenue Budget
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Revenue by project and type (T&amp;M, Fixed, Software, Subs &amp; ODC, etc.).
        </span>
      </div>

      <div id="revMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>

      <div class="mt-1 flex flex-wrap items-end gap-3 text-xs">
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Project</span>
          <select
            id="revProjectSelect"
            class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">— Select project —</option>
          </select>
        </label>

        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Revenue Type</span>
          <select
            id="revTypeSelect"
            class="min-w-[160px] px-2 py-1 border border-slate-300 rounded-md text-xs
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="FIXED">Fixed</option>
            <option value="SOFTWARE">Software</option>
            <option value="UNIT">Unit</option>
            <option value="OTHER">Other</option>
          </select>
        </label>

        <button
          id="addRevLineBtn"
          class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm
                 bg-blue-600 hover:bg-blue-700 text-white"
        >
          + Add Revenue Line
        </button>
      </div>
    </div>

    <!-- Table -->
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
            ${MONTH_FIELDS.map(
              m => `
                <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                  ${m.label}
                </th>`
            ).join("")}
            <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Total
            </th>
          </tr>
        </thead>
        <tbody id="revBody" class="bg-white">
          <tr>
            <td colspan="16" class="text-center py-10 text-slate-500 text-xs">
              Loading…
            </td>
          </tr>
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

    // Inline header
    const globalPlan =
      document.querySelector("#planContextHeader")?.textContent?.trim() || "";
    const globalProject =
      document.querySelector("#currentProject")?.textContent?.trim() || "";

    const planSpan = $("#revInlinePlan", root);
    const projSpan = $("#revInlineProject", root);

    if (planSpan) planSpan.textContent = globalPlan;
    if (projSpan) {
      projSpan.textContent = globalProject ? `, ${globalProject}` : "";
    }

    if (!ctx.level1ProjectId || !ctx.year || !ctx.versionId) {
      msg && (msg.textContent = "Please select a Level 1 project and plan first.");
      renderRevenue(root, null);
      return;
    }

    // Load project scope
    await loadProjectsUnderLevel1(client, ctx.level1ProjectId);

    const projSelect = $("#revProjectSelect", root);
    if (projSelect) {
      projSelect.innerHTML = `<option value="">— Select project —</option>`;
      projectScope.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = projectMeta[p.id]?.label || `${p.project_code} – ${p.name}`;
        projSelect.appendChild(opt);
      });
    }

    // Add revenue line
    $("#addRevLineBtn", root)?.addEventListener("click", async () => {
      const ctxNow = getPlanContext();
      await insertManualRevenueLine(root, client, ctxNow);
    });

    // Change handler for manual revenue inputs
    $("#revBody", root)?.addEventListener("change", (e) =>
      handleRevenueChange(e, root, client)
    );

    await refreshRevenue(root, client);
  },
};

// ─────────────────────────────────────────────
// PROJECT SCOPE
// ─────────────────────────────────────────────
async function loadProjectsUnderLevel1(client, level1ProjectId) {
  projectScope = [];
  projectMeta = {};

  const { data: parent, error: pErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("id", level1ProjectId)
    .single();

  if (pErr || !parent) {
    console.error("[Revenue] Error loading parent project", pErr);
    return;
  }

  const { data: children, error: cErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (cErr) {
    console.error("[Revenue] Error loading child projects", cErr);
  }

  const all = [parent, ...(children || [])];
  projectScope = all;

  all.forEach(p => {
    projectMeta[p.id] = {
      project_code: p.project_code,
      name: p.name,
      label: `${p.project_code} – ${p.name}`,
    };
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function ensureMonthFields(rec) {
  MONTH_FIELDS.forEach(({ col }) => {
    if (typeof rec[col] !== "number") rec[col] = 0;
  });
}

function addToMonthFromYm(rec, dateStr, amount) {
  if (!dateStr) return;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return;
  const monthIdx = d.getUTCMonth(); // 0–11
  const mf = MONTH_FIELDS.find(m => m.idx === monthIdx);
  if (!mf) return;
  rec[mf.col] += amount;
}

// ─────────────────────────────────────────────
// LOADERS
// ─────────────────────────────────────────────

// 1) T&M revenue = labor_hours × billing_rate (via labor_categories, fallback hourly_cost)
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

  if (hErr) {
    console.error("[Revenue] labor_hours error", hErr);
    return [];
  }
  if (!hours || !hours.length) return [];

  const employeeIds = Array.from(
    new Set(hours.map(r => r.employee_id).filter(Boolean))
  );

  const empMap = new Map();
  if (employeeIds.length) {
    const { data: emps, error: eErr } = await client
      .from("employees")
      .select("id, hourly_cost, labor_categories(billing_rate)")
      .in("id", employeeIds);

    if (eErr) {
      console.error("[Revenue] employees error", eErr);
    } else {
      (emps || []).forEach(e => {
        const billingRate = Number(e.labor_categories?.billing_rate || 0);
        empMap.set(e.id, {
          hourly_cost: Number(e.hourly_cost || 0),
          billing_rate: billingRate,
        });
      });
    }
  }

  const byProject = new Map();

  for (const row of hours) {
    const proj = projectMeta[row.project_id];
    if (!proj) continue;

    const emp = empMap.get(row.employee_id) || {};
    const hoursVal = Number(row.hours || 0);

    // EFFECTIVE BILLING RATE:
    // primary: billing_rate from labor_categories
    // fallback: hourly_cost if no billing_rate is defined
    const effectiveRate =
      (typeof emp.billing_rate === "number" && !Number.isNaN(emp.billing_rate) && emp.billing_rate > 0)
        ? emp.billing_rate
        : (emp.hourly_cost || 0);

    const revAmount = hoursVal * effectiveRate;

    const key = row.project_id;
    if (!byProject.has(key)) {
      const rec = {
        source: "TM",
        project_id: row.project_id,
        project_label: proj.label,
        type_label: "T&M Labor",
        description: "Hours × billing rates (labor category)",
      };
      ensureMonthFields(rec);
      byProject.set(key, rec);
    }

    const rec = byProject.get(key);
    addToMonthFromYm(rec, row.ym, revAmount);
  }

  return Array.from(byProject.values());
}

// 2) Subs & ODC revenue = Subs & ODC cost from planning_lines
async function loadSubsOdcRevenueRows(client, ctx) {
  const projectIds = projectScope.map(p => p.id);
  if (!projectIds.length) return [];

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      project_id,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
      entry_types ( code )
    `)
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", false);

  if (error) {
    console.error("[Revenue] subs/odc planning_lines error", error);
    return [];
  }
  if (!data || !data.length) return [];

  const byProject = new Map();

  data.forEach(line => {
    const etCode = line.entry_types?.code || "";
    if (etCode !== "SUBC_COST" && etCode !== "ODC_COST") return;

    const proj = projectMeta[line.project_id];
    if (!proj) return;

    const key = line.project_id;
    if (!byProject.has(key)) {
      const rec = {
        source: "SUBS_ODC",
        project_id: line.project_id,
        project_label: proj.label,
        type_label: "Subs & ODC",
        description: "Revenue equal to Subs & ODC cost",
      };
      ensureMonthFields(rec);
      byProject.set(key, rec);
    }

    const rec = byProject.get(key);
    MONTH_FIELDS.forEach(({ col }) => {
      rec[col] += Number(line[col] || 0);
    });
  });

  return Array.from(byProject.values());
}

// 3) Manual revenue lines (editable) from planning_lines
async function loadManualRevenueRows(client, ctx) {
  const projectIds = projectScope.map(p => p.id);
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
      entry_types ( code )
    `)
    .in("project_id", projectIds)
    .eq("plan_year", ctx.year)
    .eq("plan_version_id", ctx.versionId)
    .eq("plan_type", ctx.planType || "Working")
    .eq("is_revenue", true);

  if (error) {
    console.error("[Revenue] manual revenue load error", error);
    return [];
  }
  if (!data || !data.length) return [];

  return data.map(line => {
    const proj = projectMeta[line.project_id];
    const etCode = line.entry_types?.code || null;

    let typeLabel = "Manual Revenue";

    // Match to your schema codes:
    // FIXED_REV, SOFT_REV, UNIT_REV, OTHER_REV
    if (etCode === "FIXED_REV") typeLabel = "Fixed Revenue";
    else if (etCode === "SOFT_REV") typeLabel = "Software Revenue";
    else if (etCode === "UNIT_REV") typeLabel = "Unit Revenue";
    else if (etCode === "OTHER_REV") typeLabel = "Other Revenue";

    const rec = {
      source: "MANUAL",
      id: line.id,
      project_id: line.project_id,
      project_label: proj?.label || line.project_name || "",
      type_label: typeLabel,
      description: line.description || line.resource_name || "",
    };
    ensureMonthFields(rec);
    MONTH_FIELDS.forEach(({ col }) => {
      rec[col] = Number(line[col] || 0);
    });
    return rec;
  });
}

// ─────────────────────────────────────────────
// REFRESH + RENDER
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
    msg && (msg.textContent = "No projects under selected Level 1 project.");
    return;
  }

  msg && (msg.textContent = "Loading revenue…");

  try {
    const [tmRows, subsRows, manualRows] = await Promise.all([
      loadTmRevenueRows(client, ctx),
      loadSubsOdcRevenueRows(client, ctx),
      loadManualRevenueRows(client, ctx),
    ]);

    const allRows = [
      ...(tmRows || []),
      ...(subsRows || []),
      ...(manualRows || []),
    ];

    renderRevenue(root, allRows);
    msg && (msg.textContent = allRows.length ? "" : "No revenue found for this plan.");
  } catch (err) {
    console.error("[Revenue] refresh error", err);
    msg && (msg.textContent = "Error loading revenue.");
    renderRevenue(root, null);
  }
}

function renderRevenue(root, rows) {
  const tbody = $("#revBody", root);
  if (!tbody) return;

  if (!rows || !rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16" class="text-center py-10 text-slate-500 text-xs">
          No revenue lines found for this plan.
        </td>
      </tr>
    `;
    return;
  }

  const fmt = v =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "";

  tbody.innerHTML = "";

  // Detail rows
  rows.forEach(r => {
    let total = 0;

    const monthCells = MONTH_FIELDS.map(mf => {
      const val = Number(r[mf.col] || 0);
      total += val;

      if (r.source === "MANUAL") {
        const displayVal = val === 0 ? "" : val;
        return `
          <td class="text-right text-[11px] px-2 py-1">
            <input
              type="number"
              class="rev-num-input"
              data-id="${r.id}"
              data-field="${mf.col}"
              value="${displayVal}"
            />
          </td>
        `;
      }

      // Computed rows (T&M, Subs & ODC) are read-only
      return `<td class="text-right text-[11px] px-2 py-1">${fmt(val)}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.className = "rev-row-striped";
    tr.innerHTML = `
      <td class="rev-sticky-1 rev-col-project text-[11px] font-medium text-slate-900">
        ${r.project_label || ""}
      </td>
      <td class="rev-sticky-2 rev-col-type text-[11px] text-slate-800">
        ${r.type_label || ""}
      </td>
      <td class="rev-sticky-3 rev-col-desc text-[11px] text-slate-600">
        ${r.description || ""}
      </td>
      ${monthCells}
      <td class="text-right text-[11px] font-bold text-slate-900 bg-slate-50 px-2 py-1">
        ${fmt(total)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Summary row
  const summary = document.createElement("tr");
  summary.className = "rev-summary-row";
  let grand = 0;
  const monthTotals = {};
  MONTH_FIELDS.forEach(m => (monthTotals[m.col] = 0));

  rows.forEach(r => {
    MONTH_FIELDS.forEach(m => {
      const val = Number(r[m.col] || 0);
      if (!Number.isNaN(val)) {
        monthTotals[m.col] += val;
        grand += val;
      }
    });
  });

  summary.innerHTML = `
    <td class="rev-sticky-1 rev-col-project text-[11px] font-semibold text-slate-900">Totals</td>
    <td class="rev-sticky-2 rev-col-type"></td>
    <td class="rev-sticky-3 rev-col-desc"></td>
    ${MONTH_FIELDS
      .map(
        m => `<td class="text-right text-[11px]">${fmt(monthTotals[m.col])}</td>`
      )
      .join("")}
    <td class="text-right text-[11px] font-semibold">${fmt(grand)}</td>
  `;
  tbody.appendChild(summary);
}

// ─────────────────────────────────────────────
// MANUAL REVENUE INSERT & UPDATE
// ─────────────────────────────────────────────
async function getEntryTypeIdForManual(client, revType) {
  // Align with your actual entry_types codes:
  // FIXED_REV, SOFT_REV, UNIT_REV, OTHER_REV
  const candidatesByType = {
    FIXED: ["FIXED_REV"],
    SOFTWARE: ["SOFT_REV"],
    UNIT: ["UNIT_REV"],
    OTHER: ["OTHER_REV"],
  };

  // Fallback chain: specific → OTHER_REV
  let codes = candidatesByType[revType] || [];
  codes = [...codes, "OTHER_REV"];

  const { data, error } = await client
    .from("entry_types")
    .select("id, code")
    .in("code", codes);

  if (error) {
    console.error("[Revenue] entry_types lookup error", error);
    return null;
  }
  if (!data || !data.length) return null;
  return data[0].id;
}

async function insertManualRevenueLine(root, client, ctx) {
  const msg = $("#revMessage", root);
  const projSel = $("#revProjectSelect", root);
  const typeSel = $("#revTypeSelect", root);

  const projectId = projSel?.value || null;
  const revType = typeSel?.value || "FIXED";

  if (!projectId) {
    msg && (msg.textContent = "Please select a project first.");
    return;
  }

  const proj = projectMeta[projectId];
  const projectLabel = proj?.label || "";

  const entryTypeId = await getEntryTypeIdForManual(client, revType);
  if (!entryTypeId) {
    msg && (msg.textContent =
      "Cannot add revenue: matching entry_types code not found (expecting FIXED_REV, SOFT_REV, UNIT_REV or OTHER_REV).");
    return;
  }

  let resourceName = "Manual Revenue";
  if (revType === "FIXED") resourceName = "Fixed Revenue";
  else if (revType === "SOFTWARE") resourceName = "Software Revenue";
  else if (revType === "UNIT") resourceName = "Unit Revenue";
  else resourceName = "Other Revenue";

  const payload = {
    project_id: projectId,
    project_name: projectLabel,
    is_revenue: true,
    entry_type_id: entryTypeId,
    resource_name: resourceName,
    description: resourceName,
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
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

  try {
    const { error } = await client.from("planning_lines").insert(payload);
    if (error) {
      console.error("[Revenue] insert manual revenue error", error);
      msg && (msg.textContent = "Error adding revenue line. Check console.");
      return;
    }

    msg && (msg.textContent = "Revenue line added.");
    await refreshRevenue(root, client);
  } catch (err) {
    console.error("[Revenue] unexpected error inserting revenue", err);
    msg && (msg.textContent = "Error adding revenue line. Check console.");
  }
}

async function handleRevenueChange(e, root, client) {
  const input = e.target;
  if (!input.classList.contains("rev-num-input")) return;

  const id = input.dataset.id;
  const field = input.dataset.field;
  if (!id || !field) return;

  const raw = input.value;
  const val = raw === "" ? 0 : Number(raw);
  if (Number.isNaN(val)) return;

  try {
    const { error } = await client
      .from("planning_lines")
      .update({ [field]: val })
      .eq("id", id);

    if (error) {
      console.error("[Revenue] update manual amount error", error);
      const msg = $("#revMessage", root);
      msg && (msg.textContent = "Error updating revenue. Check console.");
      return;
    }

    const msg = $("#revMessage", root);
    msg && (msg.textContent = "Revenue updated.");
    await refreshRevenue(root, client);
  } catch (err) {
    console.error("[Revenue] unexpected error updating amount", err);
    const msg = $("#revMessage", root);
    msg && (msg.textContent = "Error updating revenue. Check console.");
  }
}
