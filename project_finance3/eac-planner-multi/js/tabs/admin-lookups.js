// js/tabs/admin-lookups.js
// Admin CRUD for lookup tables; equipment_catalog handled dynamically.

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
      Tip: Gray columns are read-only. Edits save via upsert on the table’s natural key.
    </p>
  </div>
`;

let state = {
  table: 'employees',
  rows: [],
  cols: [],     // [{key, label, type, readonly, pk, step}]
  pk: [],       // primary key column(s)
  loading: false,
  selected: new Set(),
};

/** Static table configs (equipment_catalog is dynamic) */
const TABLES = {
  employees: {
    table: 'employees', orderBy: 'full_name', pk: ['id'],
    cols: [
      { key: 'id',         label: 'ID (uuid)',    type: 'text', pk: true },
      { key: 'full_name',  label: 'Full Name',    type: 'text' },
      { key: 'role',       label: 'Role',         type: 'text' },
    ]
  },
  vendors: {
    table: 'vendors', orderBy: 'name', pk: ['id'],
    cols: [
      { key: 'id',   label: 'ID (uuid)', type: 'text', pk: true },
      { key: 'name', label: 'Name',      type: 'text' },
    ]
  },
  equipment_catalog: {
    // dynamic; filled at runtime based on actual columns
    table: 'equipment_catalog', orderBy: null, pk: ['__dynamic__'], cols: []
  },
  materials_catalog: {
    table: 'materials_catalog', orderBy: 'sku', pk: ['sku'],
    cols: [
      { key: 'sku',         label: 'SKU',         type: 'text', pk: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'unit_cost',   label: 'Unit Cost',   type: 'number', step: '0.01' },
      { key: 'waste_pct',   label: 'Waste % (0–1)', type: 'number', step: '0.01' },
    ]
  },
  labor_roles: {
    table: 'labor_roles', orderBy: 'role', pk: ['role'],
    cols: [
      { key: 'role',          label: 'Role',           type: 'text', pk: true },
      { key: 'base_rate',     label: 'Base Rate',      type: 'number', step: '0.01' },
      { key: 'burden_pct',    label: 'Burden % (0–1)', type: 'number', step: '0.01' },
      { key: 'ot_multiplier', label: 'OT Multiplier',  type: 'number', step: '0.01' },
      { key: 'loaded_rate',   label: 'Loaded Rate (gen)', type: 'number', readonly: true },
    ]
  }
};

export async function init() {
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

/* -------------------- Equipment dynamic config -------------------- */
const EQUIP_LABEL_CANDIDATES = [
  'equipment_type','equip_type','type','name','description','title','equipment','equip','model','item','item_name','code','sku'
];

function looksNumeric(v) {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'number') return true;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return true;
  return false;
}

function guessColumnsFromData(rows) {
  // union of keys across rows
  const keys = new Set();
  for (const r of rows) Object.keys(r || {}).forEach(k => keys.add(k));
  return Array.from(keys);
}

function pickLabelColumn(keys, sampleRow) {
  for (const k of EQUIP_LABEL_CANDIDATES) if (keys.includes(k)) return k;
  // else first string-ish column
  const strKey = keys.find(k => typeof (sampleRow?.[k]) === 'string');
  if (strKey) return strKey;
  // else first column
  return keys[0] || 'name';
}

function buildCols(keys, sampleRow, labelKey) {
  return keys.map(k => {
    const isLabel = (k === labelKey);
    const v = sampleRow?.[k];
    const isNum = looksNumeric(v);
    return {
      key: k,
      label: k.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
      type: isNum ? 'number' : 'text',
      step: isNum ? '0.01' : undefined,
      pk: isLabel, // treat label column as the natural key
      readonly: false
    };
  });
}

async function configureEquipmentTable() {
  // load some rows (all columns)
  const { data, error } = await client.from('equipment_catalog').select('*').limit(1000);
  if (error) throw error;

  const rows = data || [];
  const keys = rows.length ? guessColumnsFromData(rows) : ['name','rate','rate_unit']; // fallback if empty table
  const sample = rows[0] || {};
  const labelKey = pickLabelColumn(keys, sample);

  const cfg = TABLES.equipment_catalog;
  cfg.orderBy = labelKey || null;
  cfg.pk = [labelKey];
  cfg.cols = buildCols(keys, sample, labelKey);

  return { rows, cfg };
}

/* ------------------------- Load & render ------------------------- */
async function reload() {
  setMsg('Loading…');
  state.loading = true;
  state.selected = new Set();

  try {
    let cfg = TABLES[state.table];
    let rows;

    if (state.table === 'equipment_catalog') {
      // dynamic: we already fetched rows inside configurator
      const res = await configureEquipmentTable();
      cfg = res.cfg;
      rows = res.rows;
    } else {
      // static tables: select only the defined columns
      const selectList = cfg.cols.map(c => c.key).join(',');
      let q = client.from(cfg.table).select(selectList).limit(1000);
      if (cfg.orderBy) q = q.order(cfg.orderBy, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      rows = data || [];
    }

    state.cols = cfg.cols;
    state.pk   = cfg.pk;
    state.rows = (rows || []).map(normalizeRow(state.cols));

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
  cols.forEach(c => { thead += `<th class="p-2 text-left">${esc(c.label)}</th>`; });
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
        const val  = (type === 'number' && v !== '') ? String(Number(v)) : esc(String(v));
        tbody += `<td class="p-1">
          <input class="cell border rounded-md p-1 w-48" data-k="${c.key}" type="${type}"${step} value="${val}">
        </td>`;
      }
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;

  // handlers
  $('#admSelAll').addEventListener('change', (e) => {
    const boxes = table.querySelectorAll('.admSel');
    boxes.forEach(b => (b.checked = e.target.checked));
    recomputeSelection();
  });
  table.querySelectorAll('.admSel').forEach(b => b.addEventListener('change', recomputeSelection));
  table.querySelectorAll('input.cell').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      const key = e.target.getAttribute('data-k');
      let val = e.target.type === 'number'
        ? (e.target.value === '' ? '' : Number(e.target.value))
        : e.target.value;
      if (typeof val === 'number' && !Number.isFinite(val)) val = 0;
      state.rows[idx][key] = val;
    });
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
    if (box && box.checked) state.selected.add(pkValue(state.rows[idx], state.pk));
  });
}

/* --------------------------- Actions --------------------------- */
function addRow() {
  const blank = {};
  state.cols.forEach(c => (blank[c.key] = ''));
  state.rows.unshift(blank);
  render();
}

async function saveAll() {
  if (state.loading) return;
  const cfg = TABLES[state.table];
  setMsg('Saving…');
  try {
    const cleaned = state.rows.map(r => {
      const x = { ...r };
      state.cols.forEach(c => {
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

/* --------------------------- helpers --------------------------- */
function normalizeRow(cols) {
  return (r) => {
    const x = {};
    cols.forEach(c => { x[c.key] = r[c.key]; });
    return x;
  };
}
function pkValue(row, pk) {
  return pk.map(k => String(row[k] ?? '')).join('│');
}
function pkFilterFromKey(keyStr, pk) {
  const parts = keyStr.split('│');
  const obj = {};
  pk.forEach((k, i) => (obj[k] = parts[i]));
  return obj;
}
function setMsg(t) { $('#admMsg').textContent = t || ''; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
