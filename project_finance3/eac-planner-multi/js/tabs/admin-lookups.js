// js/tabs/admin-lookups.js
// A simple CRUD admin for lookup tables: employees, vendors, equipment_catalog, materials_catalog, labor_roles.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Admin — Lookup Tables</h2>
      <div class="flex items-center gap-2">
        <select id="admTableSel" class="border rounded-md p-1">
          <option value="employees">Employees</option>
          <option value="vendors">Vendors (Subs)</option>
          <option value="equipment_catalog">Equipment Catalog</option>
          <option value="materials_catalog">Materials Catalog</option>
          <option value="labor_roles">Labor Roles</option>
        </select>
        <button id="admReload" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">Reload</button>
        <button id="admAdd" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">+ Add Row</button>
        <button id="admSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
        <button id="admDelete" class="px-3 py-1.5 rounded-md border text-red-600 hover:bg-red-50">Delete Selected</button>
      </div>
    </div>

    <div id="admMsg" class="text-sm text-slate-500"></div>

    <div class="overflow-x-auto">
      <table id="admTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>

    <p class="text-xs text-slate-500">
      Tip: Columns with gray background are read-only (e.g., computed “loaded_rate”).
      Edits save with an upsert on the table’s natural key (see mapping in this file).
    </p>
  </div>
