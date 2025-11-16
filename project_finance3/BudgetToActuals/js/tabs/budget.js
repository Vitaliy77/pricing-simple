// js/tabs/budget.js
import { client } from "../api/supabase.js";
import { $ } from "../lib/dom.js";
import { getSelectedGrantId, setSelectedGrantId } from "../lib/grantContext.js";

export const template = /*html*/ `
  <article>
    <h3>Budget Builder</h3>

    <!-- Grant + Start Year -->
    <section style="max-width:820px;margin-bottom:0.5rem;">
      <div class="grid" style="gap:0.35rem;">
        <label>
          Grant
          <select id="grantSelect" class="grant-select" style="min-width:320px;">
            <option value="">— Select a grant —</option>
          </select>
        </label>
        <label style="max-width:120px;">
          Start Year
          <input id="startYear" type="number" min="2000" max="2100" value="2025">
        </label>
      </div>
      <small id="msg"></small>
    </section>

    <!-- Labor Section -->
    <section style="margin-top:0.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <h4 style="margin:0;">Labor</h4>
          <button id="addLabor" type="button" class="btn-sm">
            + Add Employees
          </button>
        </div>
        <button id="saveBudget" type="button" class="btn-sm">
          Save Budget
        </button>
      </div>
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr id="laborHeaderRow"></tr>
          </thead>
          <tbody id="laborBody"></tbody>
        </table>
      </div>
    </section>

    <!-- ODC Section -->
    <section style="margin-top:0.75rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <h4 style="margin:0;">Other Direct Costs</h4>
          <button id="addDirect" type="button" class="btn-sm">
            + Other Direct Costs
          </button>
        </div>
      </div>
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr id="directHeaderRow"></tr>
          </thead>
          <tbody id="directBody"></tbody>
        </table>
      </div>
    </section>

    <!-- Local styles for this tab (layout only; sizes handled globally) -->
    <style>
      .data-grid {
        border-collapse: collapse;
        width: 100%;
      }
      .data-grid th,
      .data-grid td {
        border: 1px solid #ddd;
        padding: 0; /* height from global input/select styles */
        white-space: nowrap;
      }

      /* Sticky first two columns */
      .sticky-col-1 {
        position: sticky;
        left: 0;
        background: #fff;
        z-index: 10;
        min-width: 220px; /* ~25 chars */
      }
      .sticky-col-2 {
        position: sticky;
        left: 220px;
        background: #fff;
        z-index: 9;
        min-width: 260px; /* ~25 chars */
      }

      .col-employee,
      .col-position {
        font-size: 0.85rem;
      }

      .grant-select {
        width: 100%;
      }

      .budget-text {
        width: 100%;
      }

      .budget-rate {
        width: 6.5rem;
        text-align: right;
      }

      .budget-cell {
        width: 6.5rem;
        text-align: right;
      }

      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .no-spin {
        -moz-appearance: textfield;
      }

      .labor-total,
      .direct-total {
        font-weight: 600;
      }
    </style>
  </article>
`;

/* ---------- State ---------- */

let rootEl = null;
let currentGrantId = null;
let currentStartYear = 2025;

let buckets = [];      // [{label, ym}]
let laborRows = [];    // [{ employee_name, category_id, months: {ym: hours} }]
let directRows = [];   // [{ category, description, months: {ym: amount} }]

let laborCategories = [];
let laborCatById = new Map();

const DIRECT_CATS = [
  "Travel",
  "Licenses",
  "Computers",
  "Software",
  "Office Supplies",
  "Training",
  "Consultants",
  "Marketing",
  "Events",
  "Insurance",
  "Other",
];

/* ---------- Helpers ---------- */

const esc = (x) =>
  (x ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;");

const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#msg", rootEl);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
}

