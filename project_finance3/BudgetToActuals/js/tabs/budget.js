// js/tabs/budget.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;
let laborData = [];
let directData = [];
let months = [];

const EXPENSE_CATEGORIES = [
  'Travel', 'Licenses', 'Computers', 'Software', 'Office Supplies',
  'Training', 'Consultants', 'Marketing', 'Events', 'Insurance'
];

export const template = /*html*/`
  <div class="card space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold text-slate-800">Budget Entry</h2>
      <select id="grantSelect" class="input text-sm w-64"></select>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- Labor Table -->
    <div>
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-medium text-slate-700">Labor</h3>
        <button id="addLabor" class="btn btn-primary btn-sm">+ Add Employee</button>
      </div>
      <div class="overflow-x-auto -mx-6 px-6">
        <table class="min-w-full table-auto border-collapse">
          <thead>
            <tr class="bg-slate-50 text-xs font-medium text-slate-600 uppercase tracking-wider">
              <th class="p-3 text-left sticky left-0 bg-slate-50">Employee</th>
              <th class="p-3 text-left w-32">Position</th>
              <th class="p-3 text-right w-24">Rate ($/hr)</th>
              <th id="laborMonths" colspan="12" class="text-center"></th>
              <th class="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody id="laborBody" class="bg-white"></tbody>
        </table>
      </div>
    </div>

    <!-- Direct Costs Table -->
    <div>
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-medium text-slate-700">Direct Costs</h3>
        <button id="addDirect" class="btn btn-primary btn-sm">+ Add Expense</button>
      </div>
      <div class="overflow-x-auto -mx-6 px-6">
        <table class="min-w-full table-auto border-collapse">
          <thead>
            <tr class="bg-slate-50 text-xs font-medium text-slate-600 uppercase tracking-wider">
              <th class="p-3 text-left sticky left-0 bg-slate-50">Category</th>
              <th class="p-3 text-left">Description</th>
              <th id="directMonths" colspan="12" class="text-center"></th>
              <th class="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody id="directBody" class="bg-white"></tbody>
        </table>
      </div>
    </div>

    <div class="flex justify-end gap-3 mt-6">
      <button id="saveBudget" class="btn btn-success">Save Budget</button>
    </div>
  </div>
`;

export async function init(root, params = {}) {
  rootEl = root;
  currentGrant = params.grantId ? { id: params.grantId } : null;

  await loadGrants();
  setupEventListeners();
  if (currentGrant) {
    rootEl.querySelector('#grantSelect').value = currentGrant.id;
    await loadBudget();
  }
}

function setupEventListeners() {
  const sel = rootEl.querySelector('#grantSelect');
  sel.addEventListener('change', async () => {
    currentGrant = sel.value ? { id: sel.value } : null;
    if (currentGrant) await loadBudget();
    else clearBudget();
  });

  rootEl.querySelector('#addLabor').addEventListener('click', addLaborRow);
  rootEl.querySelector('#addDirect').addEventListener('click', addDirectRow);
  rootEl.querySelector('#saveBudget').addEventListener('click', saveBudget);
}

async function loadGrants() {
  const { data } = await client.from('grants').select('id, name, grant_id').eq('status', 'active').order('name');
  const sel = rootEl.querySelector('#grantSelect');
  sel.innerHTML = '<option value="">— Select Grant —</option>';
  data.forEach(g => sel.add(new Option(`${g.name} (${g.grant_id})`, g.id)));
}

async function loadBudget() {
  if (!currentGrant) return;
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

async function getGrantMonths() {
  const { data } = await client.from('grants').select('start_date, end_date').eq('id', currentGrant.id).single();
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  const list = [];
  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    list.push(d.toISOString().slice(0, 7) + '-01');
  }
  return list;
}

function renderMonthHeaders() {
  const laborHeader = rootEl.querySelector('#laborMonths');
  const directHeader = rootEl.querySelector('#directMonths');
  const headerHTML = months.map(m => `<th class="p-3 text-center text-xs font-medium text-slate-600">${monthShort(m)}</th>`).join('');
  laborHeader.innerHTML = headerHTML;
  directHeader.innerHTML = headerHTML;
}

function monthShort(ym) {
  return new Date(ym).toLocaleString('en-US', { month: 'short' });
}

