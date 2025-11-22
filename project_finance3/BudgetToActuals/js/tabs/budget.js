// js/tabs/budget.js
import { client } from "../api/supabase.js";
import { $ } from "../lib/dom.js";
import { getSelectedGrantId, setSelectedGrantId } from "../lib/grantContext.js";

console.log("[budget] unified-table version loaded");

export const template = /*html*/ `
  <article>
    <h3>Budget Builder</h3>

    <!-- Grant + Start Year -->
    <section style="max-width:820px;margin-bottom:0.5rem;">
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:0.75rem;
          flex-wrap:wrap;
          align-items:flex-end;
        "
      >
        <label style="flex:1 1 320px;min-width:260px;">
          Grant
          <select id="grantSelect" class="grant-select" style="min-width:320px;">
            <option value="">— Select a grant —</option>
          </select>
        </label>
        <label style="flex:0 0 auto;min-width:120px;text-align:right;">
          Start Year
          <input id="startYear" type="number" min="2000" max="2100" value="2025">
        </label>
      </div>
      <small id="msg"></small>
    </section>

    <!-- Unified Budget Table Section -->
    <section style="margin-top:0.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
        <h4 style="margin:0;">Budget Lines</h4>
        <button id="saveBudget" type="button" class="btn-sm">
          Save Budget
        </button>
      </div>

      <div class="scroll-x">
        <table class="data-grid">
          <thead></thead>
          <tbody id="budgetBody"></tbody>
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
        padding: 0.15rem 0.25rem;
        white-space: nowrap;
        line-height: 1.2;
      }

      .data-grid thead th {
        background: #f3f4f6;
        font-size: 0.8rem;
        line-height: 1.3;
      }

      .month-year-header {
        text-align: center;
        font-weight: 600;
      }

      .month-header {
        text-align: center;
        font-size: 0.78rem;
      }

      .rate-header {
        min-width: 6.5rem;
        text-align: right;
      }

      .total-header {
        min-width: 7rem;
        text-align: right;
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

      .section-header-row td {
        background: #f9fafb;
        font-weight: 600;
      }

      .section-header-cell {
        position: sticky;
        left: 0;
        z-index: 12;
        background: #eef2ff; /* slightly tinted so it stands out */
      }

      .section-header-row button.section-add {
        margin-right: 0.5rem;
      }
    </style>
  </article>
`;

/* ---------- State ---------- */

let rootEl = null;
let currentGrantId = null;
let currentStartYear = 2025;

let buckets = []; // [{label, ym}]

// rows in memory
let laborRows = [];      // [{ employee_name, category_id, months: {ym: hours} }]
let subsRows = [];       // [{ sub_id, name, description, months }]
let materialsRows = [];  // [{ material_id, name, description, months }]
let equipmentRows = [];  // [{ equipment_id, name, description, months }]
let directRows = [];     // [{ category, description, months }]

// reference lists
let laborCategories = [];
let laborCatById = new Map();

let subsList = [];
let subsById = new Map();

let materialsList = [];
let materialsById = new Map();