function buildBuckets(startYear) {
  const arr = [];
  const y = Number(startYear) || new Date().getFullYear();

  // 0: Before
  arr.push({ label: "Before", ym: `${y - 1}-12-01` });

  // 1–24: 24 monthly buckets
  for (let i = 0; i < 24; i++) {
    const year = y + Math.floor(i / 12);
    const month = i % 12;
    const d = new Date(Date.UTC(year, month, 1));
    const ym = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const label = d.toLocaleString("en-US", { month: "short", year: "numeric" });
    arr.push({ label, ym });
  }

  // 25: After
  arr.push({ label: "After", ym: `${y + 2}-01-01` });

  return arr;
}

function ensureMonthKeys(monthsObj) {
  buckets.forEach((b) => {
    if (!(b.ym in monthsObj)) monthsObj[b.ym] = null;
  });
}

function rowTotal(row) {
  return buckets.reduce((sum, b) => {
    const v = row.months[b.ym];
    const n = Number(v ?? 0);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
}

/* ---------- Init ---------- */

export async function init(root, params = {}) {
  rootEl = root;
  rootEl.innerHTML = template;

  // initial buckets
  currentStartYear = 2025;
  buckets = buildBuckets(currentStartYear);

  // load employees + grants
  await loadLaborCategories();
  await loadGrantOptions();

  // header & empty grids
  renderHeaders();
  renderLabor();
  renderDirect();

  // decide selected grant:
  const sel = $("#grantSelect", rootEl);
  const fromParams = params.grantId || params.grant_id;
  const fromGlobal = getSelectedGrantId();
  let selectedId = null;

  if (fromParams && sel.querySelector(`option[value="${fromParams}"]`)) {
    selectedId = fromParams;
    sel.value = fromParams;
    setSelectedGrantId(fromParams);
  } else if (fromGlobal && sel.querySelector(`option[value="${fromGlobal}"]`)) {
    selectedId = fromGlobal;
    sel.value = fromGlobal;
  }

  currentGrantId = selectedId;

  if (currentGrantId) {
    await loadBudgetForGrant(currentGrantId);
  } else {
    msg("Select a grant to start budgeting.");
  }

  setupEventListeners();
}

/* ---------- Event Listeners ---------- */

function setupEventListeners() {
  // Grant dropdown
  $("#grantSelect", rootEl).addEventListener("change", async (e) => {
    const id = e.target.value || null;
    currentGrantId = id;
    setSelectedGrantId(id || null);
    laborRows = [];
    directRows = [];

    if (!id) {
      renderLabor();
      renderDirect();
      msg("Select a grant to start budgeting.");
      return;
    }

    await loadBudgetForGrant(id);
  });

  // Start year
  $("#startYear", rootEl).addEventListener("change", (e) => {
    const y = Number(e.target.value || 0);
    if (!y || y < 2000 || y > 2100) {
      e.target.value = String(currentStartYear);
      return;
    }

    currentStartYear = y;
    buckets = buildBuckets(currentStartYear);

    // re-project existing month data into new buckets
    laborRows.forEach((r) => {
      const newMonths = {};
      buckets.forEach((b) => {
        newMonths[b.ym] = r.months[b.ym] ?? null;
      });
      r.months = newMonths;
    });

    directRows.forEach((r) => {
      const newMonths = {};
      buckets.forEach((b) => {
        newMonths[b.ym] = r.months[b.ym] ?? null;
      });
      r.months = newMonths;
    });

    renderHeaders();
    renderLabor();
    renderDirect();
  });

  // Add labor row
  $("#addLabor", rootEl).addEventListener("click", () => {
    if (!currentGrantId) return msg("Select a grant first.", true);
    const row = { employee_name: "", category_id: null, months: {} };
    ensureMonthKeys(row.months);
    laborRows.push(row);
    renderLabor();
  });

  // Add ODC row
  $("#addDirect", rootEl).addEventListener("click", () => {
    if (!currentGrantId) return msg("Select a grant first.", true);
    const row = { category: DIRECT_CATS[0], description: "", months: {} };
    ensureMonthKeys(row.months);
    directRows.push(row);
    renderDirect();
  });

  // Save
  $("#saveBudget", rootEl).addEventListener("click", saveBudget);
}

/* ---------- Loads ---------- */

async function loadLaborCategories() {
  const { data, error } = await client
    .from("labor_categories")
    .select("id,name,position,hourly_rate,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[budget] labor_categories error", error);
    msg(error.message, true);
    return;
  }

  laborCategories = data || [];
  laborCatById = new Map(laborCategories.map((c) => [c.id, c]));
}

async function loadGrantOptions() {
  const sel = $("#grantSelect", rootEl);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a grant —</option>';

  const { data, error } = await client
    .from("grants")
    .select("id,name,grant_id,status")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[budget] loadGrantOptions error", error);
    msg(error.message, true);
    return;
  }

  (data || []).forEach((g) => {
    const label = g.grant_id ? `${g.name} (${g.grant_id})` : g.name;
    sel.appendChild(new Option(label, g.id));
  });
}

