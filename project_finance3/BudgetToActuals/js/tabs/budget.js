// js/tabs/budget.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;
let laborData = [];
let directData = [];
let months = [];
let employees = [];

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
  currentGrant = null;
  laborData = []; directData = []; months = [];

  await loadGrants();
  setupEventListeners();

  if (params.grantId) {
    const sel = rootEl.querySelector('#grantSelect');
    sel.value = params.grantId;
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

async function loadGrants() {
  const { data } = await client.from('grants').select('id, name, grant_id').eq('status', 'active').order('name');
  const sel = rootEl.querySelector('#grantSelect');
  sel.innerHTML = '<option value="">— Select Grant —</option>';
  data.forEach(g => sel.add(new Option(`${g.name} (${g.grant_id})`, g.id)));
}

async function loadBudget() {
  if (!currentGrant?.id) return;
  const grantId = currentGrant.id;

  try {
    // A) Grant months
    const { data: g, error: gErr } = await client
      .from('grants')
      .select('start_date,end_date')
      .eq('id', grantId)
      .single();
    if (gErr) throw gErr;

    months = getMonthsBetween(g.start_date, g.end_date);

    // B) Labor categories (employees)
    const { data: laborCats, error: lErr } = await client
      .from('labor_categories')
      .select('id,name,position,hourly_rate,is_active')
      .eq('is_active', true)
      .order('name');
    if (lErr) throw lErr;
    employees = laborCats || [];

    // C) Budget labor
    const { data: laborRows, error: blErr } = await client
      .from('budget_labor')
      .select('employee_id,position,hourly_rate,ym,hours')
      .eq('grant_id', grantId);
    if (blErr) throw blErr;

    // D) Budget direct
    const { data: directRows, error: bdErr } = await client
      .from('budget_direct')
      .select('category,description,ym,amount')
      .eq('grant_id', grantId);
    if (bdErr) throw bdErr;

    // Pivot labor
    const laborMap = new Map();
    laborRows?.forEach(r => {
      const key = r.employee_id;
      if (!laborMap.has(key)) {
        laborMap.set(key, {
          employee_id: r.employee_id,
          position: r.position,
          hourly_rate: r.hourly_rate,
          hours: {}
        });
      }
      laborMap.get(key).hours[r.ym] = r.hours;
    });
    laborData = Array.from(laborMap.values());

    // Pivot direct
    const directMap = new Map();
    directRows?.forEach(r => {
      const key = `${r.category}|${r.description}`;
      if (!directMap.has(key)) {
        directMap.set(key, { category: r.category, description: r.description, amounts: {} });
      }
      directMap.get(key).amounts[r.ym] = r.amount;
    });
    directData = Array.from(directMap.values());

    renderMonthHeaders();
    renderLabor();
    renderDirect();

  } catch (err) {
    msg('Load failed: ' + err.message, true);
  }
}

function getMonthsBetween(start, end) {
  const list = [];
  const seen = new Set();
  let d = new Date(start);
  const endDate = new Date(end);
  d.setDate(1); endDate.setDate(1);
  while (d <= endDate) {
    const ym = d.toISOString().slice(0, 10); // '2024-03-01'
    if (!seen.has(ym)) {
      seen.add(ym);
      list.push(ym);
    }
    d.setMonth(d.getMonth() + 1);
  }
  return list;
}

function renderMonthHeaders() {
  const laborRow = rootEl.querySelector('#laborHeaderRow');
  const directRow = rootEl.querySelector('#directHeaderRow');
  if (!laborRow || !directRow) return; // DOM not ready

  // Clear old month headers
  while (laborRow.children.length > 4) laborRow.removeChild(laborRow.children[3]);
  while (directRow.children.length > 3) directRow.removeChild(directRow.children[2]);

  // Add new
  months.forEach(m => {
    const th = document.createElement('th');
    th.className = 'px-3 py-2 text-center text-xs font-medium text-slate-600 bg-slate-50 border-l border-slate-200 first:border-l-0 w-20';
    th.textContent = new Date(m).toLocaleString('en-US', { month: 'short' });
    laborRow.insertBefore(th.cloneNode(true), laborRow.lastElementChild);
    directRow.insertBefore(th, directRow.lastElementChild);
  });
}

function renderLabor() {
  const tbody = rootEl.querySelector('#laborBody');
  tbody.innerHTML = laborData.map((row, i) => `
    <tr class="hover:bg-slate-50">
      <td class="px-6 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
        <select class="input text-sm w-full" data-index="${i}" data-field="employee_id">
          <option value="">— Select Employee —</option>
          ${employees.map(e => `<option value="${e.id}" ${row.employee_id === e.id ? 'selected' : ''}>${e.name}</option>`).join('')}
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
                 value="${row.hours?.[m] || ''}" 
                 data-index="${i}" data-month="${m}">
        </td>
      `).join('')}
      <td class="px-4 py-3 text-center">
        <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeLabor(${i})">x</button>
      </td>
    </tr>
  `).join('');

  // Auto-fill on change
  rootEl.querySelectorAll('select[data-field="employee_id"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const emp = employees.find(e => e.id === Number(sel.value));
      const i = sel.dataset.index;
      const tr = rootEl.querySelectorAll('#laborBody tr')[i];
      if (emp) {
        tr.cells[1].querySelector('input').value = emp.position || '';
        tr.cells[2].querySelector('input').value = emp.hourly_rate || '';
      }
    });
  });
}

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
                 value="${row.amounts?.[m] || ''}" 
                 data-index="${i}" data-month="${m}">
        </td>
      `).join('')}
      <td class="px-4 py-3 text-center">
        <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeDirect(${i})">x</button>
      </td>
    </tr>
  `).join('');
}

function addLaborRow() {
  if (!currentGrant?.id) return msg('Select a grant first');
  laborData.push({ employee_id: null, position: '', hourly_rate: null, hours: {} });
  renderLabor();
}

function addDirectRow() {
  if (!currentGrant?.id) return msg('Select a grant first');
  directData.push({ category: EXPENSE_CATEGORIES[0], description: '', amounts: {} });
  renderDirect();
}

window.removeLabor = (i) => { laborData.splice(i, 1); renderLabor(); };
window.removeDirect = (i) => { directData.splice(i, 1); renderDirect(); };

async function saveBudget() {
  if (!currentGrant?.id) return msg('Select a grant');

  const laborInserts = [];
  rootEl.querySelectorAll('#laborBody tr').forEach(tr => {
    const i = tr.querySelector('select').dataset.index;
    const row = laborData[i];
    const employee_id = row.employee_id;
    if (!employee_id) return;

    const emp = employees.find(e => e.id === employee_id);
    months.forEach(m => {
      const hours = tr.querySelector(`input[data-month="${m}"]`)?.value;
      if (hours) {
        laborInserts.push({
          grant_id: currentGrant.id,
          employee_id,
          position: emp.position,
          hourly_rate: emp.hourly_rate,
          ym: m,
          hours: Number(hours)
        });
      }
    });
  });

  const directInserts = [];
  rootEl.querySelectorAll('#directBody tr').forEach(tr => {
    const i = tr.querySelector('select').dataset.index;
    const row = directData[i];
    const category = row.category;
    const description = tr.querySelector('input[data-field="description"]')?.value.trim();
    months.forEach(m => {
      const amount = tr.querySelector(`input[data-month="${m}"]`)?.value;
      if (amount) {
        directInserts.push({
          grant_id: currentGrant.id,
          category,
          description,
          ym: m,
          amount: Number(amount)
        });
      }
    });
  });

  try {
    await client.from('budget_labor').delete().eq('grant_id', currentGrant.id);
    await client.from('budget_direct').delete().eq('grant_id', currentGrant.id);

    if (laborInserts.length) await client.from('budget_labor').insert(laborInserts);
    if (directInserts.length) await client.from('budget_direct').insert(directInserts);

    msg('Budget saved!');
  } catch (err) {
    msg('Save failed: ' + err.message, true);
  }
}

function clearBudget() {
  laborData = []; directData = []; months = [];
  rootEl.querySelector('#laborBody').innerHTML = '';
  rootEl.querySelector('#directBody').innerHTML = '';
  const laborRow = rootEl.querySelector('#laborHeaderRow');
  const directRow = rootEl.querySelector('#directHeaderRow');
  if (laborRow) while (laborRow.children.length > 4) laborRow.removeChild(laborRow.children[3]);
  if (directRow) while (directRow.children.length > 3) directRow.removeChild(directRow.children[2]);
}

function msg(txt, isError = false) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  el.className = isError ? 'text-sm text-red-600' : 'text-sm text-green-600';
  if (txt) setTimeout(() => el.textContent = '', 4000);
}

export const budgetTab = { template, init };