let equipmentList = [];
let equipmentById = new Map();

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

  // load reference data
  await loadLaborCategories();
  await loadSubsList();
  await loadMaterialsList();
  await loadEquipmentList();
  await loadGrantOptions();

  // header & empty grid
  renderHeaders();
  renderBudgetRows();

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
    subsRows = [];
    materialsRows = [];
    equipmentRows = [];
    directRows = [];

    if (!id) {
      renderBudgetRows();
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
    [laborRows, subsRows, materialsRows, equipmentRows, directRows].forEach(
      (rows) => {
        rows.forEach((r) => {
          const newMonths = {};
          buckets.forEach((b) => {
            newMonths[b.ym] = r.months[b.ym] ?? null;
          });
          r.months = newMonths;
        });
      }
    );

    renderHeaders();
    renderBudgetRows();
  });

  // Section add buttons inside the unified table
  rootEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".section-add");
    if (!btn) return;

    if (!currentGrantId) {
      msg("Select a grant first.", true);
      return;
    }

    const section = btn.dataset.section;
    if (section === "labor") {
      const row = { employee_name: "", category_id: null, months: {} };
      ensureMonthKeys(row.months);
      laborRows.push(row);
    } else if (section === "subs") {
      const row = { sub_id: null, name: "", description: "", months: {} };
      ensureMonthKeys(row.months);
      subsRows.push(row);
    } else if (section === "materials") {
      const row = { material_id: null, name: "", description: "", months: {} };
      ensureMonthKeys(row.months);
      materialsRows.push(row);
    } else if (section === "equipment") {
      const row = { equipment_id: null, name: "", description: "", months: {} };
      ensureMonthKeys(row.months);
      equipmentRows.push(row);
    } else if (section === "direct") {
      const row = { category: DIRECT_CATS[0], description: "", months: {} };
      ensureMonthKeys(row.months);
      directRows.push(row);
    }

    renderBudgetRows();
  });

  // Save
  $("#saveBudget", rootEl).addEventListener("click", saveBudget);
}

/* ---------- Loads (reference data) ---------- */

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

async function loadSubsList() {
  const { data, error } = await client
    .from("subs")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[budget] loadSubsList error", error);
    msg(error.message, true);
    return;
  }
  subsList = data || [];
  subsById = new Map(subsList.map((s) => [s.id, s]));
}

async function loadMaterialsList() {
  const { data, error } = await client
    .from("materials")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[budget] loadMaterialsList error", error);
    msg(error.message, true);
    return;
  }
  materialsList = data || [];
  materialsById = new Map(materialsList.map((m) => [m.id, m]));
}

async function loadEquipmentList() {
  const { data, error } = await client
    .from("equipment")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[budget] loadEquipmentList error", error);
    msg(error.message, true);
    return;
  }
  equipmentList = data || [];
  equipmentById = new Map(equipmentList.map((e) => [e.id, e]));
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

/* ---------- Load budget for a grant ---------- */

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

    // split direct into 4 groups
    const subsRaw = dirRaw.filter((r) => r.category === "Subcontracts");
    const matsRaw = dirRaw.filter((r) => r.category === "Materials");
    const eqpRaw = dirRaw.filter((r) => r.category === "Equipment");
    const odcRaw = dirRaw.filter(
      (r) =>
        r.category !== "Subcontracts" &&
        r.category !== "Materials" &&
        r.category !== "Equipment"
    );

    // Subs
    const smap = new Map();
    for (const r of subsRaw) {
      const key = `${r.description || ""}`;
      if (!smap.has(key)) {
        // match description to subs list by name
        const s = subsList.find((s) => s.name === r.description);
        smap.set(key, {
          sub_id: s?.id ?? null,
          name: r.description || "",
          description: "",
          months: {},
        });
      }
      if (bucketSet.has(r.ym)) {
        smap.get(key).months[r.ym] = Number(r.amount ?? 0);
      }
    }
    subsRows = Array.from(smap.values());
    subsRows.forEach(ensureMonthKeys);

    // Materials
    const mmap = new Map();
    for (const r of matsRaw) {
      const key = `${r.description || ""}`;
      if (!mmap.has(key)) {
        const m = materialsList.find((m) => m.name === r.description);
        mmap.set(key, {
          material_id: m?.id ?? null,
          name: r.description || "",
          description: "",
          months: {},
        });
      }
      if (bucketSet.has(r.ym)) {
        mmap.get(key).months[r.ym] = Number(r.amount ?? 0);
      }
    }
    materialsRows = Array.from(mmap.values());
    materialsRows.forEach(ensureMonthKeys);

    // Equipment
    const emap = new Map();
    for (const r of eqpRaw) {
      const key = `${r.description || ""}`;
      if (!emap.has(key)) {
        const eq = equipmentList.find((e) => e.name === r.description);
        emap.set(key, {
          equipment_id: eq?.id ?? null,
          name: r.description || "",
          description: "",
          months: {},
        });
      }
      if (bucketSet.has(r.ym)) {
        emap.get(key).months[r.ym] = Number(r.amount ?? 0);
      }
    }
    equipmentRows = Array.from(emap.values());
    equipmentRows.forEach(ensureMonthKeys);

    // ODC
    const dmap = new Map();
    for (const r of odcRaw) {
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
    renderBudgetRows();
    msg("");
  } catch (e) {
    console.error("[budget] loadBudgetForGrant error", e);
    msg(e.message || String(e), true);
  }
}