async function loadBudgetForGrant(grantId) {
  msg("Loading…");
  try {
    const [labRes, dirRes] = await Promise.all([
      client
        .from("budget_labor")
        .select("employee_name,category_id,ym,hours")
        .eq("grant_id", grantId),
      client
        .from("budget_direct")
        .select("category,description,ym,amount")
        .eq("grant_id", grantId),
    ]);

    if (labRes.error) throw labRes.error;
    if (dirRes.error) throw dirRes.error;

    const labRaw = labRes.data || [];
    const dirRaw = dirRes.data || [];
    const bucketSet = new Set(buckets.map((b) => b.ym));

    // group labor rows by (employee_name, category_id)
    const lmap = new Map();
    for (const r of labRaw) {
      const key = `${r.employee_name || ""}||${r.category_id || ""}`;
      if (!lmap.has(key)) {
        lmap.set(key, {
          employee_name: r.employee_name || "",
          category_id: r.category_id || null,
          months: {},
        });
      }
      if (bucketSet.has(r.ym)) {
        lmap.get(key).months[r.ym] = Number(r.hours ?? 0);
      }
    }
    laborRows = Array.from(lmap.values());
    laborRows.forEach(ensureMonthKeys);

    // group direct rows by (category, description)
    const dmap = new Map();
    for (const r of dirRaw) {
      const key = `${r.category || ""}||${r.description || ""}`;
      if (!dmap.has(key)) {
        dmap.set(key, {
          category: r.category || DIRECT_CATS[0],
          description: r.description || "",
          months: {},
        });
      }
      if (bucketSet.has(r.ym)) {
        dmap.get(key).months[r.ym] = Number(r.amount ?? 0);
      }
    }
    directRows = Array.from(dmap.values());
    directRows.forEach(ensureMonthKeys);

    renderHeaders();
    renderLabor();
    renderDirect();
    msg("");
  } catch (e) {
    console.error("[budget] loadBudgetForGrant error", e);
    msg(e.message || String(e), true);
  }
}

/* ---------- Rendering ---------- */

function renderHeaders() {
  const laborHeaderRow = $("#laborHeaderRow", rootEl);
  const directHeaderRow = $("#directHeaderRow", rootEl);
  if (!laborHeaderRow || !directHeaderRow) return;

  laborHeaderRow.innerHTML = `
    <th class="sticky-col-1 col-employee">Employee Name</th>
    <th class="sticky-col-2 col-position">Position</th>
    <th style="min-width:6.5rem;text-align:right;">Rate</th>
    ${buckets
      .map(
        (b) =>
          `<th style="min-width:6.5rem;text-align:right;">${esc(
            b.label
          )}</th>`
      )
      .join("")}
    <th style="min-width:7rem;text-align:right;">Total Hours</th>
  `;

  directHeaderRow.innerHTML = `
    <th class="sticky-col-1 col-employee">Category</th>
    <th class="sticky-col-2 col-position">Description</th>
    ${buckets
      .map(
        (b) =>
          `<th style="min-width:6.5rem;text-align:right;">${esc(
            b.label
          )}</th>`
      )
      .join("")}
    <th style="min-width:7rem;text-align:right;">Total Amount</th>
  `;
}

