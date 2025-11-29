// js/tabs/costInputs.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";
import { getSelectedProjectId } from "../lib/projectContext.js";

const MONTH_KEYS = [
  "jan_25", "feb_25", "mar_25", "apr_25", "may_25", "jun_25",
  "jul_25", "aug_25", "sep_25", "oct_25", "nov_25", "dec_25",
];

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Cost Inputs (Editable)</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;">
      Enter <strong>hours</strong> for employees and <strong>cost</strong> for subcontractors and ODC
      for the selected project. Labor lines are stored as hours; costs for subs and ODC are stored in dollars.
    </p>

    <p id="costInputsProjectLabel"
       style="font-size:0.85rem;color:#555;margin-bottom:0.75rem;"></p>

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
              <!-- filled dynamically -->
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

// Helper to format number safely
function fmt(v) {
  if (v === null || v === undefined || v === "") return "";
  const num = Number(v);
  if (Number.isNaN(num)) return "";
  return num.toString();
}

// Compute row total
function computeRowTotal(line) {
  return MONTH_KEYS.reduce((sum, key) => {
    const val = Number(line[key] || 0);
    return sum + (Number.isNaN(val) ? 0 : val);
  }, 0);
}

async function fetchLines(projectId) {
  // Adjust table/columns if your schema is different
  const { data, error } = await client
    .from("planning_lines")
    .select("*")
    .eq("project_id", projectId)
    .in("entry_type", ["labor", "subs", "odc"])
    .order("entry_type", { ascending: true });

  if (error) {
    console.error("[costInputs] fetchLines error", error);
    return [];
  }
  return data || [];
}

async function upsertLine(line) {
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

async function updateCell(lineId, field, value) {
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

async function updateTextField(lineId, field, value) {
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

function renderLines(lines) {
  const tbody = $("#costInputsTbody");
  tbody.innerHTML = "";

  if (!lines.length) return;

  for (const line of lines) {
    const tr = document.createElement("tr");
    tr.dataset.lineId = line.id;
    tr.dataset.entryType = line.entry_type;

    // Entry type label
    const entryLabel =
      line.entry_type === "labor"
        ? "Labor (hrs)"
        : line.entry_type === "subs"
        ? "Subs ($)"
        : line.entry_type === "odc"
        ? "ODC ($)"
        : line.entry_type;

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
            value="${fmt(line[key])}"
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

async function addNewLine(projectId, entryType) {
  const baseLine = {
    project_id: projectId,
    entry_type: entryType, // 'labor', 'subs', or 'odc'
    person_vendor: "",
    description: "",
  };

  for (const key of MONTH_KEYS) {
    baseLine[key] = null;
  }

  const inserted = await upsertLine(baseLine);
  return inserted;
}

async function refresh(projectId) {
  const lines = await fetchLines(projectId);

  const section = $("#costInputsSection");
  const emptyMsg = $("#costInputsEmpty");

  if (!lines.length) {
    section.style.display = "block";
    emptyMsg.style.display = "block";
    renderLines([]);
    return;
  }

  section.style.display = "block";
  emptyMsg.style.display = "none";
  renderLines(lines);
}

export async function init() {
  const projectId = getSelectedProjectId();
  const label = $("#costInputsProjectLabel");

  if (!projectId) {
    if (label) {
      label.textContent = "No project selected. Please go to the Projects tab.";
    }
    $("#costInputsSection").style.display = "none";
    $("#costInputsEmpty").style.display = "none";
    return;
  }

  label.textContent = `Editing cost inputs for project ${projectId}`;

  // Initial load
  await refresh(projectId);

  // Add line buttons
  $("#addLaborLineBtn").addEventListener("click", async () => {
    const line = await addNewLine(projectId, "labor");
    if (line) await refresh(projectId);
  });

  $("#addSubsLineBtn").addEventListener("click", async () => {
    const line = await addNewLine(projectId, "subs");
    if (line) await refresh(projectId);
  });

  $("#addOdcLineBtn").addEventListener("click", async () => {
    const line = await addNewLine(projectId, "odc");
    if (line) await refresh(projectId);
  });

  // Event delegation for inputs
  $("#costInputsTbody").addEventListener("change", async (evt) => {
    const input = evt.target;
    if (!input.classList.contains("cell-input")) return;

    const tr = input.closest("tr");
    const lineId = tr?.dataset.lineId;
    const field = input.dataset.field;

    if (!lineId || !field) return;

    const value = input.value;

    // Text vs numeric
    if (field === "person_vendor" || field === "description") {
      await updateTextField(lineId, field, value);
    } else {
      await updateCell(lineId, field, value);
      // After number change, recompute row total in-place
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
}
