// js/tabs/editData.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>Edit Reference Data</h3>
    <p style="font-size:0.9rem;">
      Manage employees, subcontractors, materials, equipment, and ODC categories.
      Changes are saved directly to Supabase.
    </p>

    <!-- === EMPLOYEES === -->
    <details open class="data-section">
      <summary><strong>Employees</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="empAdd" type="button" class="btn btn-sm" style="margin-right:0.5rem;">+ Add Employee</button>
          <button id="empSave" type="button" class="btn btn-sm">Save Employees</button>
        </div>
        <div class="scroll-x">
          <table id="empTable" class="app-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Hourly Rate</th>
                <th>Burden %</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody id="empBody"></tbody>
          </table>
        </div>
      </div>
    </details>

    <!-- === SUBCONTRACTORS === -->
    <details class="data-section" style="margin-top:0.75rem;">
      <summary><strong>Subcontractors</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="subsAdd" type="button" class="btn btn-sm" style="margin-right:0.5rem;">+ Add Sub</button>
          <button id="subsSave" type="button" class="btn btn-sm">Save Subs</button>
        </div>
        <div class="scroll-x">
          <table id="subsTable" class="app-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody id="subsBody"></tbody>
          </table>
        </div>
      </div>
    </details>

    <!-- === MATERIALS === -->
    <details class="data-section" style="margin-top:0.75rem;">
      <summary><strong>Materials</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="matAdd" type="button" class="btn btn-sm" style="margin-right:0.5rem;">+ Add Material</button>
          <button id="matSave" type="button" class="btn btn-sm">Save Materials</button>
        </div>
        <div class="scroll-x">
          <table id="matTable" class="app-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody id="matBody"></tbody>
          </table>
        </div>
      </div>
    </details>

    <!-- === EQUIPMENT === -->
    <details class="data-section" style="margin-top:0.75rem;">
      <summary><strong>Equipment</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="eqAdd" type="button" class="btn btn-sm" style="margin-right:0.5rem;">+ Add Equipment</button>
          <button id="eqSave" type="button" class="btn btn-sm">Save Equipment</button>
        </div>
        <div class="scroll-x">
          <table id="eqTable" class="app-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody id="eqBody"></tbody>
          </table>
        </div>
      </div>
    </details>

    <!-- === ODC CATEGORIES === -->
    <details class="data-section" style="margin-top:0.75rem;">
      <summary><strong>ODC Categories</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="odcAdd" type="button" class="btn btn-sm" style="margin-right:0.5rem;">+ Add ODC Category</button>
          <button id="odcSave" type="button" class="btn btn-sm">Save ODC</button>
        </div>
        <div class="scroll-x">
          <table id="odcTable" class="app-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody id="odcBody"></tbody>
          </table>
        </div>
      </div>
    </details>

    <small id="msg" style="display:block;margin-top:0.75rem;"></small>

    <!-- === APP-STYLE COMPACT & STICKY === -->
    <style>
      .data-section {
        border: 1px solid #ddd;
        border-radius: 6px;
        margin-bottom: 0.5rem;
        overflow: hidden;
      }

      .ref-wrapper {
        padding: 0.5rem;
        background: #fafafa;
      }

      .scroll-x {
        overflow-x: auto;
        max-height: 60vh;
        overflow-y: auto;
      }

      .app-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }

      .app-table thead th,
      .app-table tbody td {
        padding: 0.15rem 0.35rem;
        line-height: 1.1;
        border-bottom: 1px solid #eee;
        text-align: left;
      }

      .app-table thead th {
        position: sticky;
        top: 0;
        background: #eef2ff;
        z-index: 5;
        font-weight: 600;
        box-shadow: 0 2px 2px -1px rgba(0,0,0,0.1);
      }

      .app-input,
      .app-number {
        width: 100%;
        height: 1.7rem;
        padding: 0 0.35rem;
        font-size: 0.85rem;
        box-sizing: border-box;
        margin: 0;
      }

      .app-number {
        text-align: right;
      }

      .app-number::-webkit-inner-spin-button,
      .app-number::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .app-number {
        -moz-appearance: textfield;
      }

      input[type="checkbox"] {
        transform: scale(1.1);
        margin: 0 auto;
        display: block;
      }

      .btn.btn-sm {
        font-size: 0.8rem;
        padding: 0.15rem 0.5rem;
      }
    </style>
  </article>
