// /js/tabs/budget.js
import { client } from "../api/supabase.js";
import { $ } from "../lib/dom.js";

export const template = /*html*/`
  <article>
    <h3>Budget Builder</h3>

    <div class="grid" style="max-width:520px;margin-bottom:0.5rem;">
      <label>
        Grant
        <select id="grantSelect">
          <option value="">— Select a grant —</option>
        </select>
      </label>
      <label>
        Start Year
        <input id="startYear" type="number" min="2000" max="2100" value="2025">
      </label>
    </div>
    <small id="msg"></small>

    <section style="margin-top:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <h4 style="margin:0;">Labor</h4>
          <button id="addLabor" type="button" style="font-size:0.8rem;padding:0.15rem 0.5rem;">
            + Add Employees
          </button>
        </div>
        <button id="saveBudget" type="button" style="font-size:0.8rem;padding:0.15rem 0.5rem;">
          Save Budget
        </button>
      </div>

      <div class="scroll-x">
        <table>
          <thead>
            <tr id="laborHeaderRow"></tr>
          </thead>
          <tbody id="laborBody"></tbody>
        </table>
      </div>
    </section>

    <section style="margin-top:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <h4 style="margin:0;">Other Direct Costs</h4>
          <button id="addDirect" type="button" style="font-size:0.8rem;padding:0.15rem 0.5rem;">
            + Other Direct Costs
          </button>
        </div>
      </div>

      <div class="scroll-x">
        <table>
          <thead>
            <tr id="directHeaderRow"></tr>
          </thead>
          <tbody id="directBody"></tbody>
        </table>
      </div>
    </section>
  </article>
`;

/* --------- State --------- */

let rootEl = null;
let currentGrantId = null;
let currentStartYear = 2025;

// 26 buckets: 1 "Before", 24 months, 1 "After"
let buckets = []; // [{ label, ym }]

let laborRows = [];  // [{ employee_name, category_id, months: {ym: number|null} }]
let directRows = []; // [{ category, description, months: {ym: number|null} }]

let laborCategories = []; // from labor_categories
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

/* --------- Helpers --------- */

const esc = (x) =>
  (x ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");

const fmtNum = (n) =>
  (n ?? 0).toLocaleString(undefined, {
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

  // Before bucket
  arr.push({
    label: "Before",
    ym: `${y - 1}-12-01`, // arbitrary date to store in DB
  });

  // 24 month buckets: year y and y+1
  for (let i = 0; i < 24; i++) {
    const year = y + Math.floor(i / 12);
    const month = i % 12; // 0–11
    const d = new Date(Date.UTC(year, month, 1));
    const ym = d.toISOString().slice(0, 10);
    const label = d.toLocaleString("en-US", { month: "short", year: "numeric" });
    arr.push({ label, ym });
  }

  // After bucket
  arr.push({
    label: "After",
    ym: `${y + 2}-01-01`,
  });

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

/* --------- Init --------- */

export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;

  // initial year & buckets
  currentStartYear = 2025;
  buckets = buildBuckets(currentStartYear);

  await loadLaborCategories();
  await loadGrantOptions();

  renderHeaders();
  renderLabor();
  renderDirect();

  const storedId = localStorage.getItem("selectedGrantId") || "";
  if (storedId) {
    const sel = $("#grantSelect", rootEl);
    if (sel) {
      sel.value = storedId;
      if (sel.value === storedId) {
        currentGrantId = storedId;
        await loadBudgetForGrant(storedId);
      }
    }
  }

  $("#grantSelect", rootEl).addEventListener("change", async (e) => {
    const id = e.target.value || null;
    currentGrantId = id;
    laborRows = [];
    directRows = [];
    if (!id) {
      renderLabor();
      renderDirect();
      return;
    }
    await loadBudgetForGrant(id);
  });

  $("#startYear", rootEl).addEventListener("change", (e) => {
    const y = Number(e.target.value || 0);
    if (!y || y < 2000 || y > 2100) {
      e.target.value = String(currentStartYear);
      return;
    }
    currentStartYear = y;
    buckets = buildBuckets(currentStartYear);

    // re-key month maps to new buckets (drop unmatched)
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

  $("#addLabor", rootEl).addEventListener("click", () => {
    if (!currentGrantId) return msg("Select a grant first.", true);
    const row = {
      employee_name: "",
      category_id: null,
      months: {},
    };
    ensureMonthKeys(row.months);
    laborRows.push(row);
    renderLabor();
  });

  $("#addDirect", rootEl).addEventListener("click", () => {
    if (!currentGrantId) return msg("Select a grant first.", true);
    const row = {
      category: DIRECT_CATS[0],
      description: "",
      months: {},
    };
    ensureMonthKeys(row.months);
    directRows.push(row);
    renderDirect();
  });

  $("#saveBudget", rootEl).addEventListener("click", saveBudget);
}

/* --------- Loads --------- */

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

    // build laborRows
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
        const row = lmap.get(key);
        row.months[r.ym] = Number(r.hours ?? 0);
      }
    }
    laborRows = Array.from(lmap.values());
    laborRows.forEach((r) => ensureMonthKeys(r.months));

    // build directRows
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
        const row = dmap.get(key);
        row.months[r.ym] = Number(r.amount ?? 0);
      }
    }
    directRows = Array.from(dmap.values());
    directRows.forEach((r) => ensureMonthKeys(r.months));

    renderHeaders();
    renderLabor();
    renderDirect();
    msg("");
  } catch (e) {
    console.error("[budget] loadBudgetForGrant error", e);
    msg(e.message || String(e), true);
  }
}

