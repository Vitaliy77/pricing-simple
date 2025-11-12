// js/tabs/budget.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;   // { id: number }
let laborData = [];
let directData = [];
let months = [];

const EXPENSE_CATEGORIES = [
  'Travel', 'Licenses', 'Computers', 'Software', 'Office Supplies',
  'Training', 'Consultants', 'Marketing', 'Events', 'Insurance'
];

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

    <!-- Direct Costs -->
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

export async function init(root, params = {}) {
  rootEl = root;
  laborData = []; directData = []; months = [];

  await loadGrants();
  setupEventListeners();

  // ---- SET CURRENT GRANT FROM URL OR SELECT ----
  const sel = rootEl.querySelector('#grantSelect');
  if (params.grantId) {
    sel.value = params.grantId;
    currentGrant = { id: Number(params.grantId) };
    await loadBudget();
  } else if (sel.value) {
    currentGrant = { id: Number(sel.value) };
    await loadBudget();
  }
}

/* ---------- EVENT LISTENERS ---------- */
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

/* ---------- GRANTS ---------- */
async function loadGrants() {
  const { data } = await client.from('grants').select('id, name, grant_id').eq('status', 'active').order('name');
  const sel = rootEl.querySelector('#grantSelect');
  sel.innerHTML = '<option value="">— Select Grant —</option>';
  data.forEach(g => sel.add(new Option(`${g.name} (${g.grant_id})`, g.id)));
}

/* ---------- BUDGET LOAD ---------- */
async function loadBudget() {
  if (!currentGrant?.id) return;
  months = await getGrantMonths();

  const [laborRes, directRes] = await Promise.all([
    client.from('budget_labor').select('*').eq('grant_id', currentGrant.id),
    client.from('budget_direct').select('*').eq('grant_id', currentGrant.id)
  ]);

  laborData = laborRes.data || [];
  directData = directRes.data || [];

  renderMonthHeaders();
  renderLabor();
  renderDirect();
}

/* ---------- MONTHS ---------- */
async function getGrantMonths() {
  const { data } = await client.from('grants').select('start_date, end_date').eq('id', currentGrant.id).single();
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  const list = [];
  const seen = new Set();
  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    const ym = d.toISOString().slice(0, 7) + '-01';
    if (!seen.has(ym)) {
      seen.add(ym);
      list.push(ym);
    }
  }
  return list;
}

/* ---------- HEADERS ---------- */
function renderMonthHeaders() {
  const makeHeader = (month) => {
    const short = new Date(month).toLocaleString('en-US', { month: 'short' });
    const th = document.createElement('th');
    th.className = 'px-3 py-2 text-center text-xs font-medium text-slate-600 bg-slate-50 border-l border-slate-200 first:border-l-0 w-20';
    th.textContent = short;
    return th;
  };

  const laborRow = rootEl.querySelector('#laborHeaderRow');
  const directRow = rootEl.querySelector('#directHeaderRow');

  while (laborRow.children.length > 4) laborRow.removeChild(laborRow.children[3]);
  while (directRow.children.length > 3) directRow.removeChild(directRow.children[2]);

  months.forEach(m => {
    laborRow.insertBefore(makeHeader(m), laborRow.lastElementChild);
    directRow.insertBefore(makeHeader(m), directRow.lastElementChild);
  });
}

/* ---------- LABOR RENDER ---------- */
function renderLabor() {
  const tbody = rootEl.querySelector('#laborBody');
  tbody.innerHTML = laborData.map((row, i) => `
    <tr class="hover:bg-slate-50">
      <td class="px-6 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
        <select class="input text-sm w-full" data-index="${i}" data-field="employee_id">
          <option value="">— Select Employee —</option>
        </select>
      </td>
      <td class="px-6 py-3 border-r border-slate-200">
        <input type="text" class="input text-sm w-full" value="${row.position || ''}" readonly>
      </td>
      <td class="px-4 py-3 text-right border-r border-slate-200">
        <input type="number" class="input text-sm w-20 text-right" value="${row.hourly_rate || ''}" readonly>
      </td>
      ${months.map(m => `
        <td class="px-3 py-2 text-center border-l border-slate-200 first:border-l-0">
          <input type="number" class="input text-sm w-16 text-center"
                 value="${row[`hours_${m}`] || ''}"
                 data-index="${i}" data-month="${m}">
        </td>
      `).join('')}
      <td class="px-4 py-3 text-center">
        <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeLabor(${i})">x</button>
      </td>
    </tr>
  `).join('');

  loadEmployeeOptions();
}