/* ---------- Rendering ---------- */

function renderHeaders() {
  if (!rootEl) return;
  const thead = rootEl.querySelector(".data-grid thead");
  if (!thead) return;

  if (!buckets.length) {
    thead.innerHTML = "";
    return;
  }

  const beforeBucket = buckets[0];
  const afterBucket = buckets[buckets.length - 1];
  const monthBuckets = buckets.slice(1, buckets.length - 1); // only the actual months

  // Group months by year
  const yearGroups = [];
  let currentYear = null;
  let currentCount = 0;

  monthBuckets.forEach((b) => {
    const year = b.ym.slice(0, 4);
    if (year !== currentYear) {
      if (currentYear !== null) {
        yearGroups.push({ year: currentYear, count: currentCount });
      }
      currentYear = year;
      currentCount = 1;
    } else {
      currentCount++;
    }
  });
  if (currentYear !== null) {
    yearGroups.push({ year: currentYear, count: currentCount });
  }

  const yearHeaderCells = yearGroups
    .map(
      (g) =>
        `<th class="month-year-header" colspan="${g.count}">${esc(g.year)}</th>`
    )
    .join("");

  const monthHeaderCells = monthBuckets
    .map((b) => {
      const d = new Date(b.ym);
      const mon = d.toLocaleString("en-US", { month: "short" });
      return `<th class="month-header">${esc(mon)}</th>`;
    })
    .join("");

  thead.innerHTML = `
    <tr>
      <th rowspan="2" class="sticky-col-1 col-employee">Name / Category</th>
      <th rowspan="2" class="sticky-col-2 col-position">Position / Description</th>
      <th rowspan="2" class="rate-header">Rate / &mdash;</th>
      <th rowspan="2" class="month-year-header">${esc(beforeBucket.label)}</th>
      ${yearHeaderCells}
      <th rowspan="2" class="month-year-header">${esc(afterBucket.label)}</th>
      <th rowspan="2" class="total-header">Total</th>
    </tr>
    <tr>
      ${monthHeaderCells}
    </tr>
  `;
}

function sectionHeaderRow(label, sectionKey, colSpan) {
  // First cell: sticky block with button + label spanning Name/Position/Rate.
  // Second cell: empty, spans the months + Total so column count stays consistent.
  const trailingSpan = colSpan - 3;
  return `
    <tr class="section-header-row" data-section="${sectionKey}">
      <td class="sticky-col-1 section-header-cell" colspan="3">
        <button type="button" class="btn-sm section-add" data-section="${sectionKey}">
          [+]
        </button>
        <span>${label}</span>
      </td>
      <td colspan="${trailingSpan}"></td>
    </tr>
  `;
}

