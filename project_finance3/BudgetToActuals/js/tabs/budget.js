// js/tabs/budget.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;
let laborCategories = [];
let budgetLabor = new Map();     // key: `${employee}-${ym}`, value: {hours, category_id}
let budgetDirect = new Map();    // key: `${category}-${ym}`, value: amount

const YM_FORMAT = /^\d{4}-\d{2}-01$/;

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Budget Builder</h2>
      <select id="grantSelect" class="border rounded-md px-3 py-1.5 text-sm"></select>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- Labor Section -->
    <div class="border-t pt-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium">Labor Budget</h3>
        <button id="addLabor" class="text-xs text-blue-600 hover:underline">+ Add Employee</button>
      </div>
      <div id="laborTable" class="overflow-x-auto"></div>
    </div>

    <!-- Direct Costs -->
    <div class="border-t pt-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium">Direct Costs</h3>
        <button id="addDirect" class="text-xs text-blue-600 hover:underline">+ Add Category</button>
      </div>
      <div id="directTable" class="overflow-x-auto"></div>
    </div>

    <!-- Totals -->
    <div class="border-t pt-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-slate-50 p-4 rounded">
          <div class="text-xs text-slate-500 uppercase">Total Labor (Burdened)</div>
          <div id="totalLabor" class="text-xl font-semibold">$0</div>
        </div>
        <div class="bg-slate-50 p-4 rounded">
          <div class="text-xs text-slate-500 uppercase">Total Direct</div>
          <div id="totalDirect" class="text-xl font-semibold">$0</div>
        </div>
        <div class="bg-green-50 p-4 rounded">
          <div class="text-xs text-slate-500 uppercase">Grand Total</div>
          <div id="grandTotal" class="text-xl font-semibold text-green-700">$0</div>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <button id="saveBudget" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium">
        Save Budget
      </button>
    </div>
  </div>
`;

export async function init(root) {
  rootEl = root;

  await Promise.all([
    loadGrants(),
    loadLaborCategories()
  ]);

  setupEventListeners();
  await loadBudgetForSelectedGrant();
}

async function loadGrants() {
  const { data, error } = await client
    .from('grants')
    .select('id, name, grant_id')
    .eq('status', 'active')
    .order('name');

  if (error) { msg(error.message); return; }

  const sel = rootEl.querySelector('#grantSelect');
  sel.innerHTML = '<option value="">— Select Grant —</option>';
  data.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = `${g.name} (${g.grant_id})`;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    const id = sel.value;
    currentGrant = data.find(g => g.id === id) || null;
    loadBudgetForSelectedGrant();
  });
}

async function loadLaborCategories() {
  const { data, error } = await client
    .from('labor_categories')
    .select('id, name, hourly_rate, burden_pct')
    .eq('is_active', true)
    .order('name');

  if (error) { msg(error.message); return; }
  laborCategories = data;
}

async function loadBudgetForSelectedGrant() {
  if (!currentGrant) {
    clearTables();
    return;
  }

  msg('Loading budget…');
  const [laborRes, directRes] = await Promise.all([
    client.from('budget_labor').select('*').eq('grant_id', currentGrant.id),
    client.from('budget_direct').select('*').eq('grant_id', currentGrant.id)
  ]);

  budgetLabor.clear();
  laborRes.data?.forEach(row => {
    const key = `${row.employee_name}-${row.ym}`;
    budgetLabor.set(key, { hours: row.hours, category_id: row.category_id });
  });

  budgetDirect.clear();
  directRes.data?.forEach(row => {
    const key = `${row.category}-${row.ym}`;
    budgetDirect.set(key, row.amount);
  });

  renderTables();
  msg('');
}

function renderTables() {
  renderLaborTable();
  renderDirectTable();
  updateTotals();
}

function renderLaborTable() {
  const container = rootEl.querySelector('#laborTable');
  if (!currentGrant) {
    container.innerHTML = '<p class="text-sm text-slate-500">Select a grant to build budget.</p>';
    return;
  }

  const months = getGrantMonths();
  let html = `<table class="min-w-full text-sm"><thead class="bg-slate-50">
    <tr>
      <th class="p-2 text-left sticky left-0 bg-white">Employee</th>
      <th class="p-2 text-left">Category</th>`;
  months.forEach(m => html += `<th class="p-2 text-right">${monthShort(m)}</th>`);
  html += `<th class="p-2 text-right font-medium">Total</th><th class="p-2"></th></tr></thead><tbody>`;

  const employees = new Set();
  budgetLabor.forEach((v, k) => {
    const [emp] = k.split('-');
    employees.add(emp);
  });

  employees.forEach(emp => {
    const rows = months.map(ym => {
      const key = `${emp}-${ym}`;
      const data = budgetLabor.get(key) || { hours: 0, category_id: null };
      const cat = laborCategories.find(c => c.id === data.category_id);
      return { ym, hours: data.hours, cat };
    });

    const totalHours = rows.reduce((s, r) => s + (r.hours || 0), 0);
    const cat = rows[0]?.cat || laborCategories[0];

    html += `<tr>
      <td class="p-2 sticky left-0 bg-white font-medium">${esc(emp)}</td>
      <td class="p-2">
        <select class="catSelect border rounded px-1 text-xs" data-emp="${emp}">
          ${laborCategories.map(c => `
            <option value="${c.id}" ${c.id === cat?.id ? 'selected' : ''}>
              ${c.name} @ $${c.hourly_rate} (${c.burden_pct}%)
            </option>`).join('')}
        </select>
      </td>`;

    rows.forEach(r => {
      html += `<td class="p-2">
        <input type="number" min="0" step="0.5" class="hoursInput w-16 text-right border rounded px-1 text-xs"
               value="${r.hours}" data-emp="${emp}" data-ym="${r.ym}">
      </td>`;
    });

    const burdened = totalHours * (cat?.hourly_rate || 0) * (1 + (cat?.burden_pct || 0) / 100);
    html += `<td class="p-2 text-right font-medium">${fmt(burdened)}</td>
             <td class="p-2"><button class="text-xs text-red-600 removeLabor" data-emp="${emp}">×</button></td>
           </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // Attach listeners
  container.querySelectorAll('.hoursInput').forEach(inp => {
    inp.addEventListener('change', () => {
      const emp = inp.dataset.emp;
      const ym = inp.dataset.ym;
      const hours = Number(inp.value) || 0;
      const key = `${emp}-${ym}`;
      const existing = budgetLabor.get(key) || { hours: 0, category_id: null };
      budgetLabor.set(key, { ...existing, hours });
      updateTotals();
    });
  });

  container.querySelectorAll('.catSelect').forEach(sel => {
    sel.addEventListener('change', () => {
      const emp = sel.dataset.emp;
      const catId = sel.value;
      months.forEach(ym => {
        const key = `${emp}-${ym}`;
        const existing = budgetLabor.get(key);
        if (existing) {
          budgetLabor.set(key, { ...existing, category_id: catId });
        }
      });
      updateTotals();
    });
  });

  container.querySelectorAll('.removeLabor').forEach(btn => {
    btn.addEventListener('click', () => {
      const emp = btn.dataset.emp;
      months.forEach(ym => budgetLabor.delete(`${emp}-${ym}`));
      renderLaborTable();
      updateTotals();
    });
  });
}