function renderLabor() {
  const tbody = rootEl.querySelector('#laborBody');
  tbody.innerHTML = laborData.map((row, i) => `
    <tr class="border-b hover:bg-slate-50">
      <td class="p-3 sticky left-0 bg-white">
        <select class="input text-sm w-full" data-index="${i}" data-field="employee_id">
          <option value="">— Select —</option>
        </select>
      </td>
      <td class="p-3">
        <input type="text" class="input text-sm w-full" value="${row.position || ''}" readonly>
      </td>
      <td class="p-3 text-right">
        <input type="number" class="input text-sm w-20 text-right" value="${row.hourly_rate || ''}" readonly>
      </td>
      ${months.map(m => `
        <td class="p-3 text-center">
          <input type="number" class="input text-sm w-16 text-center" 
                 placeholder="${m.slice(5,7)}" 
                 value="${row[`hours_${m}`] || ''}" 
                 data-index="${i}" data-month="${m}">
        </td>
      `).join('')}
      <td class="p-3 text-center">
        <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeLabor(${i})">×</button>
      </td>
    </tr>
  `).join('');

  loadEmployeeOptions();
}

function renderDirect() {
  const tbody = rootEl.querySelector('#directBody');
  tbody.innerHTML = directData.map((row, i) => `
    <tr class="border-b hover:bg-slate-50">
      <td class="p-3 sticky left-0 bg-white">
        <select class="input text-sm w-full" data-index="${i}" data-field="category">
          ${EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${row.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </td>
      <td class="p-3">
        <input type="text" class="input text-sm w-full" placeholder="Description" value="${row.description || ''}" data-index="${i}" data-field="description">
      </td>
      ${months.map(m => `
        <td class="p-3 text-center">
          <input type="number" class="input text-sm w-20 text-center" 
                 placeholder="${m.slice(5,7)}" 
                 value="${row[`amount_${m}`] || ''}" 
                 data-index="${i}" data-month="${m}">
        </td>
      `).join('')}
      <td class="p-3 text-center">
        <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeDirect(${i})">×</button>
      </td>
    </tr>
  `).join('');
}

async function loadEmployeeOptions() {
  const { data } = await client.from('labor_categories').select('id, name, position, hourly_rate').eq('is_active', true);
  const selects = rootEl.querySelectorAll('select[data-field="employee_id"]');
  selects.forEach((sel, i) => {
    sel.innerHTML = '<option value="">— Select —</option>' + data.map(emp => `
      <option value="${emp.id}" ${laborData[i]?.employee_id === emp.id ? 'selected' : ''}>${emp.name}</option>
    `).join('');
    sel.addEventListener('change', () => fillEmployeeInfo(i, sel.value, data));
  });
}

function fillEmployeeInfo(index, empId, employees) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const row = rootEl.querySelectorAll('#laborBody tr')[index];
  row.cells[1].querySelector('input').value = emp.position || '';
  row.cells[2].querySelector('input').value = emp.hourly_rate || '';
}

function addLaborRow() {
  laborData.push({ grant_id: currentGrant.id });
  renderLabor();
}

function addDirectRow() {
  directData.push({ grant_id: currentGrant.id });
  renderDirect();
}

window.removeLabor = (i) => { laborData.splice(i, 1); renderLabor(); };
window.removeDirect = (i) => { directData.splice(i, 1); renderDirect(); };

async function saveBudget() {
  if (!currentGrant) return msg('Select a grant');

  const laborInserts = [];
  rootEl.querySelectorAll('#laborBody tr').forEach(tr => {
    const i = tr.querySelector('select').dataset.index;
    const row = { grant_id: currentGrant.id };
    tr.querySelectorAll('input, select').forEach(el => {
      if (el.dataset.field) row[el.dataset.field] = el.value || null;
      if (el.dataset.month) row[`hours_${el.dataset.month}`] = el.value || null;
    });
    laborInserts.push(row);
  });

  const directInserts = [];
  rootEl.querySelectorAll('#directBody tr').forEach(tr => {
    const row = { grant_id: currentGrant.id };
    tr.querySelectorAll('input, select').forEach(el => {
      if (el.dataset.field) row[el.dataset.field] = el.value || null;
      if (el.dataset.month) row[`amount_${el.dataset.month}`] = el.value || null;
    });
    directInserts.push(row);
  });

  await client.from('budget_labor').delete().eq('grant_id', currentGrant.id);
  await client.from('budget_direct').delete().eq('grant_id', currentGrant.id);

  if (laborInserts.length) await client.from('budget_labor').insert(laborInserts);
  if (directInserts.length) await client.from('budget_direct').insert(directInserts);

  msg('Budget saved!');
}

function clearBudget() {
  laborData = []; directData = []; months = [];
  rootEl.querySelector('#laborBody').innerHTML = '';
  rootEl.querySelector('#directBody').innerHTML = '';
  rootEl.querySelector('#laborMonths').innerHTML = '';
  rootEl.querySelector('#directMonths').innerHTML = '';
}

function msg(txt) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  if (txt) setTimeout(() => el.textContent = '', 3000);
}

export const budgetTab = { template, init };
