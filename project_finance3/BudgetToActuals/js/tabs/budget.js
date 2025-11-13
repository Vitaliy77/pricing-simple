// /js/tabs/budget.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

// --- Fixed 24-month window: Jan 2026 – Dec 2027 ---
const FIXED_MONTHS = (() => {
  const out = [];
  const d = new Date("2026-01-01T00:00:00Z");
  for (let i = 0; i < 24; i++) {
    const copy = new Date(d);
    copy.setUTCDate(1);
    out.push(copy.toISOString().slice(0, 10)); // "YYYY-MM-DD" as first of month
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
})();

// --- module state ---
let rootEl;
let currentGrantId = null;
let months = FIXED_MONTHS.slice();

let laborRows = [];       // [{ employee_id, employee_name, category_id, months: {ym: hours} }]
let directRows = [];      // [{ category, description, months: {ym: amount} }]
let laborCategories = []; // employees master (labor_categories)
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

const esc = (x) =>
  (x ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");

const fmtMonthLabel = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" }); // e.g. Jan 26
};

const msg = (text, isErr = false) => {
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
};

export const template = /*html*/ `
  <article>
    <h3>Budget Builder</h3>

    <label>
      Grant:
      <select id="grantSelect">
        <option value="">— Select a grant —</option>
      </select>
    </label>
    <small id="msg"></small>

    <h4 style="margin-top:1.5rem">Labor</h4>
    <button id="addLabor" type="button">+ Add employee</button>
    <div class="scroll-x" style="margin-top:.5rem">
      <table>
        <thead>
          <tr id="laborHeaderRow"></tr>
        </thead>
        <tbody id="laborBody"></tbody>
      </table>
    </div>

    <h4 style="margin-top:1.5rem">Other Direct Costs</h4>
    <button id="addDirect" type="button">+ Add cost</button>
    <div class="scroll-x" style="margin-top:.5rem">
      <table>
        <thead>
          <tr id="directHeaderRow"></tr>
        </thead>
        <tbody id="directBody"></tbody>
      </table>
    </div>

    <div style="margin-top:1.5rem">
      <button id="saveBudget" type="button">Save budget</button>
    </div>
  </article>
`;

// ---- lifecycle ----
export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;

  // build static headers once
  renderMonthHeaders();

  // load reference data
  await loadLaborCategories();
  await loadGrantOptions();

  // 🔹 auto-select grant from Grants tab, if set
  const storedId = localStorage.getItem('selectedGrantId') || '';
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
    if (!id) {
      clearBudget();
      return;
    }
    await loadBudgetForGrant(id);
  });

  $("#addLabor", rootEl).addEventListener("click", () => {
    if (!currentGrantId) return msg("Select a grant first.", true);
    const row = { employee_id: null, employee_name: "", category_id: null, months: {} };
    ensureMonthKeys(row.months);
    laborRows.push(row);
    renderLabor();
  });

  $("#addDirect", rootEl).addEventListener("click", () => {
    if (!currentGrantId) return msg("Select a grant first.", true);
    const row = { category: DIRECT_CATS[0], description: "", months: {} };
    ensureMonthKeys(row.months);
    directRows.push(row);
    renderDirect();
  });

  $("#saveBudget", rootEl).addEventListener("click", saveBudget);
}


// ---- helpers ----
function ensureMonthKeys(obj) {
  months.forEach((m) => {
    if (!(m in obj)) obj[m] = null;
  });
}

// ---- data loads ----
async function loadGrantOptions() {
  const sel = $("#grantSelect", rootEl);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a grant —</option>';

  const { data, error } = await client
    .from("grants")
    .select("id,name,grant_id,status")
    .eq("status", "active");
  if (error) {
    console.error("loadGrantOptions error", error);
    msg(error.message, true);
    return;
  }
  (data || []).forEach((g) => {
    const label = g.grant_id ? `${g.name} (${g.grant_id})` : g.name;
    sel.appendChild(new Option(label, g.id));
  });
}