function renderLabor() {
  const tbody = $("#laborBody", rootEl);
  if (!tbody) return;

  const rowsHtml = laborRows
    .map((row, idx) => {
      const cat = row.category_id ? laborCatById.get(row.category_id) : null;
      const position = cat?.position || "";
      const rate = cat?.hourly_rate ?? "";

      const cells = buckets
        .map(
          (b) => `
        <td style="text-align:right;">
          <input
            type="number"
            step="0.01"
            class="no-spin budget-cell"
            data-kind="labor"
            data-row="${idx}"
            data-ym="${b.ym}"
            value="${esc(row.months[b.ym] ?? "")}"
          >
        </td>
      `
        )
        .join("");

      const total = rowTotal(row);

      return `
      <tr data-row-index="${idx}">
        <td class="sticky-col-1 col-employee">
          <select data-kind="labor-emp" data-row="${idx}" class="budget-select">
            <option value="">— Select employee —</option>
            ${laborCategories
              .map(
                (c) => `
              <option value="${c.id}" ${
                  row.category_id === c.id ? "selected" : ""
                }>
                ${esc(c.name)}
              </option>`
              )
              .join("")}
          </select>
        </td>
        <td class="sticky-col-2 col-position">
          <input
            type="text"
            readonly
            class="budget-text"
            value="${esc(position)}"
          >
        </td>
        <td style="text-align:right;">
          <input
            type="number"
            readonly
            class="no-spin budget-rate"
            value="${esc(rate)}"
          >
        </td>
        ${cells}
        <td class="labor-total" data-row="${idx}" style="text-align:right;">
          ${fmt2(total)}
        </td>
      </tr>
    `;
    })
    .join("");

  tbody.innerHTML = rowsHtml;

  // Handle hours input
  tbody.querySelectorAll('input[data-kind="labor"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      const ym = e.target.dataset.ym;
      if (!laborRows[i] || !ym) return;
      const v = e.target.value;
      const n = v === "" ? null : Number(v);
      laborRows[i].months[ym] = n == null || isNaN(n) ? null : n;

      const totalCell = tbody.querySelector(
        `td.labor-total[data-row="${i}"]`
      );
      if (totalCell) totalCell.textContent = fmt2(rowTotal(laborRows[i]));
    });
  });

  // Handle employee selection
  tbody.querySelectorAll('select[data-kind="labor-emp"]').forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.row);
      const id = e.target.value || null;
      if (!laborRows[i]) return;
      laborRows[i].category_id = id;

      const cat2 = id ? laborCatById.get(id) : null;
      laborRows[i].employee_name = cat2?.name || "";

      const tr = tbody.querySelector(`tr[data-row-index="${i}"]`);
      if (tr) {
        const posInput = tr.querySelector(".col-position input");
        const rateInput = tr.querySelector(".budget-rate");
        if (posInput) posInput.value = cat2?.position || "";
        if (rateInput) rateInput.value = cat2?.hourly_rate ?? "";
      }
    });
  });
}

