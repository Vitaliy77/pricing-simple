// js/tabs/costInputs.js
import { $, h } from "../lib/dom.js";
import { getSelectedProjectId, getPlanContext } from "../lib/projectContext.js";

const MONTH_KEYS = [
  "amt_jan", "amt_feb", "amt_mar", "amt_apr", "amt_may", "amt_jun",
  "amt_jul", "amt_aug", "amt_sep", "amt_oct", "amt_nov", "amt_dec",
];

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

// cache for entry_type_id lookups
let entryTypeIdByCode = null;

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Inputs (Editable)</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;color:#475569;">
      Enter <strong>amounts</strong> for direct labor, subcontractors, and ODC
      for all projects under the selected level 1 code.
    </p>

    <p id="costInputsMessage"
       style="min-height:1.25rem;font-size:0.85rem;color:#64748b;margin-bottom:0.5rem;"></p>

    <p id="costInputsProjectLabel"
       style="font-size:0.85rem;color:#0f172a;margin-bottom:0.75rem;"></p>

    <section id="costInputsSection" style="display:none;">
      <div style="margin-bottom:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button id="addLaborLineBtn" class="btn-primary">+ Add Labor Line</button>
        <button id="addSubsLineBtn" class="btn-secondary">+ Add Subs Line</button>
        <button id="addOdcLineBtn" class="btn-secondary">+ Add ODC Line</button>
      </div>

      <div class="full-width-card">
        <div class="cost-table-wrapper">
          <table class="cost-table">
            <thead>
              <tr>
                <th class="sticky-col">Entry Type</th>
                <th class="sticky-col-2">Person / Vendor</th>
                <th class="sticky-col-3">Description</th>
                ${MONTH_LABELS.map(m => `<th>${m}</th>`).join("")}
                <th>Total</th>
              </tr>
            </thead>
            <tbody id="costInputsTbody">
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

    <p id="costInputsEmpty"
       style="font-size:0.85rem;color:#666;margin-top:0.75rem;display:none;">
      No cost input lines found for this project group yet. Use the buttons above to add lines.
    </p>
  </article>