/* --------- Rendering --------- */

function renderHeaders() {
  const laborHead = $("#laborHeaderRow", rootEl);
  const directHead = $("#directHeaderRow", rootEl);
  if (!laborHead || !directHead) return;

  laborHead.innerHTML = `
    <th class="sticky-col-1">Employee Name</th>
    <th class="sticky-col-2">Position</th>
    <th style="text-align:right;">Rate</th>
    ${buckets.map((b) => `<th style="text-align:center;">${esc(b.label)}</th>`).join("")}
    <th style="text-align:right;">Total</th>
  `;

  directHead.innerHTML = `
    <th class="sticky-col-1">Category</th>
    <th class="sticky-col-2">Description</th>
    ${buckets.map((b) => `<th style="text-align:center;">${esc(b.label)}</th>`).join("")}
    <th style="text-align:right;">Total</th>
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
        <td style="text-align:center;">
          <input
            type="number"
            step="0.01"
            data-kind="labor"
            data-row="${idx}"
            data-ym="${b.ym}"
            style="max-width:4.5rem;padding:0.2rem 0.35rem;font-size:0.85rem;text-align:right;"
            value="${esc(row.months[b.ym] ?? "")}"
          >
        </td>
      `
        )
        .join("");

      const total = rowTotal(row);

      return `
        <tr>
          <td class="sticky-col-1">
            <select
              data-kind="labor-emp"
              data-row="${idx}"
              style="width:100%;padding:0.2rem 0.35rem;font-size:0.85rem;"
            >
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
          <td class="sticky-col-2">
            <input
              type="text"
              readonly
              style="width:100%;padding:0.2rem 0.35rem;font-size:0.85rem;"
              value="${esc(position)}"
            >
          </td>
          <td style="text-align:right;">
            <input
              type="number"
              readonly
              style="max-width:5rem;padding:0.2rem 0.35rem;font-size:0.85rem;text-align:right;"
              value="${esc(rate)}"
            >
          </td>
          ${cells}
          <td style="text-align:right;font-weight:600;">
            ${fmtNum(total)}
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = rowsHtml;

  // events for hours
  tbody.querySelectorAll('input[data-kind="labor"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      const ym = e.target.dataset.ym;
      if (!laborRows[i] || !ym) return;
      const v = e.target.value;
      const n = v === "" ? null : Number(v);
      laborRows[i].months[ym] = n == null || isNaN(n) ? null : n;
      renderLabor(); // re-render to update totals
    });
  });

  // events for employee selection
  tbody.querySelectorAll('select[data-kind="labor-emp"]').forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.row);
      const id = e.target.value || null;
      if (!laborRows[i]) return;
      laborRows[i].category_id = id;
      const cat = id ? laborCatById.get(id) : null;
      laborRows[i].employee_name = cat?.name || "";
      renderLabor(); // refresh position + rate display
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
        <td style="text-align:center;">
          <input
            type="number"
            step="0.01"
            data-kind="direct"
            data-row="${idx}"
            data-ym="${b.ym}"
            style="max-width:4.5rem;padding:0.2rem 0.35rem;font-size:0.85rem;text-align:right;"
            value="${esc(row.months[b.ym] ?? "")}"
          >
        </td>
      `
        )
        .join("");

      const total = rowTotal(row);

      return `
        <tr>
          <td class="sticky-col-1">
            <select
              data-kind="direct-cat"
              data-row="${idx}"
              style="width:100%;padding:0.2rem 0.35rem;font-size:0.85rem;"
            >
              ${DIRECT_CATS.map(
                (c) => `
                <option value="${esc(c)}" ${
                  row.category === c ? "selected" : ""
                }>${esc(c)}</option>`
              ).join("")}
            </select>
          </td>
          <td class="sticky-col-2">
            <input
              type="text"
              data-kind="direct-desc"
              data-row="${idx}"
              style="width:100%;padding:0.2rem 0.35rem;font-size:0.85rem;"
              placeholder="Description"
              value="${esc(row.description)}"
            >
          </td>
          ${cells}
          <td style="text-align:right;font-weight:600;">
            ${fmtNum(total)}
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = rowsHtml;

  tbody.querySelectorAll('input[data-kind="direct"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.row);
      const ym = e.target.dataset.ym;
      if (!directRows[i] || !ym) return;
      const v = e.target.value;
      const n = v === "" ? null : Number(v);
      directRows[i].months[ym] = n == null || isNaN(n) ? null : n;
      renderDirect(); // update totals
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

/* --------- Save --------- */

async function saveBudget() {
  if (!currentGrantId) return msg("Select a grant first.", true);

  const laborInserts = [];
  laborRows.forEach((row) => {
    const hasHeader = row.employee_name?.trim() || row.category_id;
    if (!hasHeader) return;
    buckets.forEach((b) => {
      const v = row.months[b.ym];
      const n = Number(v ?? 0);
      if (!isNaN(n) && n !== 0) {
        laborInserts.push({
          grant_id: currentGrantId,
          employee_name: row.employee_name || null,
          category_id: row.category_id || null,
          ym: b.ym,
          hours: n,
        });
      }
    });
  });

  const directInserts = [];
  directRows.forEach((row) => {
    const hasHeader = row.category?.trim() || row.description?.trim();
    if (!hasHeader) return;
    buckets.forEach((b) => {
      const v = row.months[b.ym];
      const n = Number(v ?? 0);
      if (!isNaN(n) && n !== 0) {
        directInserts.push({
          grant_id: currentGrantId,
          category: row.category || null,
          description: row.description || null,
          ym: b.ym,
          amount: n,
        });
      }
    });
  });

  try {
    // wipe old budget for this grant
    const del1 = await client.from("budget_labor").delete().eq("grant_id", currentGrantId);
    if (del1.error) throw del1.error;

    const del2 = await client.from("budget_direct").delete().eq("grant_id", currentGrantId);
    if (del2.error) throw del2.error;

    if (laborInserts.length) {
      const ins1 = await client.from("budget_labor").insert(laborInserts);
      if (ins1.error) throw ins1.error;
    }
    if (directInserts.length) {
      const ins2 = await client.from("budget_direct").insert(directInserts);
      if (ins2.error) throw ins2.error;
    }

    msg("Budget saved.");
    if (currentGrantId) await loadBudgetForGrant(currentGrantId);
  } catch (e) {
    console.error("[budget] saveBudget error", e);
    msg(e.message || String(e), true);
  }
}