function renderDirect() {
  const tbody = $("#directBody", rootEl);
  if (!tbody) return;

  const rowsHtml = directRows
    .map((row, idx) => {
      const cells = buckets
        .map(
          (b) => `
        <td style="text-align:right;">
          <input
            type="number"
            step="0.01"
            class="no-spin budget-cell"
            data-kind="direct"
            data-row="${idx}"
            data-ym="${b.ym}"
            value="${esc(row.months[b.ym] ?? "")}"
          >
        </td>
      `
        )
        .join("");

      const total = rowTotal(row);

      return `
      <tr data-row-index="${idx}">
        <td class="sticky-col-1 col-employee">
          <select data-kind="direct-cat" data-row="${idx}" class="budget-select">
            ${DIRECT_CATS.map(
              (c) => `
              <option value="${esc(c)}" ${
                row.category === c ? "selected" : ""
              }>${esc(c)}</option>`
            ).join("")}
          </select>
        </td>
        <td class="sticky-col-2 col-position">
          <input
            type="text"
            class="budget-text"
            data-kind="direct-desc"
            data-row="${idx}"
            value="${esc(row.description)}"
          >
        </td>
        ${cells}
        <td class="direct-total" data-row="${idx}" style="text-align:right;">
          ${fmt2(total)}
        </td>
      </tr>
    `;
    })
    .join("");

  tbody.innerHTML = rowsHtml;

  // Amount inputs
  tbody.querySelectorAll('input[data-kind="direct"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      const ym = e.target.dataset.ym;
      if (!directRows[i] || !ym) return;
      const v = e.target.value;
      const n = v === "" ? null : Number(v);
      directRows[i].months[ym] = n == null || isNaN(n) ? null : n;

      const totalCell = tbody.querySelector(
        `td.direct-total[data-row="${i}"]`
      );
      if (totalCell) totalCell.textContent = fmt2(rowTotal(directRows[i]));
    });
  });

  // Category select
  tbody.querySelectorAll('select[data-kind="direct-cat"]').forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.row);
      if (!directRows[i]) return;
      directRows[i].category = e.target.value || DIRECT_CATS[0];
    });
  });

  // Description
  tbody.querySelectorAll('input[data-kind="direct-desc"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      if (!directRows[i]) return;
      directRows[i].description = e.target.value || "";
    });
  });
}

/* ---------- Save ---------- */

async function saveBudget() {
  if (!currentGrantId) return msg("Select a grant first.", true);

  const labInserts = [];
  for (const it of laborRows) {
    const hasHeader = (it.employee_name && it.employee_name.trim()) || it.category_id;
    if (!hasHeader) continue;
    for (const b of buckets) {
      const v = it.months[b.ym];
      if (v !== null && v !== undefined && v !== "" && !isNaN(Number(v))) {
        labInserts.push({
          grant_id: currentGrantId,
          employee_name: it.employee_name || null,
          category_id: it.category_id || null,
          ym: b.ym,
          hours: Number(v),
        });
      }
    }
  }

  const dirInserts = [];
  for (const it of directRows) {
    const hasHeader =
      (it.category && it.category.trim()) || (it.description && it.description.trim());
    if (!hasHeader) continue;
    for (const b of buckets) {
      const v = it.months[b.ym];
      if (v !== null && v !== undefined && v !== "" && !isNaN(Number(v))) {
        dirInserts.push({
          grant_id: currentGrantId,
          category: it.category || null,
          description: it.description || null,
          ym: b.ym,
          amount: Number(v),
        });
      }
    }
  }

  try {
    // Clear existing for this grant
    const del1 = await client
      .from("budget_labor")
      .delete()
      .eq("grant_id", currentGrantId);
    if (del1.error) throw del1.error;

    const del2 = await client
      .from("budget_direct")
      .delete()
      .eq("grant_id", currentGrantId);
    if (del2.error) throw del2.error;

    // Insert new
    if (labInserts.length) {
      const ins1 = await client.from("budget_labor").insert(labInserts);
      if (ins1.error) throw ins1.error;
    }
    if (dirInserts.length) {
      const ins2 = await client.from("budget_direct").insert(dirInserts);
      if (ins2.error) throw ins2.error;
    }

    msg("Budget saved successfully.");
  } catch (e) {
    console.error("[budget] saveBudget error", e);
    msg("Save failed: " + (e.message || String(e)), true);
  }
}

export const budgetTab = { template, init };