`;

let state = {
  table: 'employees',
  rows: [],
  cols: [],          // [{key, label, type, readonly, pk, step}]
  pk: [],            // primary key column(s)
  loading: false,
  selected: new Set(), // ids or composite keys as string
};

/** Column definitions per table */
const TABLES = {
  employees: {
    label: 'Employees',
    table: 'employees',
    orderBy: 'full_name',
    cols: [
      { key: 'id',         label: 'ID (uuid)',    type: 'text', readonly: false, pk: true },
      { key: 'full_name',  label: 'Full Name',    type: 'text' },
      { key: 'role',       label: 'Role',         type: 'text' },
    ],
    // upsert keys:
    pk: ['id']
  },
  vendors: {
    label: 'Vendors (Subs)',
    table: 'vendors',
    orderBy: 'name',
    cols: [
      { key: 'id',   label: 'ID (uuid)', type: 'text', readonly: false, pk: true },
      { key: 'name', label: 'Name',      type: 'text' },
    ],
    pk: ['id']
  },
  equipment_catalog: {
    label: 'Equipment Catalog',
    table: 'equipment_catalog',
    orderBy: 'equipment_type',
    cols: [
      { key: 'equipment_type', label: 'Equipment Type', type: 'text', pk: true },
      { key: 'rate',           label: 'Rate',           type: 'number', step: '0.01' },
      { key: 'rate_unit',      label: 'Rate Unit',      type: 'text' }, // e.g., hour/day
    ],
    pk: ['equipment_type']
},

  materials_catalog: {
    label: 'Materials Catalog',
    table: 'materials_catalog',
    orderBy: 'sku',
    cols: [
      { key: 'sku',         label: 'SKU',         type: 'text', pk: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'unit_cost',   label: 'Unit Cost',   type: 'number', step: '0.01' },
      { key: 'waste_pct',   label: 'Waste % (0–1)', type: 'number', step: '0.01' },
    ],
    pk: ['sku']
  },
  labor_roles: {
    label: 'Labor Roles',
    table: 'labor_roles',
    orderBy: 'role',
    cols: [
      { key: 'role',          label: 'Role',           type: 'text', pk: true },
      { key: 'base_rate',     label: 'Base Rate',      type: 'number', step: '0.01' },
      { key: 'burden_pct',    label: 'Burden % (0–1)', type: 'number', step: '0.01' },
      { key: 'ot_multiplier', label: 'OT Multiplier',  type: 'number', step: '0.01' },
      { key: 'loaded_rate',   label: 'Loaded Rate (gen)', type: 'number', readonly: true },
    ],
    pk: ['role']
  }
};

export async function init() {
  // default table selection
  const sel = $('#admTableSel');
  sel.value = state.table;
  sel.addEventListener('change', async (e) => {
    state.table = e.target.value;
    await reload();
  });
  $('#admReload').onclick = reload;
  $('#admAdd').onclick = addRow;
  $('#admSave').onclick = saveAll;
  $('#admDelete').onclick = removeSelected;

  await reload();
}

/* ------------ Load & render ------------ */
async function reload() {
  const cfg = TABLES[state.table];
  state.cols = cfg.cols;
  state.pk = cfg.pk;
  state.selected = new Set();
  setMsg('Loading…');
  state.loading = true;
  try {
    let q = client.from(cfg.table).select(cfg.cols.map(c => c.key).join(','));
    if (cfg.orderBy) q = q.order(cfg.orderBy, { ascending: true });
    const { data, error } = await q.limit(1000);
    if (error) throw error;
    state.rows = (data || []).map(normalizeRow(cfg.cols));
    render();
    setMsg('');
  } catch (e) {
    console.error('Admin load error', e);
    setMsg('Error: ' + (e.message || String(e)));
    $('#admTable').innerHTML = '';
  } finally {
    state.loading = false;
  }
}

function render() {
  const table = $('#admTable');
  const cols = state.cols;

  let thead = '<thead><tr>';
  thead += '<th class="p-2"><input type="checkbox" id="admSelAll"></th>';
  cols.forEach(c => {
    thead += `<th class="p-2 text-left">${esc(c.label)}</th>`;
  });
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  state.rows.forEach((row, idx) => {
    const rowKey = pkValue(row, state.pk);
    const checked = state.selected.has(rowKey) ? 'checked' : '';
    tbody += `<tr data-idx="${idx}">`;
    tbody += `<td class="p-2"><input type="checkbox" class="admSel" ${checked}></td>`;
    cols.forEach(c => {
      const v = row[c.key] ?? '';
      if (c.readonly) {
        tbody += `<td class="p-1"><input class="cell border rounded-md p-1 w-48 bg-slate-50" data-k="${c.key}" value="${esc(String(v))}" disabled></td>`;
      } else {
        const type = c.type || 'text';
        const step = c.step ? ` step="${c.step}"` : '';
        tbody += `<td class="p-1">
          <input class="cell border rounded-md p-1 w-48" data-k="${c.key}" type="${type}"${step} value="${type==='number' && v!=='' ? String(Number(v)) : esc(String(v))}">
        </td>`;
      }
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;

  // Wire selects & edits
  $('#admSelAll').addEventListener('change', (e) => {
    const boxes = table.querySelectorAll('.admSel');
    boxes.forEach(b => (b.checked = e.target.checked));
    recomputeSelection();
  });
  table.querySelectorAll('.admSel').forEach(box => {
    box.addEventListener('change', recomputeSelection);
  });
  table.querySelectorAll('input.cell').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      const key = e.target.getAttribute('data-k');
      let val = e.target.type === 'number'
        ? (e.target.value === '' ? '' : Number(e.target.value))
        : e.target.value;
      // basic normalization
      if (typeof val === 'number' && !Number.isFinite(val)) val = 0;
      state.rows[idx][key] = val;
      // don’t re-render on each change: keep the caret in place
    });
    // quality-of-life: prevent Enter from jumping
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });
}

function recomputeSelection() {
  const table = $('#admTable');
  const rows = table.querySelectorAll('tbody tr');
  state.selected.clear();
  rows.forEach(tr => {
    const idx = Number(tr.getAttribute('data-idx'));
    const box = tr.querySelector('.admSel');
    if (box && box.checked) {
      state.selected.add(pkValue(state.rows[idx], state.pk));
    }
  });
}

/* ------------ Actions ------------ */
function addRow() {
  const blank = {};
  state.cols.forEach(c => blank[c.key] = '');
  state.rows.unshift(blank);
  render();
}

async function saveAll() {
  if (state.loading) return;
  const cfg = TABLES[state.table];
  setMsg('Saving…');
  try {
    // Make a shallow copy and coerce numeric fields
    const cleaned = state.rows.map(r => {
      const x = { ...r };
      cfg.cols.forEach(c => {
        if (c.type === 'number' && x[c.key] !== '') {
          x[c.key] = Number(x[c.key]);
          if (!Number.isFinite(x[c.key])) x[c.key] = 0;
        }
      });
      return x;
    });

    const { error } = await client
      .from(cfg.table)
      .upsert(cleaned, { onConflict: cfg.pk.join(','), ignoreDuplicates: false });
    if (error) throw error;

    setMsg('Saved.');
    setTimeout(() => setMsg(''), 1200);
    await reload();
  } catch (e) {
    console.error('Admin save error', e);
    setMsg('Save failed: ' + (e.message || String(e)));
  }
}

async function removeSelected() {
  if (!state.selected.size) { setMsg('Select at least one row.'); return; }
  const cfg = TABLES[state.table];
  setMsg('Deleting…');
  try {
    // Delete by PK(s). We’ll loop because composite keys vary by table.
    for (const keyStr of state.selected) {
      const where = pkFilterFromKey(keyStr, cfg.pk);
      let q = client.from(cfg.table).delete();
      Object.keys(where).forEach(k => { q = q.eq(k, where[k]); });
      const { error } = await q;
      if (error) throw error;
    }
    setMsg('Deleted.');
    setTimeout(() => setMsg(''), 1200);
    await reload();
  } catch (e) {
    console.error('Admin delete error', e);
    setMsg('Delete failed: ' + (e.message || String(e)));
  }
}

/* ------------ helpers ------------ */
function normalizeRow(cols) {
  return (r) => {
    const x = {};
    cols.forEach(c => { x[c.key] = r[c.key]; });
    return x;
  };
}

function pkValue(row, pk) {
  return pk.map(k => String(row[k] ?? '')).join('│'); // safe composite key delimiter
}
function pkFilterFromKey(keyStr, pk) {
  const parts = keyStr.split('│');
  const obj = {};
  pk.forEach((k, i) => obj[k] = parts[i]);
  return obj;
}

function setMsg(t) { $('#admMsg').textContent = t || ''; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