async function loadLaborCategories() {
  const { data, error } = await client
    .from("labor_categories")
    .select("id,name,position,hourly_rate,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error("loadLaborCategories error", error);
    msg(error.message, true);
    return;
  }
  laborCategories = data || [];
  laborCatById = new Map(laborCategories.map((c) => [c.id, c]));
}

async function loadBudgetForGrant(grantId) {
  try {
    msg("Loading budget…");

    // months are fixed now, so no need to read grant dates
    months = FIXED_MONTHS.slice();

    const [lab, dir] = await Promise.all([
      client
        .from("budget_labor")
        .select("employee_name,category_id,ym,hours")
        .eq("grant_id", grantId),
      client
        .from("budget_direct")
        .select("category,description,ym,amount")
        .eq("grant_id", grantId),
    ]);

    if (lab.error) throw lab.error;
    if (dir.error) throw dir.error;

    laborRows = pivotLabor(lab.data || []);
    directRows = pivotDirect(dir.data || []);

    renderMonthHeaders();
    renderLabor();
    renderDirect();
    msg("");
  } catch (e) {
    console.error("loadBudgetForGrant error", e);
    msg(e.message || String(e), true);
  }
}

// ---- pivot (DB -> UI) ----
function pivotLabor(rows) {
  const map = new Map(); // key: employee_name||category_id
  rows.forEach((r) => {
    const key = `${r.employee_name || ""}||${r.category_id || ""}`;
    if (!map.has(key)) {
      map.set(key, {
        employee_id: null,
        employee_name: r.employee_name || "",
        category_id: r.category_id || null,
        months: {},
      });
    }
    const ymIso = new Date(r.ym).toISOString().slice(0, 10);
    map.get(key).months[ymIso] = r.hours ?? null;
  });

  const arr = Array.from(map.values());
  arr.forEach((r) => {
    // infer employee_id from category_id if possible
    if (r.category_id && laborCatById.has(r.category_id)) {
      r.employee_id = r.category_id;
      r.employee_name = laborCatById.get(r.category_id).name;
    }
    ensureMonthKeys(r.months);
  });
  return arr;
}

function pivotDirect(rows) {
  const map = new Map(); // key: category||description
  rows.forEach((r) => {
    const key = `${r.category || ""}||${r.description || ""}`;
    if (!map.has(key)) {
      map.set(key, {
        category: r.category || DIRECT_CATS[0],
        description: r.description || "",
        months: {},
      });
    }
    const ymIso = new Date(r.ym).toISOString().slice(0, 10);
    map.get(key).months[ymIso] = r.amount ?? null;
  });

  const arr = Array.from(map.values());
  arr.forEach((r) => ensureMonthKeys(r.months));
  return arr;
}

// ---- rendering headers ----
function renderMonthHeaders() {
  const lh = $("#laborHeaderRow", rootEl);
  const dh = $("#directHeaderRow", rootEl);
  if (!lh || !dh) return;

  lh.innerHTML = `
    <th style="min-width:14rem;">Employee</th>
    <th style="min-width:14rem;">Position</th>
    <th style="min-width:6rem;text-align:right;">Rate ($/hr)</th>
    ${months
      .map(
        (m) =>
          `<th style="min-width:4.5rem;text-align:right;">${esc(
            fmtMonthLabel(m)
          )}</th>`
      )
      .join("")}
    <th>Remove</th>
  `;

  dh.innerHTML = `
    <th style="min-width:10rem;">Category</th>
    <th style="min-width:14rem;">Description</th>
    ${months
      .map(
        (m) =>
          `<th style="min-width:4.5rem;text-align:right;">${esc(
            fmtMonthLabel(m)
          )}</th>`
      )
      .join("")}
    <th>Remove</th>
  `;
}