function renderDirectTable() {
  const container = rootEl.querySelector('#directTable');
  if (!currentGrant) {
    container.innerHTML = '';
    return;
  }

  const months = getGrantMonths();
  let html = `<table class="min-w-full text-sm"><thead class="bg-slate-50">
    <tr>
      <th class="p-2 text-left sticky left-0 bg-white">Category</th>`;
  months.forEach(m => html += `<th class="p-2 text-right">${monthShort(m)}</th>`);
  html += `<th class="p-2 text-right font-medium">Total</th><th class="p-2"></th></tr></thead><tbody>`;

  const categories = new Set();
  budgetDirect.forEach((v, k) => {
    const [cat] = k.split('-');
    categories.add(cat);
  });

  categories.forEach(cat => {
    const rows = months.map(ym => {
      const key = `${cat}-${ym}`;
      return { ym, amount: budgetDirect.get(key) || 0 };
    });

    const total = rows.reduce((s, r) => s + r.amount, 0);

    html += `<tr>
      <td class="p-2 sticky left-0 bg-white font-medium">
        <input type="text" class="catName w-full border rounded px-1 text-xs" value="${esc(cat)}">
      </td>`;

    rows.forEach(r => {
      html += `<td class="p-2">
        <input type="number" min="0" step="100" class="directInput w-20 text-right border rounded px-1 text-xs"
               value="${r.amount}" data-cat="${cat}" data-ym="${r.ym}">
      </td>`;
    });

    html += `<td class="p-2 text-right font-medium">${fmt(total)}</td>
             <td class="p-2"><button class="text-xs text-red-600 removeDirect" data-cat="${cat}">×</button></td>
           </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  container.querySelectorAll('.directInput').forEach(inp => {
    inp.addEventListener('change', () => {
      const cat = inp.dataset.cat;
      const ym = inp.dataset.ym;
      const amount = Number(inp.value) || 0;
      const key = `${cat}-${ym}`;
      if (amount > 0) {
        budgetDirect.set(key, amount);
      } else {
        budgetDirect.delete(key);
      }
      updateTotals();
    });
  });

  container.querySelectorAll('.catName').forEach(inp => {
    inp.addEventListener('change', () => {
      const oldCat = inp.dataset.cat || inp.closest('tr').querySelector('.removeDirect').dataset.cat;
      const newCat = inp.value.trim();
      if (!newCat || newCat === oldCat) return;

      months.forEach(ym => {
        const oldKey = `${oldCat}-${ym}`;
        const newKey = `${newCat}-${ym}`;
        if (budgetDirect.has(oldKey)) {
          budgetDirect.set(newKey, budgetDirect.get(oldKey));
          budgetDirect.delete(oldKey);
        }
      });
      renderDirectTable();
      updateTotals();
    });
  });

  container.querySelectorAll('.removeDirect').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      months.forEach(ym => budgetDirect.delete(`${cat}-${ym}`));
      renderDirectTable();
      updateTotals();
    });
  });
}

function getGrantMonths() {
  if (!currentGrant) return [];
  const start = new Date(currentGrant.start_date);
  const end = new Date(currentGrant.end_date);
  const months = [];
  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    months.push(d.toISOString().slice(0, 7) + '-01');
  }
  return months;
}

function updateTotals() {
  const months = getGrantMonths();
  let totalLabor = 0;
  let totalDirect = 0;

  // Labor
  budgetLabor.forEach((v, k) => {
    const [, ym] = k.split('-');
    if (!months.includes(ym)) return;
    const cat = laborCategories.find(c => c.id === v.category_id);
    if (cat) {
      totalLabor += (v.hours || 0) * cat.hourly_rate * (1 + cat.burden_pct / 100);
    }
  });

  // Direct
  budgetDirect.forEach((amount, k) => {
    const [, ym] = k.split('-');
    if (months.includes(ym)) totalDirect += amount;
  });

  rootEl.querySelector('#totalLabor').textContent = fmt(totalLabor);
  rootEl.querySelector('#totalDirect').textContent = fmt(totalDirect);
  rootEl.querySelector('#grandTotal').textContent = fmt(totalLabor + totalDirect);
}

function setupEventListeners() {
  rootEl.querySelector('#addLabor').addEventListener('click', () => {
    const name = prompt('Employee Name:');
    if (!name?.trim()) return;
    const emp = name.trim();
    const months = getGrantMonths();
    months.forEach(ym => {
      const key = `${emp}-${ym}`;
      if (!budgetLabor.has(key)) {
        budgetLabor.set(key, { hours: 0, category_id: laborCategories[0]?.id });
      }
    });
    renderLaborTable();
    updateTotals();
  });

  rootEl.querySelector('#addDirect').addEventListener('click', () => {
    const cat = prompt('Cost Category (e.g., Travel):');
    if (!cat?.trim()) return;
    const c = cat.trim();
    const months = getGrantMonths();
    months.forEach(ym => {
      const key = `${c}-${ym}`;
      if (!budgetDirect.has(key)) {
        budgetDirect.set(key, 0);
      }
    });
    renderDirectTable();
    updateTotals();
  });

  rootEl.querySelector('#saveBudget').addEventListener('click', async () => {
    if (!currentGrant) return;
    msg('Saving…');
    try {
      // Delete old
      await Promise.all([
        client.from('budget_labor').delete().eq('grant_id', currentGrant.id),
        client.from('budget_direct').delete().eq('grant_id', currentGrant.id)
      ]);

      // Insert new
      const laborIns = [];
      budgetLabor.forEach((v, k) => {
        const [employee_name, ym] = k.split('-');
        if (v.hours > 0) {
          laborIns.push({
            grant_id: currentGrant.id,
            employee_name,
            category_id: v.category_id,
            ym,
            hours: v.hours
          });
        }
      });

      const directIns = [];
      budgetDirect.forEach((amount, k) => {
        const [category, ym] = k.split('-');
        if (amount > 0) {
          directIns.push({
            grant_id: currentGrant.id,
            category,
            ym,
            amount
          });
        }
      });

      if (laborIns.length) await client.from('budget_labor').insert(laborIns);
      if (directIns.length) await client.from('budget_direct').insert(directIns);

      msg('Budget saved!');
    } catch (e) {
      console.error(e);
      msg('Save failed: ' + e.message);
    }
  });
}

function clearTables() {
  budgetLabor.clear();
  budgetDirect.clear();
  rootEl.querySelector('#laborTable').innerHTML = '';
  rootEl.querySelector('#directTable').innerHTML = '';
  updateTotals();
}

function msg(txt) {
  rootEl.querySelector('#msg').textContent = txt;
}

function monthShort(ym) {
  const [y, m] = ym.split('-');
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
}

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export const budgetTab = { template, init };
