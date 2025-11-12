// js/tabs/budget.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;   // { id: number }
let laborData = [];
let directData = [];
let months = [];           // ['2024-03-01', ...] (first-of-month ISO strings)

// If your schema uses a different set, adjust here
const EXPENSE_CATEGORIES = [
  'Travel', 'Licenses', 'Computers', 'Software', 'Office Supplies',
  'Training', 'Consultants', 'Marketing', 'Events', 'Insurance'
];

/* -------------------------- Utilities -------------------------- */

// Convert 'YYYY-MM-01' -> 'YYYY_MM' (matches typical wide-column names)
function monthToKey(monthIsoFirstDay) {
  // example: '2024-03-01' -> '2024_03'
  return monthIsoFirstDay.slice(0, 7).replace('-', '_');
}

// Safe text helper
function esc(x) {
  return (x ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// Set message with color
function msg(txt, isError = false) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  el.className = isError
    ? 'text-sm text-red-600'
    : 'text-sm text-green-600';
  if (txt) setTimeout(() => { if (el.textContent === txt) el.textContent = ''; }, 4000);
}

/* -------------------------- Template -------------------------- */

export const template = /*html*/`
  <div class="card space-y-8">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold text-slate-800">Budget Entry</h2>
      <select id="grantSelect" class="input text-sm w-80"></select>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- Labor -->
    <div>
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-semibold text-slate-700">Labor</h3>
        <button id="addLabor" class="btn btn-primary btn-sm">+ Add Employee</button>
      </div>
      <div class="overflow-x-auto rounded-lg border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr id="laborHeaderRow">
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 w-80">Employee</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-64">Position</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider w-24">Rate ($/hr)</th>
              <th class="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody id="laborBody" class="bg-white divide-y divide-slate-200"></tbody>
        </table>
      </div>
    </div>

    <!-- Direct -->
    <div>
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-semibold text-slate-700">Direct Costs</h3>
        <button id="addDirect" class="btn btn-primary btn-sm">+ Add Expense</button>
      </div>
      <div class="overflow-x-auto rounded-lg border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr id="directHeaderRow">
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 w-48">Category</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Description</th>
              <th class="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody id="directBody" class="bg-white divide-y divide-slate-200"></tbody>
        </table>
      </div>
    </div>

    <div class="flex justify-end gap-3 mt-8">
      <button id="saveBudget" class="btn btn-success">Save Budget</button>
    </div>
  </div>
`;

/* -------------------------- Lifecycle -------------------------- */

export async function init(root, params = {}) {
  rootEl = root;
  currentGrant = null;
  laborData = []; directData = []; months = [];

  await loadGrants();
  setupEventListeners();

  if (params.grantId) {
    const sel = rootEl.querySelector('#grantSelect');
    sel.value = String(params.grantId);
    currentGrant = { id: Number(params.grantId) };
    await loadBudget();
  }
}

function setupEventListeners() {
  const sel = rootEl.querySelector('#grantSelect');
  sel.addEventListener('change', async () => {
    const id = sel.value;
    currentGrant = id ? { id: Number(id) } : null;
    if (currentGrant) await loadBudget();
    else clearBudget();
  });

  rootEl.querySelector('#addLabor').addEventListener('click', addLaborRow);
  rootEl.querySelector('#addDirect').addEventListener('click', addDirectRow);
  rootEl.querySelector('#saveBudget').addEventListener('click', saveBudget);
}

/* -------------------------- Data Loads -------------------------- */

async function loadGrants() {
  const sel = rootEl.querySelector('#grantSelect');
  sel.innerHTML = '<option value="">— Select Grant —</option>';

  const { data, error } = await client
    .from('grants')
    .select('id, name, grant_id')
    .eq('status', 'active')
    .order('name');

  if (error) {
    msg(`Failed to load grants: ${error.message}`, true);
    return;
  }

  (data || []).forEach(g => sel.add(new Option(`${g.name} (${g.grant_id})`, g.id)));
}

async function loadBudget() {
  if (!currentGrant?.id) return;
  months = await getGrantMonths();
  if (months.length === 0) {
    clearBudget();
    msg('No months found for this grant range', true);
    return;
  }

  const [laborRes, directRes] = await Promise.all([
    client.from('budget_labor').select('*').eq('grant_id', currentGrant.id),
    client.from('budget_direct').select('*').eq('grant_id', currentGrant.id)
  ]);

  if (laborRes.error) msg(`Load labor failed: ${laborRes.error.message}`, true);
  if (directRes.error) msg(`Load direct failed: ${directRes.error.message}`, true);

  laborData = laborRes.data || [];
  directData = directRes.data || [];

  renderMonthHeaders();
  renderLabor();
  renderDirect();
}

async function getGrantMonths() {
  if (!currentGrant?.id) return [];
  const { data, error } = await client
    .from('grants')
    .select('start_date, end_date')
    .eq('id', currentGrant.id)
    .single();

  if (error) {
    msg(`Failed to load grant dates: ${error.message}`, true);
    return [];
  }
  if (!data?.start_date || !data?.end_date) return [];

  const start = new Date(data.start_date);
  const end = new Date(data.end_date);

  // Normalize to first of month, inclusive of end month
  start.setDate(1);
  end.setDate(1);

  const list = [];
  const seen = new Set();

  const d = new Date(start);
  while (d <= end) {
    const ym = new Date(d).toISOString().slice(0, 10); // YYYY-MM-01...
    const first = ym.slice(0, 7) + '-01';
    if (!seen.has(first)) {
      seen.add(first);
      list.push(first);
    }
    d.setMonth(d.getMonth() + 1);
  }
  return list;
}

/* -------------------------- Rendering -------------------------- */

function renderMonthHeaders() {
  const makeHeader = (monthIso) => {
    const short = new Date(monthIso).toLocaleString('en-US', { month: 'short' });
    const th = document.createElement('th');
    th.className = 'px-3 py-2 text-center text-xs font-medium text-slate-600 bg-slate-50 border-l border-slate-200 first:border-l-0 w-20';
    th.textContent = short;
    return th;
  };

  const laborRow = rootEl.querySelector('#laborHeaderRow');
  const directRow = rootEl.querySelector('#directHeaderRow');

  // Clear old dynamic month columns (keep first 3 + last action col in labor; first 2 + last in direct)
  while (laborRow.children.length > 4) laborRow.removeChild(laborRow.children[3]);
  while (directRow.children.length > 3) directRow.removeChild(directRow.children[2]);

  // Insert month headers before the last (action) column
  months.forEach(m => {
    laborRow.insertBefore(makeHeader(m), laborRow.lastElementChild);
    directRow.insertBefore(makeHeader(m), directRow.lastElementChild);
  });
}

function renderLabor() {
  const tbody = rootEl.querySelector('#laborBody');
  const rowsHtml = (laborData.length ? laborData : []).map((row, i) => {
    // For display, we’ll read the wide month columns using our key
    const monthCells = months.map(m => {
      const key = `hours_${monthToKey(m)}`;
      const val = row[key] ?? '';
      return `
        <td class="px-3 py-2 text-center border-l border-slate-200 first:border-l-0">
          <input type="number" class="input text-sm w-16 text-center"
                 value="${esc(val)}"
                 data-index="${i}" data-month="${m}">
        </td>
      `;
    }).join('');

    return `
      <tr class="hover:bg-slate-50">
        <td class="px-6 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
          <select class="input text-sm w-full" data-index="${i}" data-field="employee_id">
            <option value="">— Select Employee —</option>
          </select>
        </td>
        <td class="px-6 py-3 border-r border-slate-200">
          <input type="text" class="input text-sm w-full" value="${esc(row.position)}" readonly>
        </td>
        <td class="px-4 py-3 text-right border-r border-slate-200">
          <input type="number" class="input text-sm w-20 text-right" value="${esc(row.hourly_rate)}" readonly>
        </td>
        ${monthCells}
        <td class="px-4 py-3 text-center">
          <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeLabor(${i})">×</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml || '';

  // Populate employee selects after rows are in the DOM
  loadEmployeeOptions().catch(e => msg(`Employees load failed: ${e.message}`, true));
}

function renderDirect() {
  const tbody = rootEl.querySelector('#directBody');
  const rowsHtml = (directData.length ? directData : []).map((row, i) => {
    const monthCells = months.map(m => {
      const key = `amount_${monthToKey(m)}`;
      const val = row[key] ?? '';
      return `
        <td class="px-3 py-2 text-center border-l border-slate-200 first:border-l-0">
          <input type="number" class="input text-sm w-20 text-center"
                 value="${esc(val)}"
                 data-index="${i}" data-month="${m}">
        </td>
      `;
    }).join('');

    return `
      <tr class="hover:bg-slate-50">
        <td class="px-6 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
          <select class="input text-sm w-full" data-index="${i}" data-field="category">
            ${EXPENSE_CATEGORIES.map(c => `<option value="${esc(c)}" ${row.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </td>
        <td class="px-6 py-3 border-r border-slate-200">
          <input type="text" class="input text-sm w-full" placeholder="Description" value="${esc(row.description)}" data-index="${i}" data-field="description">
        </td>
        ${monthCells}
        <td class="px-4 py-3 text-center">
          <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeDirect(${i})">×</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml || '';
}

/* -------------------------- Lookups & UI wiring -------------------------- */

async function loadEmployeeOptions() {
  // NOTE: removed "position" from select list to avoid column-not-found errors if your table lacks it.
  const { data, error } = await client
    .from('labor_categories')
    .select('id, name, hourly_rate, burden_pct, position') // keep 'position' if it exists; harmless if nulls
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  const selects = rootEl.querySelectorAll('select[data-field="employee_id"]');
  selects.forEach((sel, i) => {
    const currentId = laborData[i]?.employee_id ?? null;
    sel.innerHTML =
      '<option value="">— Select Employee —</option>' +
      (data || []).map(emp =>
        `<option value="${emp.id}" ${currentId === emp.id ? 'selected' : ''}>${esc(emp.name)}</option>`
      ).join('');

    sel.addEventListener('change', () => {
      const emp = (data || []).find(e => e.id === Number(sel.value));
      if (!emp) return;
      const rowEl = rootEl.querySelectorAll('#laborBody tr')[i];
      // Display-only fields (not persisted unless you add fields/columns)
      rowEl.cells[1].querySelector('input').value = emp.position || '';
      rowEl.cells[2].querySelector('input').value = emp.hourly_rate ?? '';
    });
  });
}

/* -------------------------- Row add/remove -------------------------- */

function addLaborRow() {
  if (!currentGrant?.id) return msg('Select a grant first', true);
  laborData.push({ grant_id: currentGrant.id, employee_id: null });
  renderLabor();
}

function addDirectRow() {
  if (!currentGrant?.id) return msg('Select a grant first', true);
  // default the first category to smooth UX
  directData.push({ grant_id: currentGrant.id, category: EXPENSE_CATEGORIES[0], description: '' });
  renderDirect();
}

window.removeLabor = (i) => { laborData.splice(i, 1); renderLabor(); };
window.removeDirect = (i) => { directData.splice(i, 1); renderDirect(); };

/* -------------------------- Save -------------------------- */

async function saveBudget() {
  if (!currentGrant?.id) return msg('Select a grant', true);

  // Collect labor rows from the DOM
  const laborInserts = [];
  rootEl.querySelectorAll('#laborBody tr').forEach(tr => {
    const row = { grant_id: currentGrant.id };
    tr.querySelectorAll('input, select').forEach(el => {
      if (el.dataset.field) {
        // Persist typed fields; coerce numeric ids
        const val = el.dataset.field === 'employee_id' ? (el.value ? Number(el.value) : null) : (el.value || null);
        row[el.dataset.field] = val;
      }
      if (el.dataset.month && months.includes(el.dataset.month)) {
        const k = `hours_${monthToKey(el.dataset.month)}`;
        row[k] = el.value !== '' ? Number(el.value) : null;
      }
    });
    laborInserts.push(row);
  });

  // Collect direct rows from the DOM
  const directInserts = [];
  rootEl.querySelectorAll('#directBody tr').forEach(tr => {
    const row = { grant_id: currentGrant.id };
    tr.querySelectorAll('input, select').forEach(el => {
      if (el.dataset.field) {
        row[el.dataset.field] = el.value || null;
      }
      if (el.dataset.month && months.includes(el.dataset.month)) {
        const k = `amount_${monthToKey(el.dataset.month)}`;
        row[k] = el.value !== '' ? Number(el.value) : null;
      }
    });
    directInserts.push(row);
  });

  try {
    // Replace grant slice atomically-ish (best-effort; wrap in RPC/transaction if you have one)
    const del1 = await client.from('budget_labor').delete().eq('grant_id', currentGrant.id);
    if (del1.error) throw del1.error;
    const del2 = await client.from('budget_direct').delete().eq('grant_id', currentGrant.id);
    if (del2.error) throw del2.error;

    if (laborInserts.length) {
      const ins1 = await client.from('budget_labor').insert(laborInserts);
      if (ins1.error) throw ins1.error;
    }
    if (directInserts.length) {
      const ins2 = await client.from('budget_direct').insert(directInserts);
      if (ins2.error) throw ins2.error;
    }

    msg('Budget saved successfully!');
  } catch (err) {
    msg('Save failed: ' + err.message, true);
  }
}

/* -------------------------- Clear -------------------------- */

function clearBudget() {
  laborData = []; directData = []; months = [];
  rootEl.querySelector('#laborBody').innerHTML = '';
  rootEl.querySelector('#directBody').innerHTML = '';
  const laborRow = rootEl.querySelector('#laborHeaderRow');
  const directRow = rootEl.querySelector('#directHeaderRow');
  while (laborRow.children.length > 4) laborRow.removeChild(laborRow.children[3]);
  while (directRow.children.length > 3) directRow.removeChild(directRow.children[2]);
}

export const budgetTab = { template, init };