`;

// ---------- helpers ----------

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  if (Number.isNaN(num)) return "";
  return num.toString();
}

function computeRowTotal(line) {
  return MONTH_KEYS.reduce((sum, key) => {
    const val = Number(line[key] || 0);
    return sum + (Number.isNaN(val) ? 0 : val);
  }, 0);
}

/**
 * Given the selected level-1 project id, find:
 *  - its project_code (e.g. P000001.)
 *  - a prefix (P000001.)
 *  - all child project ids where project_code starts with that prefix
 */
async function getProjectScope(client, rootProjectId) {
  const { data: root, error: rootErr } = await client
    .from("projects")
    .select("project_code, name")
    .eq("id", rootProjectId)
    .single();

  if (rootErr || !root) {
    console.error("[costInputs] getProjectScope root error", rootErr);
    return { ids: [rootProjectId], label: "Selected project", count: 1 };
  }

  const fullCode = root.project_code || "";
  const base = fullCode.split(".")[0] || fullCode; // "P000001"
  const prefix = base.endsWith(".") ? base : `${base}.`; // "P000001."

  const { data: children, error: childErr } = await client
    .from("projects")
    .select("id, project_code, name")
    .ilike("project_code", `${prefix}%`)
    .order("project_code", { ascending: true });

  if (childErr || !children?.length) {
    console.error("[costInputs] getProjectScope children error", childErr);
    return {
      ids: [rootProjectId],
      label: `${fullCode} (no children found)`,
      count: 1,
    };
  }

  const ids = children.map((p) => p.id);
  const label = `${prefix}* (${children.length} projects)`;
  return { ids, label, count: children.length };
}

/**
 * Ensure we know the entry_type_id for DIR_LAB_COST, SUBC_COST, ODC_COST
 */
async function ensureEntryTypeIds(client) {
  if (entryTypeIdByCode) return entryTypeIdByCode;

  const { data, error } = await client
    .from("entry_types")
    .select("id, code");

  if (error) {
    console.error("[costInputs] entry_types lookup error", error);
    entryTypeIdByCode = {};
    return entryTypeIdByCode;
  }

  entryTypeIdByCode = {};
  (data || []).forEach((row) => {
    entryTypeIdByCode[row.code] = row.id;
  });
  return entryTypeIdByCode;
}

async function fetchLines(client, projectIds, ctx) {
  if (!projectIds?.length) return [];

  let query = client
    .from("planning_lines")
    .select(`
      id,
      project_id,
      entry_type_id,
      is_revenue,
      resource_name,
      description,
      amt_jan, amt_feb, amt_mar, amt_apr, amt_may, amt_jun,
      amt_jul, amt_aug, amt_sep, amt_oct, amt_nov, amt_dec,
      entry_types ( code, display_name )
    `)
    .in("project_id", projectIds)
    .eq("is_revenue", false) // costs only
    .order("project_id", { ascending: true })
    .order("entry_type_id", { ascending: true });

  if (ctx?.year) {
    query = query.eq("plan_year", ctx.year);
  }
  if (ctx?.versionId) {
    query = query.eq("plan_version_id", ctx.versionId);
  }
  if (ctx?.planType) {
    query = query.eq("plan_type", ctx.planType);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[costInputs] fetchLines error", error);
    return [];
  }
  return data || [];
}

async function upsertLine(client, line) {
  const { data, error } = await client
    .from("planning_lines")
    .upsert(line, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("[costInputs] upsertLine error", error);
    return null;
  }
  return data;
}

async function updateCell(client, lineId, field, value) {
  const patch = {};
  patch[field] = value === "" ? null : Number(value);

  const { error } = await client
    .from("planning_lines")
    .update(patch)
    .eq("id", lineId);

  if (error) {
    console.error("[costInputs] updateCell error", error);
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
    console.error("[costInputs] updateTextField error", error);
  }
}

function getEntryLabel(line) {
  const et = line.entry_types || {};
  const code = et.code;

  if (code === "DIR_LAB_COST") return "Labor (dir)";
  if (code === "SUBC_COST") return "Subs";
  if (code === "ODC_COST") return "ODC";

  // fallback to whatever we have
  return et.display_name || code || "Cost";
}

function renderLines(root, lines) {
  const tbody = $("#costInputsTbody", root);
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!lines.length) return;

  for (const line of lines) {
    const tr = document.createElement("tr");
    tr.dataset.lineId = line.id;

    const entryLabel = getEntryLabel(line);
    const who = line.resource_name || "";

    tr.innerHTML = `
      <td class="sticky-col">${entryLabel}</td>
      <td class="sticky-col-2">
        <input
          class="cell-input"
          data-field="resource_name"
          type="text"
          value="${who}"
        />
      </td>
      <td class="sticky-col-3">
        <input
          class="cell-input"
          data-field="description"
          type="text"
          value="${line.description || ""}"
        />
      </td>
      ${MONTH_KEYS
        .map(
          (key) => `
        <td>
          <input
            class="cell-input cell-input-num"
            data-field="${key}"
            type="number"
            step="0.01"
            value="${fmtNum(line[key])}"
          />
        </td>
      `
        )
        .join("")}
      <td class="text-right text-xs text-slate-600">
        ${computeRowTotal(line).toLocaleString()}
      </td>
    `;

    tbody.appendChild(tr);
  }
}

async function addNewLine(client, rootProjectId, ctx, entryTypeCode) {
  await ensureEntryTypeIds(client);
  const entryTypeId = entryTypeIdByCode?.[entryTypeCode];

  if (!entryTypeId) {
    console.error("[costInputs] no entry_type_id for code", entryTypeCode);
    return null;
  }

  const baseLine = {
    project_id: rootProjectId,
    project_name: "", // optional; you can fill via a trigger or join on display
    entry_type_id: entryTypeId,
    is_revenue: false,
    resource_name: "",
    description: "",
  };

  if (ctx?.year) baseLine.plan_year = ctx.year;
  if (ctx?.versionId) baseLine.plan_version_id = ctx.versionId;
  if (ctx?.planType) baseLine.plan_type = ctx.planType;

  MONTH_KEYS.forEach((key) => {
    baseLine[key] = 0;
  });

  const inserted = await upsertLine(client, baseLine);
  return inserted;
}

async function refresh(root, client, projectIds, ctx) {
  const section = $("#costInputsSection", root);
  const emptyMsg = $("#costInputsEmpty", root);

  const lines = await fetchLines(client, projectIds, ctx);

  if (!lines.length) {
    if (section) section.style.display = "block";
    if (emptyMsg) emptyMsg.style.display = "block";
    renderLines(root, []);
    return;
  }

  if (section) section.style.display = "block";
  if (emptyMsg) emptyMsg.style.display = "none";
  renderLines(root, lines);
}

// ---------- tab init/export ----------

export const costInputsTab = {
  template,
  async init({ root, client }) {
    const rootProjectId = getSelectedProjectId();
    const ctx = getPlanContext();
    const msgEl = $("#costInputsMessage", root);
    const labelEl = $("#costInputsProjectLabel", root);

    if (!rootProjectId) {
      if (msgEl) {
        msgEl.textContent = "No project selected. Please go to the Projects tab.";
      }
      const section = $("#costInputsSection", root);
      const emptyMsg = $("#costInputsEmpty", root);
      if (section) section.style.display = "none";
      if (emptyMsg) emptyMsg.style.display = "none";
      return;
    }

    if (msgEl) msgEl.textContent = "Loading cost inputs…";

    // Determine the full scope under the level 1 project
    const scope = await getProjectScope(client, rootProjectId);

    if (labelEl) {
      const planBits =
        ctx?.year && ctx?.versionId
          ? ` · ${ctx.year} · ${ctx.planType || "Working"}`
          : "";
      labelEl.textContent = `Editing cost inputs for ${scope.label}${planBits}`;
    }

    await refresh(root, client, scope.ids, ctx);

    if (msgEl) msgEl.textContent = "";

    // Button handlers: create new lines on the root (level 1) project
    $("#addLaborLineBtn", root).addEventListener("click", async () => {
      const line = await addNewLine(client, rootProjectId, ctx, "DIR_LAB_COST");
      if (line) await refresh(root, client, scope.ids, ctx);
    });

    $("#addSubsLineBtn", root).addEventListener("click", async () => {
      const line = await addNewLine(client, rootProjectId, ctx, "SUBC_COST");
      if (line) await refresh(root, client, scope.ids, ctx);
    });

    $("#addOdcLineBtn", root).addEventListener("click", async () => {
      const line = await addNewLine(client, rootProjectId, ctx, "ODC_COST");
      if (line) await refresh(root, client, scope.ids, ctx);
    });

    // Event delegation for edits
    $("#costInputsTbody", root).addEventListener("change", async (evt) => {
      const input = evt.target;
      if (!input.classList.contains("cell-input")) return;

      const tr = input.closest("tr");
      const lineId = tr?.dataset.lineId;
      const field = input.dataset.field;

      if (!lineId || !field) return;

      const value = input.value;

      if (field === "resource_name" || field === "description") {
        await updateTextField(client, lineId, field, value);
      } else {
        await updateCell(client, lineId, field, value);

        // recompute total
        const tds = tr.querySelectorAll("td");
        const numericInputs = tr.querySelectorAll("input.cell-input-num");
        let sum = 0;
        numericInputs.forEach((inp) => {
          const v = Number(inp.value || 0);
          if (!Number.isNaN(v)) sum += v;
        });
        const totalCell = tds[tds.length - 1];
        totalCell.textContent = sum.toLocaleString();
      }
    });
  },
};
