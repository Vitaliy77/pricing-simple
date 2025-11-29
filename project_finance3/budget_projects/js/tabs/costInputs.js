// js/tabs/costInputs.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Inputs (Editable)</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;color:#475569;">
      Enter <strong>hours</strong> for employees and <strong>cost</strong> for subcontractors and ODC
      for the selected project and plan.
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
      No cost input lines found for this project yet. Use the buttons above to add lines.
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

async function fetchLines(client, ctx) {
  const { projectId, year, versionId, planType } = ctx;

  const { data, error } = await client
    .from("planning_lines")
    .select(`
      id,
      entry_type,
      person_vendor,
      description,
      jan, feb, mar, apr, may, jun,
      jul, aug, sep, oct, nov, dec
    `)
    .eq("project_id", projectId)
    .eq("plan_year", year)
    .eq("plan_version_id", versionId)
    .eq("plan_type", planType || "Working")
    .in("entry_type", ["labor", "subs", "odc"])
    .order("entry_type", { ascending: true });

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

function renderLines(root, lines) {
  const tbody = $("#costInputsTbody", root);
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!lines.length) return;

  for (const line of lines) {
    const tr = document.createElement("tr");
    tr.dataset.lineId = line.id;
    tr.dataset.entryType = line.entry_type;

    const entryLabel =
      line.entry_type === "labor"
        ? "Labor (hrs)"
        : line.entry_type === "subs"
        ? "Subs ($)"
        : line.entry_type === "odc"
        ? "ODC ($)"
        : line.entry_type || "";

    tr.innerHTML = `
      <td class="sticky-col">${entryLabel}</td>
      <td class="sticky-col-2">
        <input
          class="cell-input"
          data-field="person_vendor"
          type="text"
          value="${line.person_vendor || ""}"
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
            step="0.1"
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

async function addNewLine(client, ctx, entryType) {
  const baseLine = {
    project_id: ctx.projectId,
    plan_year: ctx.year,
    plan_version_id: ctx.versionId,
    plan_type: ctx.planType || "Working",
    entry_type: entryType,
    person_vendor: "",
    description: "",
  };

  MONTH_KEYS.forEach((key) => {
    baseLine[key] = null;
  });

  const inserted = await upsertLine(client, baseLine);
  return inserted;
}

async function refresh(root, client, ctx) {
  const section = $("#costInputsSection", root);
  const emptyMsg = $("#costInputsEmpty", root);

  const lines = await fetchLines(client, ctx);

  if (!lines.length) {
    section.style.display = "block";
    emptyMsg.style.display = "block";
    renderLines(root, []);
    return;
  }

  section.style.display = "block";
  emptyMsg.style.display = "none";
  renderLines(root, lines);
}

// ---------- tab init/export ----------

export const costInputsTab = {
  template,
  async init({ root, client }) {
    const ctx = getPlanContext();
    const msgEl = $("#costInputsMessage", root);
    const labelEl = $("#costInputsProjectLabel", root);

    if (!ctx.projectId) {
      if (msgEl) {
        msgEl.textContent = "No project selected. Please go to the Projects tab.";
      }
      const section = $("#costInputsSection", root);
      const emptyMsg = $("#costInputsEmpty", root);
      if (section) section.style.display = "none";
      if (emptyMsg) emptyMsg.style.display = "none";
      return;
    }

    if (!ctx.year || !ctx.versionId) {
      if (msgEl) {
        msgEl.textContent =
          "Plan not fully selected. Please complete selection in the Projects tab.";
      }
      const section = $("#costInputsSection", root);
      const emptyMsg = $("#costInputsEmpty", root);
      if (section) section.style.display = "none";
      if (emptyMsg) emptyMsg.style.display = "none";
      return;
    }

    if (labelEl) {
      labelEl.textContent = `Editing cost inputs for project ${ctx.projectId} · ${ctx.year} · ${
        ctx.planType || "Working"
      }`;
    }

    if (msgEl) msgEl.textContent = "Loading cost inputs…";

    await refresh(root, client, ctx);

    if (msgEl) msgEl.textContent = "";

    // Button handlers
    $("#addLaborLineBtn", root).addEventListener("click", async () => {
      const line = await addNewLine(client, ctx, "labor");
      if (line) await refresh(root, client, ctx);
    });

    $("#addSubsLineBtn", root).addEventListener("click", async () => {
      const line = await addNewLine(client, ctx, "subs");
      if (line) await refresh(root, client, ctx);
    });

    $("#addOdcLineBtn", root).addEventListener("click", async () => {
      const line = await addNewLine(client, ctx, "odc");
      if (line) await refresh(root, client, ctx);
    });

    // Event delegation for grid edits
    $("#costInputsTbody", root).addEventListener("change", async (evt) => {
      const input = evt.target;
      if (!input.classList.contains("cell-input")) return;

      const tr = input.closest("tr");
      const lineId = tr?.dataset.lineId;
      const field = input.dataset.field;

      if (!lineId || !field) return;

      const value = input.value;

      if (field === "person_vendor" || field === "description") {
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