`;

/* ---------------- STATE ---------------- */
let rootEl = null;
let employees = [];
let subs = [];
let materials = [];
let equipment = [];
let odc = [];

/* ---------------- HELPERS ---------------- */
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

const esc = (x) =>
  (x ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;");

/* ---------------- INIT ---------------- */
export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;

  await Promise.all([
    loadEmployees(),
    loadSubs(),
    loadMaterials(),
    loadEquipment(),
    loadOdc(),
  ]);

  renderEmployees();
  renderSubs();
  renderMaterials();
  renderEquipment();
  renderOdc();

  wireActions();
}

/* ---------------- LOADERS ---------------- */
async function loadEmployees() {
  const { data, error } = await client
    .from("labor_categories")
    .select("id, name, position, hourly_rate, burden_pct, is_active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[editData] loadEmployees error", error);
    msg(error.message, true);
    employees = [];
    return;
  }
  employees = data || [];
}

async function loadSubs() {
  const { data, error } = await client
    .from("subs")
    .select("id, name, description, is_active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[editData] loadSubs error", error);
    msg(error.message, true);
    subs = [];
    return;
  }
  subs = data || [];
}

async function loadMaterials() {
  const { data, error } = await client
    .from("materials")
    .select("id, name, description, is_active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[editData] loadMaterials error", error);
    msg(error.message, true);
    materials = [];
    return;
  }
  materials = data || [];
}

async function loadEquipment() {
  const { data, error } = await client
    .from("equipment")
    .select("id, name, description, is_active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[editData] loadEquipment error", error);
    msg(error.message, true);
    equipment = [];
    return;
  }
  equipment = data || [];
}

async function loadOdc() {
  const { data, error } = await client
    .from("odc_categories")
    .select("id, name, description, is_active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[editData] loadOdc error", error);
    msg(error.message, true);
    odc = [];
    return;
  }
  odc = data || [];
}

/* ---------------- RENDERERS ---------------- */
function renderEmployees() {
  const tb = $("#empBody", rootEl);
  if (!tb) return;
  tb.innerHTML = "";
  employees.forEach((e, idx) => {
    const tr = h(`<tr data-row="${idx}"></tr>`);
    tr.innerHTML = `
      <td><input type="text" class="app-input" data-kind="emp" data-field="name" data-index="${idx}" value="${esc(e.name || "")}"></td>
      <td><input type="text" class="app-input" data-kind="emp" data-field="position" data-index="${idx}" value="${esc(e.position || "")}"></td>
      <td><input type="number" step="0.01" class="app-number" data-kind="emp" data-field="hourly_rate" data-index="${idx}" value="${esc(e.hourly_rate ?? "")}"></td>
      <td><input type="number" step="0.1" class="app-number" data-kind="emp" data-field="burden_pct" data-index="${idx}" value="${esc(e.burden_pct ?? "")}"></td>
      <td style="text-align:center;"><input type="checkbox" data-kind="emp" data-field="is_active" data-index="${idx}" ${e.is_active ? "checked" : ""}></td>
    `;
    tb.appendChild(tr);
  });
  tb.querySelectorAll("input[data-kind='emp']").forEach(inp => {
    inp.addEventListener("input", onEmpChange);
    if (inp.type === "checkbox") inp.addEventListener("change", onEmpChange);
  });
}

function renderSubs() {
  const tb = $("#subsBody", rootEl);
  if (!tb) return;
  tb.innerHTML = "";
  subs.forEach((s, idx) => {
    const tr = h(`<tr data-row="${idx}"></tr>`);
    tr.innerHTML = `
      <td><input type="text" class="app-input" data-kind="subs" data-field="name" data-index="${idx}" value="${esc(s.name || "")}"></td>
      <td><input type="text" class="app-input" data-kind="subs" data-field="description" data-index="${idx}" value="${esc(s.description || "")}"></td>
      <td style="text-align:center;"><input type="checkbox" data-kind="subs" data-field="is_active" data-index="${idx}" ${s.is_active ? "checked" : ""}></td>
    `;
    tb.appendChild(tr);
  });
  tb.querySelectorAll("input[data-kind='subs']").forEach(inp => {
    inp.addEventListener("input", onSubsChange);
    if (inp.type === "checkbox") inp.addEventListener("change", onSubsChange);
  });
}

function renderMaterials() {
  const tb = $("#matBody", rootEl);
  if (!tb) return;
  tb.innerHTML = "";
  materials.forEach((m, idx) => {
    const tr = h(`<tr data-row="${idx}"></tr>`);
    tr.innerHTML = `
      <td><input type="text" class="app-input" data-kind="mat" data-field="name" data-index="${idx}" value="${esc(m.name || "")}"></td>
      <td><input type="text" class="app-input" data-kind="mat" data-field="description" data-index="${idx}" value="${esc(m.description || "")}"></td>
      <td style="text-align:center;"><input type="checkbox" data-kind="mat" data-field="is_active" data-index="${idx}" ${m.is_active ? "checked" : ""}></td>
    `;
    tb.appendChild(tr);
  });
  tb.querySelectorAll("input[data-kind='mat']").forEach(inp => {
    inp.addEventListener("input", onMatChange);
    if (inp.type === "checkbox") inp.addEventListener("change", onMatChange);
  });
}

function renderEquipment() {
  const tb = $("#eqBody", rootEl);
  if (!tb) return;
  tb.innerHTML = "";
  equipment.forEach((e, idx) => {
    const tr = h(`<tr data-row="${idx}"></tr>`);
    tr.innerHTML = `
      <td><input type="text" class="app-input" data-kind="eq" data-field="name" data-index="${idx}" value="${esc(e.name || "")}"></td>
      <td><input type="text" class="app-input" data-kind="eq" data-field="description" data-index="${idx}" value="${esc(e.description || "")}"></td>
      <td style="text-align:center;"><input type="checkbox" data-kind="eq" data-field="is_active" data-index="${idx}" ${e.is_active ? "checked" : ""}></td>
    `;
    tb.appendChild(tr);
  });
  tb.querySelectorAll("input[data-kind='eq']").forEach(inp => {
    inp.addEventListener("input", onEqChange);
    if (inp.type === "checkbox") inp.addEventListener("change", onEqChange);
  });
}

function renderOdc() {
  const tb = $("#odcBody", rootEl);
  if (!tb) return;
  tb.innerHTML = "";
  odc.forEach((o, idx) => {
    const tr = h(`<tr data-row="${idx}"></tr>`);
    tr.innerHTML = `
      <td><input type="text" class="app-input" data-kind="odc" data-field="name" data-index="${idx}" value="${esc(o.name || "")}"></td>
      <td><input type="text" class="app-input" data-kind="odc" data-field="description" data-index="${idx}" value="${esc(o.description || "")}"></td>
      <td style="text-align:center;"><input type="checkbox" data-kind="odc" data-field="is_active" data-index="${idx}" ${o.is_active ? "checked" : ""}></td>
    `;
    tb.appendChild(tr);
  });
  tb.querySelectorAll("input[data-kind='odc']").forEach(inp => {
    inp.addEventListener("input", onOdcChange);
    if (inp.type === "checkbox") inp.addEventListener("change", onOdcChange);
  });
}

/* ---------------- CHANGE HANDLERS ---------------- */
function onEmpChange(e) {
  const idx = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (employees[idx] == null) return;

  if (field === "is_active") {
    employees[idx].is_active = e.target.checked;
  } else if (field === "hourly_rate" || field === "burden_pct") {
    const v = e.target.value;
    employees[idx][field] = v === "" ? null : Number(v);
  } else {
    employees[idx][field] = e.target.value;
  }
}

function onSubsChange(e) {
  const idx = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (subs[idx] == null) return;

  if (field === "is_active") {
    subs[idx].is_active = e.target.checked;
  } else {
    subs[idx][field] = e.target.value;
  }
}

function onMatChange(e) {
  const idx = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (materials[idx] == null) return;

  if (field === "is_active") {
    materials[idx].is_active = e.target.checked;
  } else {
    materials[idx][field] = e.target.value;
  }
}

function onEqChange(e) {
  const idx = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (equipment[idx] == null) return;

  if (field === "is_active") {
    equipment[idx].is_active = e.target.checked;
  } else {
    equipment[idx][field] = e.target.value;
  }
}

function onOdcChange(e) {
  const idx = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (odc[idx] == null) return;

  if (field === "is_active") {
    odc[idx].is_active = e.target.checked;
  } else {
    odc[idx][field] = e.target.value;
  }
}

/* ---------------- ACTIONS / SAVE ---------------- */
function wireActions() {
  $("#empAdd", rootEl).onclick = () => {
    employees.push({
      id: null,
      name: "",
      position: "",
      hourly_rate: null,
      burden_pct: 155,
      is_active: true,
    });
    renderEmployees();
  };

  $("#subsAdd", rootEl).onclick = () => {
    subs.push({ id: null, name: "", description: "", is_active: true });
    renderSubs();
  };

  $("#matAdd", rootEl).onclick = () => {
    materials.push({ id: null, name: "", description: "", is_active: true });
    renderMaterials();
  };

  $("#eqAdd", rootEl).onclick = () => {
    equipment.push({ id: null, name: "", description: "", is_active: true });
    renderEquipment();
  };

  $("#odcAdd", rootEl).onclick = () => {
    odc.push({ id: null, name: "", description: "", is_active: true });
    renderOdc();
  };

  $("#empSave", rootEl).onclick = saveEmployees;
  $("#subsSave", rootEl).onclick = saveSubs;
  $("#matSave", rootEl).onclick = saveMaterials;
  $("#eqSave", rootEl).onclick = saveEquipment;
  $("#odcSave", rootEl).onclick = saveOdc;
}

/* ---------------- SAVE FUNCTIONS ---------------- */
async function saveEmployees() {
  msg("Saving employees…");
  try {
    const cleaned = employees.filter((e) => (e.name || "").trim() !== "");
    const existing = cleaned.filter((e) => e.id);
    const toInsert = cleaned.filter((e) => !e.id);

    if (existing.length) {
      const { error } = await client
        .from("labor_categories")
        .upsert(existing, { onConflict: "id" });
      if (error) throw error;
    }
    if (toInsert.length) {
      const insertRows = toInsert.map(({ id, created_at, ...rest }) => rest);
      const { error } = await client
        .from("labor_categories")
        .insert(insertRows);
      if (error) throw error;
    }

    await loadEmployees();
    renderEmployees();
    msg("Employees saved.");
  } catch (e) {
    console.error("[editData] saveEmployees error", e);
    msg(e.message || String(e), true);
  }
}

async function genericSave(table, state, label) {
  msg(`Saving ${label}…`);
  try {
    const cleaned = state.filter((r) => (r.name || "").trim() !== "");
    const existing = cleaned.filter((r) => r.id);
    const toInsert = cleaned.filter((r) => !r.id);

    if (existing.length) {
      const { error } = await client
        .from(table)
        .upsert(existing, { onConflict: "id" });
      if (error) throw error;
    }
    if (toInsert.length) {
      const insertRows = toInsert.map(({ id, created_at, ...rest }) => rest);
      const { error } = await client.from(table).insert(insertRows);
      if (error) throw error;
    }

    msg(`${label} saved.`);
    return true;
  } catch (e) {
    console.error(`[editData] save ${label} error`, e);
    msg(e.message || String(e), true);
    return false;
  }
}

async function saveSubs() {
  if (await genericSave("subs", subs, "Subcontractors")) {
    await loadSubs();
    renderSubs();
  }
}

async function saveMaterials() {
  if (await genericSave("materials", materials, "Materials")) {
    await loadMaterials();
    renderMaterials();
  }
}

async function saveEquipment() {
  if (await genericSave("equipment", equipment, "Equipment")) {
    await loadEquipment();
    renderEquipment();
  }
}

async function saveOdc() {
  if (await genericSave("odc_categories", odc, "ODC categories")) {
    await loadOdc();
    renderOdc();
  }
}