/* ---------- DIRECT RENDER ---------- */
function renderDirect() {
  const tbody = rootEl.querySelector('#directBody');
  tbody.innerHTML = directData.map((row, i) => `
    <tr class="hover:bg-slate-50">
      <td class="px-6 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
        <select class="input text-sm w-full" data-index="${i}" data-field="category">
          ${EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${row.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </td>
      <td class="px-6 py-3 border-r border-slate-200">
        <input type="text" class="input text-sm w-full" placeholder="Description" value="${row.description || ''}" data-index="${i}" data-field="description">
      </td>
      ${months.map(m => `
        <td class="px-3 py-2 text-center border-l border-slate-200 first:border-l-0">
          <input type="number" class="input text-sm w-20 text-center"
                 value="${row[`amount_${m}`] || ''}"
                 data-index="${i}" data-month="${m}">
        </td>
      `).join('')}
      <td class="px-4 py-3 text-center">
        <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeDirect(${i})">x</button>
      </td>
    </tr>
  `).join('');
}

/* ---------- EMPLOYEE OPTIONS ---------- */
async function loadEmployeeOptions() {
  const { data } = await client.from('labor_categories').select('id, name, position, hourly_rate').eq('is_active', true);
  const selects = rootEl.querySelectorAll('select[data-field="employee_id"]');
  selects.forEach((sel, i) => {
    const currentId = laborData[i]?.employee_id;
    sel.innerHTML = '<option value="">— Select Employee —</option>' +
      data.map(emp => `<option value="${emp.id}" ${currentId === emp.id ? 'selected' : ''}>${emp.name}</option>`).join('');

    sel.addEventListener('change', () => {
      const emp = data.find(e => e.id === Number(sel.value));
      if (!emp) return;
      const row = rootEl.querySelectorAll('#laborBody tr')[i];
      row.cells[1].querySelector('input').value = emp.position || '';
      row.cells[2].querySelector('input').value = emp.hourly_rate || '';
    });
  });
}

/* ---------- ADD ROWS ---------- */
function addLaborRow() {
  const sel = rootEl.querySelector('#grantSelect');
  const grantId = Number(sel.value);
  if (!grantId) return msg('Please select a grant first');
  if (!currentGrant) currentGrant = { id: grantId };
  laborData.push({ grant_id: grantId });
  renderLabor();
}

function addDirectRow() {
  const sel = rootEl.querySelector('#grantSelect');
  const grantId = Number(sel.value);
  if (!grantId) return msg('Please select a grant first');
  if (!currentGrant) currentGrant = { id: grantId };
  directData.push({ grant_id: grantId });
  renderDirect();
}

window.removeLabor = (i) => { laborData.splice(i, 1); renderLabor(); };
window.removeDirect = (i) => { directData.splice(i, 1); renderDirect(); };

/* ---------- SAVE ---------- */
async function saveBudget() {
  const sel = rootEl.querySelector('#grantSelect');
  const grantId = Number(sel.value);
  if (!grantId) return msg('Select a grant');

  const laborInserts = [];
  rootEl.querySelectorAll('#laborBody tr').forEach(tr => {
    const row = { grant_id: grantId };
    tr.querySelectorAll('input, select').forEach(el => {
      if (el.dataset.field) row[el.dataset.field] = el.value || null;
      if (el.dataset.month && months.includes(el.dataset.month)) {
        row[`hours_${el.dataset.month}`] = el.value ? Number(el.value) : null;
      }
    });
    laborInserts.push(row);
  });

  const directInserts = [];
  rootEl.querySelectorAll('#directBody tr').forEach(tr => {
    const row = { grant_id: grantId };
    tr.querySelectorAll('input, select').forEach(el => {
      if (el.dataset.field) row[el.dataset.field] = el.value || null;
      if (el.dataset.month && months.includes(el.dataset.month)) {
        row[`amount_${el.dataset.month}`] = el.value ? Number(el.value) : null;
      }
    });
    directInserts.push(row);
  });

  try {
    await client.from('budget_labor').delete().eq('grant_id', grantId);
    await client.from('budget_direct').delete().eq('grant_id', grantId);

    if (laborInserts.length) await client.from('budget_labor').insert(laborInserts);
    if (directInserts.length) await client.from('budget_direct').insert(directInserts);

    msg('Budget saved successfully!');
  } catch (err) {
    msg('Save failed: ' + err.message);
  }
}

/* ---------- CLEAR ---------- */
function clearBudget() {
  laborData = []; directData = []; months = [];
  rootEl.querySelector('#laborBody').innerHTML = '';
  rootEl.querySelector('#directBody').innerHTML = '';
  const laborRow = rootEl.querySelector('#laborHeaderRow');
  const directRow = rootEl.querySelector('#directHeaderRow');
  while (laborRow.children.length > 4) laborRow.removeChild(laborRow.children[3]);
  while (directRow.children.length > 3) directRow.removeChild(directRow.children[2]);
}

/* ---------- MSG ---------- */
function msg(txt) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  el.className = txt.includes('failed') || txt.includes('Please') ? 'text-sm text-red-600' : 'text-sm text-green-600';
  if (txt) setTimeout(() => el.textContent = '', 4000);
}

export const budgetTab = { template, init };
