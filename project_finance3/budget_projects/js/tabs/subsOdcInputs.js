// js/tabs/subsOdcInputs.js
import { $, h } from "../lib/dom.js";
import { getSelectedProjectId, getPlanContext } from "../lib/projectContext.js";

const MONTH_COLS = [
  "amt_jan","amt_feb","amt_mar","amt_apr","amt_may","amt_jun",
  "amt_jul","amt_aug","amt_sep","amt_oct","amt_nov","amt_dec",
];

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Subs &amp; ODC Costs</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;color:#475569;">
      Enter <strong>dollar costs</strong> per month for subcontractors and other direct costs (ODC)
      for the selected project and plan.
    </p>

    <p id="subsOdcMessage"
       style="min-height:1.25rem;font-size:0.85rem;color:#64748b;margin-bottom:0.5rem;"></p>

    <p id="subsOdcProjectLabel"
       style="font-size:0.85rem;color:#0f172a;margin-bottom:0.75rem;"></p>

    <section id="subsOdcSection" style="display:none;">
      <div style="margin-bottom:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button id="addSubsLineBtn" class="btn-primary">+ Add Subs Line</button>
        <button id="addOdcLineBtn" class="btn-secondary">+ Add ODC Line</button>
      </div>

      <div class="full-width-card">
        <div class="cost-table-wrapper">
          <table class="cost-table">
            <thead>
              <tr>
                <th class="sticky-col">Type</th>
                <th class="sticky-col-2">Vendor / Label</th>
                <th class="sticky-col-3">Description</th>
                ${MONTH_LABELS.map(m => `<th>${m}</th>`).join("")}
                <th>Total $</th>
              </tr>
            </thead>
            <tbody id="subsOdcTbody">
              <tr>
                <td colspan="16" style="text-align:left;font-size:0.9rem;color:#64748b;">
                  Loading…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </article>
`;

let entryTypeIdByCode = null; // { SUBC_COST: uuid, ODC_COST: uuid }

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  if (Number.isNaN(num)) return "";
  return num.toString();
}

function computeTotal(line) {
  return MONTH_COLS.reduce((sum, key) => {
    const val = Number(line[key] || 0);
    return sum + (Number.isNaN(val) ? 0 : val);
  }, 0);
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

async function fetchSubsOdcLines(client, projectId, ctx) {
  let query = client
    .from("planning_lines")
    .select(`
      id,
      project_id,
      resource_name,
      description,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
      is_revenue,
      entry_types ( code, display_name )
    `)
    .eq("project_id", projectId)
    .eq("is_revenue", false);

  if (ctx.year) query = query.eq("plan_year", ctx.year);
  if (ctx.versionId) query = query.eq("plan_version_id", ctx.versionId);
  if (ctx.planType) query = query.eq("plan_type", ctx.planType);

  const { data, error } = await query;
  if (error) {
    console.error("[subsOdc] fetchLines error", error);
    return [];
  }

  // keep only SUBC_COST / ODC_COST
  return (data || []).filter((r) => {
    const code = r.entry_types?.code;
    return code === "SUBC_COST" || code === "ODC_COST";
  });
}

function getTypeLabel(line) {
  const code = line.entry_types?.code;
  if (code === "SUBC_COST") return "Subs";
  if (code === "ODC_COST") return "ODC";
  return line.entry_types?.display_name || "Cost";
}

function renderLines(root, lines) {
  const tbody = $("#subsOdcTbody", root);
  if (!tbody) return;

  if (!lines.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16" style="text-align:left;font-size:0.9rem;color:#64748b;">
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

    const typeLabel = getTypeLabel(line);
    const total = computeTotal(line);

    const monthCells = MONTH_COLS
      .map(
        (key) => `
        <td>
          <input
            class="cell-input cell-input-num"
            data-row="${idx}"
            data-field="${key}"
            type="number"
            step="0.01"
            value="${fmtNum(line[key])}"
          />
        </td>
      `
      )
      .join("");

    tr.innerHTML = `
      <td class="sticky-col">${typeLabel}</td>
      <td class="sticky-col-2">
        <input
          class="cell-input"
          data-row="${idx}"
          data-field="resource_name"
          type="text"
          value="${line.resource_name || ""}"
        />
      </td>
      <td class="sticky-col-3">
        <input
          class="cell-input"
          data-row="${idx}"
          data-field="description"
          type="text"
          value="${line.description || ""}"
        />
      </td>
      ${monthCells}
      <td class="text-right text-xs text-slate-600" data-total-row="${idx}">
        ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function addNewSubsOdcLine(client, projectId, ctx, typeCode) {
  await ensureEntryTypeIds(client);
  const entryTypeId = entryTypeIdByCode?.[typeCode];
  if (!entryTypeId) {
    console.error("[subsOdc] missing entry_type_id for", typeCode);
    return null;
  }

  const payload = {
    project_id: projectId,
    project_name: "", // optional; can be populated via trigger
    entry_type_id: entryTypeId,
    is_revenue: false,
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

async function updateCell(client, lineId, field, value) {
  const patch = {};
  patch[field] = value === "" ? 0 : Number(value);

  const { error } = await client
    .from("planning_lines")
    .update(patch)
    .eq("id", lineId);

  if (error) {
    console.error("[subsOdc] updateCell error", error);
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

export const subsOdcInputsTab = {
  template,
  async init({ root, client }) {
    const msgEl = $("#subsOdcMessage", root);
    const labelEl = $("#subsOdcProjectLabel", root);
    const sectionEl = $("#subsOdcSection", root);
    const tbody = $("#subsOdcTbody", root);

    const projectId = getSelectedProjectId();
    const ctx = getPlanContext();

    if (!projectId) {
      if (msgEl) msgEl.textContent = "No project selected. Please go to the Projects tab.";
      if (sectionEl) sectionEl.style.display = "none";
      return;
    }
    if (!ctx.year || !ctx.versionId) {
      if (msgEl) {
        msgEl.textContent =
          "Plan not fully selected. Please complete selection in the Projects tab.";
      }
      if (sectionEl) sectionEl.style.display = "none";
      return;
    }

    if (labelEl) {
      labelEl.textContent = `Subs & ODC for project ${projectId} · ${ctx.year} · ${
        ctx.planType || "Working"
      }`;
    }

    if (msgEl) msgEl.textContent = "Loading subs & ODC costs…";

    let lines = await fetchSubsOdcLines(client, projectId, ctx);

    if (sectionEl) sectionEl.style.display = "block";
    renderLines(root, lines);
    if (msgEl) msgEl.textContent = "";

    // Add line buttons
    $("#addSubsLineBtn", root).addEventListener("click", async () => {
      const newLine = await addNewSubsOdcLine(client, projectId, ctx, "SUBC_COST");
      if (newLine) {
        lines.push(newLine);
        renderLines(root, lines);
      }
    });

    $("#addOdcLineBtn", root).addEventListener("click", async () => {
      const newLine = await addNewSubsOdcLine(client, projectId, ctx, "ODC_COST");
      if (newLine) {
        lines.push(newLine);
        renderLines(root, lines);
      }
    });

    // Delegated change handling
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
        // numeric
        line[field] = newVal === "" ? 0 : Number(newVal);
        await updateCell(client, lineId, field, newVal);

        // recompute total
        const totalCell = root.querySelector(`[data-total-row="${rowIdx}"]`);
        if (totalCell) {
          totalCell.textContent = computeTotal(line).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          });
        }
      } else if (field === "resource_name" || field === "description") {
        line[field] = newVal;
        await updateTextField(client, lineId, field, newVal);
      }
    });
  },
};