function renderBudgetRows() {
  const tbody = $("#budgetBody", rootEl);
  if (!tbody) return;

  const colSpan = 3 + buckets.length + 1; // name, desc, rate, months..., total

  const monthCells = (row, kind, idx) =>
    buckets
      .map(
        (b) => `
      <td style="text-align:right;">
        <input
          type="number"
          step="0.01"
          class="no-spin budget-cell"
          data-kind="${kind}"
          data-row="${idx}"
          data-ym="${b.ym}"
          value="${esc(row.months[b.ym] ?? "")}"
        >
      </td>`
      )
      .join("");

  let html = "";

  /* --- Employees section --- */
  html += sectionHeaderRow("Employees", "labor", colSpan);
  laborRows.forEach((row, idx) => {
    const cat = row.category_id ? laborCatById.get(row.category_id) : null;
    const position = cat?.position || "";
    const rate = cat?.hourly_rate ?? "";
    const total = rowTotal(row);

    html += `
      <tr data-kind-row="labor" data-row-index="${idx}">
        <td class="sticky-col-1 col-employee">
          <select data-kind="labor-emp" data-row="${idx}" class="budget-select">
            <option value="">— Select employee —</option>
            ${laborCategories
              .map(
                (c) => `
                  <option value="${c.id}" ${
                    row.category_id === c.id ? "selected" : ""
                  }>${esc(c.name)}</option>`
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
        ${monthCells(row, "labor", idx)}
        <td class="labor-total" data-row="${idx}" style="text-align:right;">
          ${fmt2(total)}
        </td>
      </tr>
    `;
  });

  /* --- Subcontractors section --- */
  html += sectionHeaderRow("Subcontractors", "subs", colSpan);
  subsRows.forEach((row, idx) => {
    const total = rowTotal(row);
    html += `
      <tr data-kind-row="subs" data-row-index="${idx}">
        <td class="sticky-col-1 col-employee">
          <select data-kind="subs-name" data-row="${idx}" class="budget-select">
            <option value="">— Select sub —</option>
            ${subsList
              .map(
                (s) => `
                  <option value="${s.id}" ${
                    row.sub_id === s.id ? "selected" : ""
                  }>${esc(s.name)}</option>`
              )
              .join("")}
          </select>
        </td>
        <td class="sticky-col-2 col-position">
          <input type="text" class="budget-text"
                 data-kind="subs-desc" data-row="${idx}"
                 value="${esc(row.description || "")}">
        </td>
        <td></td>
        ${monthCells(row, "subs", idx)}
        <td class="direct-total" data-row="${idx}" style="text-align:right;">
          ${fmt2(total)}
        </td>
      </tr>
    `;
  });

  /* --- Materials section --- */
  html += sectionHeaderRow("Materials", "materials", colSpan);
  materialsRows.forEach((row, idx) => {
    const total = rowTotal(row);
    html += `
      <tr data-kind-row="materials" data-row-index="${idx}">
        <td class="sticky-col-1 col-employee">
          <select data-kind="materials-name" data-row="${idx}" class="budget-select">
            <option value="">— Select material —</option>
            ${materialsList
              .map(
                (m) => `
                  <option value="${m.id}" ${
                    row.material_id === m.id ? "selected" : ""
                  }>${esc(m.name)}</option>`
              )
              .join("")}
          </select>
        </td>
        <td class="sticky-col-2 col-position">
          <input type="text" class="budget-text"
                 data-kind="materials-desc" data-row="${idx}"
                 value="${esc(row.description || "")}">
        </td>
        <td></td>
        ${monthCells(row, "materials", idx)}
        <td class="direct-total" data-row="${idx}" style="text-align:right;">
          ${fmt2(total)}
        </td>
      </tr>
    `;
  });

  /* --- Equipment section --- */
  html += sectionHeaderRow("Equipment", "equipment", colSpan);
  equipmentRows.forEach((row, idx) => {
    const total = rowTotal(row);
    html += `
      <tr data-kind-row="equipment" data-row-index="${idx}">
        <td class="sticky-col-1 col-employee">
          <select data-kind="equipment-name" data-row="${idx}" class="budget-select">
            <option value="">— Select equipment —</option>
            ${equipmentList
              .map(
                (e) => `
                  <option value="${e.id}" ${
                    row.equipment_id === e.id ? "selected" : ""
                  }>${esc(e.name)}</option>`
              )
              .join("")}
          </select>
        </td>
        <td class="sticky-col-2 col-position">
          <input type="text" class="budget-text"
                 data-kind="equipment-desc" data-row="${idx}"
                 value="${esc(row.description || "")}">
        </td>
        <td></td>
        ${monthCells(row, "equipment", idx)}
        <td class="direct-total" data-row="${idx}" style="text-align:right;">
          ${fmt2(total)}
        </td>
      </tr>
    `;
  });

  /* --- Other Direct Costs section --- */
  html += sectionHeaderRow("Other Direct Costs", "direct", colSpan);
  directRows.forEach((row, idx) => {
    const total = rowTotal(row);
    html += `
      <tr data-kind-row="direct" data-row-index="${idx}">
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
            value="${esc(row.description || "")}"
          >
        </td>
        <td></td>
        ${monthCells(row, "direct", idx)}
        <td class="direct-total" data-row="${idx}" style="text-align:right;">
          ${fmt2(total)}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // --- Wire up all inputs / selects ---

  // Labor monthly amounts
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

  // Labor employee selection
  tbody.querySelectorAll('select[data-kind="labor-emp"]').forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.row);
      const id = e.target.value || null;
      if (!laborRows[i]) return;
      laborRows[i].category_id = id;

      const cat2 = id ? laborCatById.get(id) : null;
      laborRows[i].employee_name = cat2?.name || "";

      const tr = tbody.querySelector(
        `tr[data-kind-row="labor"][data-row-index="${i}"]`
      );
      if (tr) {
        const posInput = tr.querySelector(".col-position input");
        const rateInput = tr.querySelector(".budget-rate");
        if (posInput) posInput.value = cat2?.position || "";
        if (rateInput) rateInput.value = cat2?.hourly_rate ?? "";
      }
    });
  });

  // Subs
  tbody.querySelectorAll('input[data-kind="subs"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      const ym = e.target.dataset.ym;
      if (!subsRows[i] || !ym) return;
      const v = e.target.value;
      const n = v === "" ? null : Number(v);
      subsRows[i].months[ym] = n == null || isNaN(n) ? null : n;

      const totalCell = tbody.querySelector(
        `td.direct-total[data-row="${i}"]`
      );
      if (totalCell) totalCell.textContent = fmt2(rowTotal(subsRows[i]));
    });
  });

  tbody.querySelectorAll('select[data-kind="subs-name"]').forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.row);
      const id = e.target.value || null;
      if (!subsRows[i]) return;
      subsRows[i].sub_id = id;
      const s = id ? subsById.get(id) : null;
      subsRows[i].name = s?.name || "";
    });
  });

  tbody.querySelectorAll('input[data-kind="subs-desc"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      if (!subsRows[i]) return;
      subsRows[i].description = e.target.value || "";
    });
  });

  // Materials
  tbody.querySelectorAll('input[data-kind="materials"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      const ym = e.target.dataset.ym;
      if (!materialsRows[i] || !ym) return;
      const v = e.target.value;
      const n = v === "" ? null : Number(v);
      materialsRows[i].months[ym] = n == null || isNaN(n) ? null : n;

      const totalCell = tbody.querySelector(
        `td.direct-total[data-row="${i}"]`
      );
      if (totalCell) totalCell.textContent = fmt2(rowTotal(materialsRows[i]));
    });
  });

  tbody.querySelectorAll('select[data-kind="materials-name"]').forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.row);
      const id = e.target.value || null;
      if (!materialsRows[i]) return;
      materialsRows[i].material_id = id;
      const m = id ? materialsById.get(id) : null;
      materialsRows[i].name = m?.name || "";
    });
  });

  tbody.querySelectorAll('input[data-kind="materials-desc"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      if (!materialsRows[i]) return;
      materialsRows[i].description = e.target.value || "";
    });
  });

  // Equipment
  tbody.querySelectorAll('input[data-kind="equipment"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      const ym = e.target.dataset.ym;
      if (!equipmentRows[i] || !ym) return;
      const v = e.target.value;
      const n = v === "" ? null : Number(v);
      equipmentRows[i].months[ym] = n == null || isNaN(n) ? null : n;

      const totalCell = tbody.querySelector(
        `td.direct-total[data-row="${i}"]`
      );
      if (totalCell) totalCell.textContent = fmt2(rowTotal(equipmentRows[i]));
    });
  });

  tbody
    .querySelectorAll('select[data-kind="equipment-name"]')
    .forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const i = Number(e.target.dataset.row);
        const id = e.target.value || null;
        if (!equipmentRows[i]) return;
        equipmentRows[i].equipment_id = id;
        const eq = id ? equipmentById.get(id) : null;
        equipmentRows[i].name = eq?.name || "";
      });
    });

  tbody
    .querySelectorAll('input[data-kind="equipment-desc"]')
    .forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const i = Number(e.target.dataset.row);
        if (!equipmentRows[i]) return;
        equipmentRows[i].description = e.target.value || "";
      });
    });

  // Direct / ODC
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

  tbody.querySelectorAll('select[data-kind="direct-cat"]').forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.row);
      if (!directRows[i]) return;
      directRows[i].category = e.target.value || DIRECT_CATS[0];
    });
  });

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

  // --- Labor to budget_labor ---
  const laborInserts = [];
  for (const it of laborRows) {
    const hasHeader =
      (it.employee_name && it.employee_name.trim()) || it.category_id;
    if (!hasHeader) continue;
    for (const b of buckets) {
      const v = it.months[b.ym];
      if (
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !isNaN(Number(v))
      ) {
        laborInserts.push({
          grant_id: currentGrantId,
          employee_name: it.employee_name || null,
          category_id: it.category_id || null,
          ym: b.ym,
          hours: Number(v),
        });
      }
    }
  }

  // --- Subs / Materials / Equipment / ODC into budget_direct ---
  const directInserts = [];

  function pushRows(rows, categoryOverride, useNameAsDescription = false) {
    for (const it of rows) {
      const hasHeader =
        (it.category && it.category.trim && it.category.trim()) ||
        (it.name && it.name.trim && it.name.trim()) ||
        (it.description && it.description.trim && it.description.trim());
      if (!hasHeader) continue;

      for (const b of buckets) {
        const v = it.months[b.ym];
        if (
          v !== null &&
          v !== undefined &&
          v !== "" &&
          !isNaN(Number(v))
        ) {
          const descVal = useNameAsDescription
            ? (it.name || it.description || null)
            : (it.description || it.name || null);

          directInserts.push({
            grant_id: currentGrantId,
            category: categoryOverride || it.category || null,
            description: descVal,
            ym: b.ym,
            amount: Number(v),
          });
        }
      }
    }
  }

  // Subs / Materials / Equipment use fixed categories, description comes from selected name
  pushRows(subsRows, "Subcontracts", true);
  pushRows(materialsRows, "Materials", true);
  pushRows(equipmentRows, "Equipment", true);
  // ODC keeps its own category/description behavior
  pushRows(directRows, null, false);

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

    // Insert labor
    if (laborInserts.length) {
      const ins1 = await client.from("budget_labor").insert(laborInserts);
      if (ins1.error) throw ins1.error;
    }

    // Insert direct (subs/materials/equipment/odc)
    if (directInserts.length) {
      const ins2 = await client.from("budget_direct").insert(directInserts);
      if (ins2.error) throw ins2.error;
    }

    msg("Budget saved successfully.");
    await loadBudgetForGrant(currentGrantId);
  } catch (e) {
    console.error("[budget] saveBudget error", e);
    msg("Save failed: " + (e.message || String(e)), true);
  }
}

export const budgetTab = { template, init };
