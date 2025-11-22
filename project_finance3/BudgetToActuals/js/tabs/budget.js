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
        <table id="budgetTable" class="data-grid">
          <thead></thead>
          <tbody id="budgetBody"></tbody>
        </table>
      </div>
    </section>

    <!-- Local styles for this tab (layout only; sizes handled globally) -->
    <style>
      #budgetTable {
        border-collapse: collapse;
        width: 100%;
      }

      #budgetTable th,
      #budgetTable td {
        border: 1px solid #ddd;
        padding: 0.15rem 0.25rem;
        white-space: nowrap;
        line-height: 1.2;
      }

      #budgetTable thead th {
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

// ... (rest of the file stays exactly the same)