// ---- rendering labor ----
function renderLabor() {
  const tbody = $("#laborBody", rootEl);
  if (!tbody) return;

  tbody.innerHTML = laborRows
    .map((row, i) => {
      const cat =
        (row.employee_id && laborCatById.get(row.employee_id)) ||
        (row.category_id && laborCatById.get(row.category_id)) ||
        null;
      const position = cat?.position ?? "";
      const rate = cat?.hourly_rate ?? "";

      const monthCells = months
        .map(
          (m) => `
        <td>
          <input
            type="number"
            class="input"
            style="width:4.5rem;text-align:right"
            data-kind="labor-month"
            data-row="${i}"
            data-month="${m}"
            value="${row.months[m] ?? ""}"
          >
        </td>
      `
        )
        .join("");

      return `
      <tr>
        <td>
          <select
            class="input"
            data-kind="labor-employee"
            data-row="${i}"
            style="min-width:14rem;"
          >
            <option value="">— Select employee —</option>
            ${laborCategories
              .map(
                (c) => `
                  <option value="${c.id}" ${
                    row.employee_id === c.id || row.category_id === c.id
                      ? "selected"
                      : ""
                  }>
                    ${esc(c.name)}
                  </option>
                `
              )
              .join("")}

          </select>
        </td>
        <td>
          <input
            type="text"
            class="input"
            style="min-width:14rem;"
            value="${esc(position)}"
            readonly
          >
        </td>
        <td>
          <input
            type="number"
            class="input"
            style="width:6rem;text-align:right"
            value="${rate}"
            readonly
          >
        </td>
        ${monthCells}
        <td>
          <button type="button" data-action="remove-labor" data-row="${i}">✕</button>
        </td>
      </tr>
    `;
    })
    .join("");

  // events for employee selection
  tbody.querySelectorAll('[data-kind="labor-employee"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.row);
      if (!Number.isInteger(idx) || !laborRows[idx]) return;
      const id = e.target.value || null;
      laborRows[idx].employee_id = id;
      laborRows[idx].category_id = id; // store in DB as category_id
      const cat = id ? laborCatById.get(id) : null;
      laborRows[idx].employee_name = cat?.name || "";

      const tr = e.target.closest("tr");
      if (!tr) return;
      const tds = tr.querySelectorAll("td");
      if (tds[1]?.querySelector("input")) {
        tds[1].querySelector("input").value = cat?.position || "";
      }
      if (tds[2]?.querySelector("input")) {
        tds[2].querySelector("input").value =
          cat?.hourly_rate != null ? cat.hourly_rate : "";
      }
    });
  });

  // events for month hours
  tbody.querySelectorAll('[data-kind="labor-month"]').forEach((el) => {
    el.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.row);
      const ym = e.target.dataset.month;
      if (!Number.isInteger(idx) || !laborRows[idx] || !ym) return;
      const v = e.target.value === "" ? null : Number(e.target.value);
      laborRows[idx].months[ym] = isNaN(v) ? null : v;
    });
  });

  // remove row
  tbody.addEventListener(
    "click",
    (e) => {
      if (e.target?.dataset.action === "remove-labor") {
        const idx = Number(e.target.dataset.row);
        if (Number.isInteger(idx)) {
          laborRows.splice(idx, 1);
          renderLabor();
        }
      }
    },
    { once: true }
  );
}

