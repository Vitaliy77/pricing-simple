// js/tabs/budget.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;
let laborData = [];
let directData = [];

const EXPENSE_CATEGORIES = [
  'Travel', 'Licenses', 'Computers', 'Software', 'Office Supplies',
  'Training', 'Consultants', 'Marketing', 'Events', 'Insurance'
];

export const template = /*html*/`
  <div class="card space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold text-slate-800">Budget Entry</h2>
      <select id="grantSelect" class="input text-sm"></select>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- Labor -->
    <div>
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-medium text-slate-700">Labor</h3>
        <button id="addLabor" class="btn btn-primary btn-sm">+ Add Employee</button>
      </div>
      <div id="laborContainer" class="space-y-3"></div>
    </div>

    <!-- Direct Costs -->
    <div>
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-medium text-slate-700">Direct Costs</h3>
        <button id="addDirect" class="btn btn-primary btn-sm">+ Add Expense</button>
      </div>
      <div id="directContainer" class="space-y-3"></div>
    </div>

    <div class="flex justify-end gap-3">
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
  rootEl.querySelector('#grantSelect').addEventListener('change', async () => {
    const id = rootEl.querySelector('#grantSelect').value;
    currentGrant = id ? { id } : null;
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
  data.forEach(g => {
    const opt = new Option(`${g.name} (${g.grant_id})`, g.id);
    sel.add(opt);
  });
}

async function loadBudget() {
  if (!currentGrant) return;
  const [labor, direct] = await Promise.all([
    client.from('budget_labor').select('*').eq('grant_id', currentGrant.id),
    client.from('budget_direct').select('*').eq('grant_id', currentGrant.id)
  ]);

  laborData = labor.data || [];
  directData = direct.data || [];

  renderLabor();
  renderDirect();
}

function renderLabor() {
  const container = rootEl.querySelector('#laborContainer');
  container.innerHTML = laborData.map((row, i) => `
    <div class="grid grid-cols-12 gap-2 items-center p-3 bg-slate-50 rounded-lg">
      <select class="col-span-3 input text-sm" data-index="${i}" data-field="employee_id">
        <option value="">— Select —</option>
        <!-- filled by JS -->
      </select>
      <input type="text" class="col-span-2 input text-sm" value="${row.position || ''}" readonly>
      <input type="number" class="col-span-2 input text-sm" value="${row.hourly_rate || ''}" readonly>
      ${getMonthInputs(row, i, 'hours')}
      <button class="col-span-1 btn btn-sm bg-red-100 text-red-700 hover:bg-red-200" onclick="removeLabor(${i})">×</button>
    </div>
  `).join('');

  // Populate employee dropdowns
  loadEmployeeOptions();
}

function renderDirect() {
  const container = rootEl.querySelector('#directContainer');
  container.innerHTML = directData.map((row, i) => `
    <div class="grid grid-cols-12 gap-2 items-center p-3 bg-slate-50 rounded-lg">
      <select class="col-span-3 input text-sm" data-index="${i}" data-field="category">
        ${EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${row.category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <input type="text" class="col-span-3 input text-sm" placeholder="Description" value="${row.description || ''}" data-index="${i}" data-field="description">
      ${getMonthInputs(row, i, 'amount')}
      <button class="col-span-1 btn btn-sm bg-red-100 text-red-700 hover:bg-red-200" onclick="removeDirect(${i})">×</button>
    </div>
  `).join('');
}

function getMonthInputs(row, index, field) {
  const months = getGrantMonths();
  return months.map(m => `
    <input type="number" class="col-span-1 input text-sm" placeholder="${m.slice(5,7)}" 
           value="${row[field + '_' + m] || ''}" 
           data-index="${index}" data-month="${m}" data-field="${field}">
  `).join('');
}

async function loadEmployeeOptions() {
  const { data } = await client.from('labor_categories').select('id, name, position, hourly_rate').eq('is_active', true);
  const selects = rootEl.querySelectorAll('select[data-field="employee_id"]');
  selects.forEach(sel => {
    const index = sel.dataset.index;
    sel.innerHTML = '<option value="">— Select —</option>' + data.map(emp => `
      <option value="${emp.id}" ${laborData[index]?.employee_id === emp.id ? 'selected' : ''}>
        ${emp.name}
      </option>
    `).join('');
    sel.addEventListener('change', () => fillEmployeeInfo(index, sel.value, data));
  });
}

function fillEmployeeInfo(index, empId, employees) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const row = rootEl.querySelectorAll('#laborContainer > div')[index];
  row.querySelectorAll('input')[0].value = emp.position || '';
  row.querySelectorAll('input')[1].value = emp.hourly_rate || '';
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

  // Collect labor
  const laborInserts = [];
  rootEl.querySelectorAll('#laborContainer > div').forEach(div => {
    const index = div.querySelector('select').dataset.index;
    const row = { grant_id: currentGrant.id };
    div.querySelectorAll('input, select').forEach(el => {
      if (el.dataset.field) row[el.dataset.field] = el.value;
      if (el.dataset.month) row[`hours_${el.dataset.month}`] = el.value || null;
    });
    laborInserts.push(row);
  });

  // Collect direct
  const directInserts = [];
  rootEl.querySelectorAll('#directContainer > div').forEach(div => {
    const row = { grant_id: currentGrant.id };
    div.querySelectorAll('input, select').forEach(el => {
      if (el.dataset.field) row[el.dataset.field] = el.value;
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

function getGrantMonths() {
  // Simplified — get from grant start/end
  const start = new Date('2024-01-01');
  const end = new Date('2025-12-31');
  const months = [];
  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    months.push(d.toISOString().slice(0, 7) + '-01');
  }
  return months;
}

function clearBudget() {
  laborData = []; directData = [];
  rootEl.querySelector('#laborContainer').innerHTML = '';
  rootEl.querySelector('#directContainer').innerHTML = '';
}

function msg(txt) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  if (txt) setTimeout(() => el.textContent = '', 3000);
}

export const budgetTab = { template, init };
