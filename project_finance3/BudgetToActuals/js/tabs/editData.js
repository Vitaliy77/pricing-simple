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
    <details open>
      <summary><strong>Employees</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="empAdd" type="button" style="font-size:0.8rem;margin-right:0.5rem;">+ Add Employee</button>
          <button id="empSave" type="button" style="font-size:0.8rem;">Save Employees</button>
        </div>
        <div class="scroll-x">
          <table id="empTable">
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
    <details style="margin-top:0.75rem;">
      <summary><strong>Subcontractors</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="subsAdd" type="button" style="font-size:0.8rem;margin-right:0.5rem;">+ Add Sub</button>
          <button id="subsSave" type="button" style="font-size:0.8rem;">Save Subs</button>
        </div>
        <div class="scroll-x">
          <table id="subsTable">
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
    <details style="margin-top:0.75rem;">
      <summary><strong>Materials</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="matAdd" type="button" style="font-size:0.8rem;margin-right:0.5rem;">+ Add Material</button>
          <button id="matSave" type="button" style="font-size:0.8rem;">Save Materials</button>
        </div>
        <div class="scroll-x">
          <table id="matTable">
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
    <details style="margin-top:0.75rem;">
      <summary><strong>Equipment</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="eqAdd" type="button" style="font-size:0.8rem;margin-right:0.5rem;">+ Add Equipment</button>
          <button id="eqSave" type="button" style="font-size:0.8rem;">Save Equipment</button>
        </div>
        <div class="scroll-x">
          <table id="eqTable">
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
    <details style="margin-top:0.75rem;">
      <summary><strong>ODC Categories</strong></summary>
      <div class="ref-wrapper">
        <div style="margin-bottom:0.5rem;">
          <button id="odcAdd" type="button" style="font-size:0.8rem;margin-right:0.5rem;">+ Add ODC Category</button>
          <button id="odcSave" type="button" style="font-size:0.8rem;">Save ODC</button>
        </div>
        <div class="scroll-x">
          <table id="odcTable">
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

    <!-- === STICKY HEADER CSS === -->
    <style>
      .ref-wrapper {
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 0.5rem;
        background: #fafafa;
      }
      .scroll-x {
        overflow-x: auto;
        max-height: 60vh;
        overflow-y: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      th, td {
        padding: 0.35rem 0.5rem;
        border-bottom: 1px solid #eee;
        text-align: left;
      }
      thead th {
        position: sticky;
        top: 0;
        background: #eef2ff;
        z-index: 5;
        font-weight: 600;
        box-shadow: 0 2px 2px -1px rgba(0,0,0,0.1);
      }
      input[type="text"],
      input[type="number"] {
        width: 100%;
        padding: 0.2rem 0.35rem;
        font-size: 0.85rem;
        box-sizing: border-box;
      }
      input[type="checkbox"] {
        transform: scale(1.1);
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
// ... (loadEmployees, loadSubs, etc. — unchanged)

/* ---------------- RENDERERS ---------------- */
function renderEmployees() {
  const tb = $("#empBody", rootEl);
  if (!tb) return;
  tb.innerHTML = "";

  employees.forEach((e, idx) => {
    const tr = h(`<tr data-row="${idx}"></tr>`);
    tr.innerHTML = `
      <td><input type="text" data-kind="emp" data-field="name" data-index="${idx}" value="${esc(e.name || "")}"></td>
      <td><input type="text" data-kind="emp" data-field="position" data-index="${idx}" value="${esc(e.position || "")}"></td>
      <td><input type="number" step="0.01" data-kind="emp" data-field="hourly_rate" data-index="${idx}" value="${esc(e.hourly_rate ?? "")}"></td>
      <td><input type="number" step="0.1" data-kind="emp" data-field="burden_pct" data-index="${idx}" value="${esc(e.burden_pct ?? "")}"></td>
      <td style="text-align:center;"><input type="checkbox" data-kind="emp" data-field="is_active" data-index="${idx}" ${e.is_active ? "checked" : ""}></td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("input[data-kind='emp']").forEach(inp => {
    inp.addEventListener("input", onEmpChange);
    if (inp.type === "checkbox") inp.addEventListener("change", onEmpChange);
  });
}

// Repeat pattern for renderSubs, renderMaterials, renderEquipment, renderOdc
// (Only change: use innerHTML for simplicity — same logic)

function renderSubs() {
  const tb = $("#subsBody", rootEl);
  if (!tb) return;
  tb.innerHTML = "";
  subs.forEach((s, idx) => {
    const tr = h(`<tr data-row="${idx}"></tr>`);
    tr.innerHTML = `
      <td><input type="text" data-kind="subs" data-field="name" data-index="${idx}" value="${esc(s.name || "")}"></td>
      <td><input type="text" data-kind="subs" data-field="description" data-index="${idx}" value="${esc(s.description || "")}"></td>
      <td style="text-align:center;"><input type="checkbox" data-kind="subs" data-field="is_active" data-index="${idx}" ${s.is_active ? "checked" : ""}></td>
    `;
    tb.appendChild(tr);
  });
  tb.querySelectorAll("input[data-kind='subs']").forEach(inp => {
    inp.addEventListener("input", onSubsChange);
    if (inp.type === "checkbox") inp.addEventListener("change", onSubsChange);
  });
}

// ... repeat for materials, equipment, odc (same pattern)

/* ---------------- CHANGE HANDLERS ---------------- */
// ... (onEmpChange, onSubsChange, etc. — unchanged)

/* ---------------- ACTIONS / SAVE ---------------- */
function wireActions() {
  $("#empAdd", rootEl).onclick = () => {
    employees.push({ id: null, name: "", position: "", hourly_rate: null, burden_pct: 155, is_active: true });
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
// ... (saveEmployees, genericSave, saveSubs, etc. — unchanged)