// ---- rendering direct ----
function renderDirect() {
  const tbody = $("#directBody", rootEl);
  if (!tbody) return;

  tbody.innerHTML = directRows
    .map((row, i) => {
      const monthCells = months
        .map(
          (m) => `
        <td>
          <input
            type="number"
            class="input"
            style="width:4.5rem;text-align:right"
            data-kind="direct-month"
            data-row="${i}"
            data-month="${m}"
            value="${row.months[m] ?? ""}"
          >
        </td>
      `
        )
        .join("");

      return `
      <tr>
        <td>
          <select
            class="input"
            data-kind="direct-field"
            data-field="category"
            data-row="${i}"
            style="min-width:10rem;"
          >
            ${DIRECT_CATS.map(
              (c) => `
              <option value="${esc(c)}" ${
                row.category === c ? "selected" : ""
              }>${esc(c)}</option>
            `
            ).join("")}
          </select>
        </td>
        <td>
          <input
            type="text"
            class="input"
            style="min-width:14rem;"
            data-kind="direct-field"
            data-field="description"
            data-row="${i}"
            value="${esc(row.description)}"
            placeholder="Description"
          >
        </td>
        ${monthCells}
        <td>
          <button type="button" data-action="remove-direct" data-row="${i}">✕</button>
        </td>
      </tr>
    `;
    })
    .join("");

  tbody.querySelectorAll('[data-kind="direct-field"]').forEach((el) => {
    el.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.row);
      const field = e.target.dataset.field;
      if (!Number.isInteger(idx) || !directRows[idx] || !field) return;
      directRows[idx][field] = e.target.value || "";
    });
  });

  tbody.querySelectorAll('[data-kind="direct-month"]').forEach((el) => {
    el.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.row);
      const ym = e.target.dataset.month;
      if (!Number.isInteger(idx) || !directRows[idx] || !ym) return;
      const v = e.target.value === "" ? null : Number(e.target.value);
      directRows[idx].months[ym] = isNaN(v) ? null : v;
    });
  });

  tbody.addEventListener(
    "click",
    (e) => {
      if (e.target?.dataset.action === "remove-direct") {
        const idx = Number(e.target.dataset.row);
        if (Number.isInteger(idx)) {
          directRows.splice(idx, 1);
          renderDirect();
        }
      }
    },
    { once: true }
  );
}

// ---- save ----
async function saveBudget() {
  if (!currentGrantId) return msg("Select a grant first.", true);

  const laborInserts = [];
  laborRows.forEach((r) => {
    const hasEmployee = r.employee_id || r.employee_name?.trim();
    if (!hasEmployee) return;
    months.forEach((m) => {
      const v = r.months[m];
      if (
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !isNaN(Number(v))
      ) {
        laborInserts.push({
          grant_id: currentGrantId,
          employee_name: r.employee_name || null,
          category_id: r.category_id || r.employee_id || null,
          ym: m,
          hours: Number(v),
        });
      }
    });
  });

  const directInserts = [];
  directRows.forEach((r) => {
    const hasHeader = r.category?.trim() || r.description?.trim();
    if (!hasHeader) return;
    months.forEach((m) => {
      const v = r.months[m];
      if (
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !isNaN(Number(v))
      ) {
        directInserts.push({
          grant_id: currentGrantId,
          category: r.category || null,
          description: r.description || null,
          ym: m,
          amount: Number(v),
        });
      }
    });
  });

  try {
    msg("Saving…");
    const delLab = await client
      .from("budget_labor")
      .delete()
      .eq("grant_id", currentGrantId);
    if (delLab.error) throw delLab.error;

    const delDir = await client
      .from("budget_direct")
      .delete()
      .eq("grant_id", currentGrantId);
    if (delDir.error) throw delDir.error;

    if (laborInserts.length) {
      const insLab = await client.from("budget_labor").insert(laborInserts);
      if (insLab.error) throw insLab.error;
    }
    if (directInserts.length) {
      const insDir = await client.from("budget_direct").insert(directInserts);
      if (insDir.error) throw insDir.error;
    }

    msg("Budget saved.");
  } catch (e) {
    console.error("saveBudget error", e);
    msg(e.message || String(e), true);
  }
}

// ---- clear ----
function clearBudget() {
  laborRows = [];
  directRows = [];
  const lb = $("#laborBody", rootEl);
  const db = $("#directBody", rootEl);
  if (lb) lb.innerHTML = "";
  if (db) db.innerHTML = "";
}
