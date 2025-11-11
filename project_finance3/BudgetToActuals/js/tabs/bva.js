// js/tabs/bva.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;
let chartMonthly = null;
let chartCumulative = null;

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Budget vs Actuals</h2>
      <select id="grantSelect" class="border rounded-md px-3 py-1.5 text-sm"></select>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-blue-50 p-4 rounded">
        <div class="text-xs text-slate-500 uppercase">Total Budget</div>
        <div id="totalBudget" class="text-2xl font-bold">$0</div>
      </div>
      <div class="bg-green-50 p-4 rounded">
        <div class="text-xs text-slate-500 uppercase">Spent to Date</div>
        <div id="spentToDate" class="text-2xl font-bold">$0</div>
      </div>
      <div class="bg-yellow-50 p-4 rounded">
        <div class="text-xs text-slate-500 uppercase">Remaining</div>
        <div id="remaining" class="text-2xl font-bold">$0</div>
      </div>
      <div class="bg-purple-50 p-4 rounded">
        <div class="text-xs text-slate-500 uppercase">% Spent</div>
        <div id="pctSpent" class="text-2xl font-bold">0%</div>
      </div>
    </div>

    <!-- Monthly Table -->
    <div class="overflow-x-auto">
      <table id="bvaTable" class="min-w-full text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="p-2 text-left sticky left-0 bg-white">Category</th>
            <!-- months added dynamically -->
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-slate-50 p-4 rounded">
        <h3 class="font-medium mb-2">Monthly BvA</h3>
        <canvas id="chartMonthly"></canvas>
      </div>
      <div class="bg-slate-50 p-4 rounded">
        <h3 class="font-medium mb-2">Cumulative Spend</h3>
        <canvas id="chartCumulative"></canvas>
      </div>
    </div>
  </div>
`;

export async function init(root, params = {}) {
  rootEl = root;
  const urlGrantId = params.grantId;

  await loadGrants();
  setupEventListeners();               // <-- now defined

  if (urlGrantId) {
    const sel = rootEl.querySelector('#grantSelect');
    sel.value = urlGrantId;
    currentGrant = { id: urlGrantId };
  }
  await loadBvA();
}

/* ---------- EVENT LISTENERS ---------- */
function setupEventListeners() {
  const sel = rootEl.querySelector('#grantSelect');
  sel.addEventListener('change', () => {
    const id = sel.value;
    currentGrant = id ? { id } : null;
    loadBvA();
  });
}

/* ---------- DATA LOADING ---------- */
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
}

async function loadBvA() {
  if (!currentGrant) { clearDashboard(); return; }
  msg('Loading BvA...');

  const months = await getGrantMonths();
  const [budgetRes, actualsRes] = await Promise.all([
    loadBudgetData(),
    loadActualsData(months)
  ]);

  renderTable(months, budgetRes, actualsRes);
  renderCharts(months, budgetRes, actualsRes);
  updateSummary(budgetRes, actualsRes);
  msg('');
}

/* ---------- HELPERS ---------- */
async function getGrantMonths() {
  const { data } = await client
    .from('grants')
    .select('start_date, end_date')
    .eq('id', currentGrant.id)
    .single();

  const start = new Date(data.start_date);
  const end   = new Date(data.end_date);
  const list  = [];

  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    list.push(d.toISOString().slice(0, 7) + '-01');
  }
  return list;
}

async function loadBudgetData() {
  const [labor, direct] = await Promise.all([
    client.from('budget_labor').select('*').eq('grant_id', currentGrant.id),
    client.from('budget_direct').select('*').eq('grant_id', currentGrant.id)
  ]);

  const laborMap = new Map();
  labor.data?.forEach(r => laborMap.set(`${r.employee_name}-${r.ym}`, r.hours));

  const directMap = new Map();
  direct.data?.forEach(r => directMap.set(`${r.category}-${r.ym}`, r.amount));

  return { laborMap, directMap };
}

async function loadActualsData(months) {
  const start = months[0];
  const end   = new Date(months[months.length - 1]);
  end.setMonth(end.getMonth() + 1);

  const { data } = await client
    .from('actuals')
    .select('gl_date, amount, category_mapped')
    .eq('grant_id', currentGrant.id)
    .gte('gl_date', start)
    .lt('gl_date', end.toISOString().slice(0, 10));

  const map = new Map();
  data?.forEach(r => {
    const ym = r.gl_date.slice(0, 7) + '-01';
    const key = `${r.category_mapped}-${ym}`;
    map.set(key, (map.get(key) || 0) + r.amount);
  });
  return map;
}

/* ---------- RENDERING ---------- */
function renderTable(months, budget, actuals) {
  const thead = rootEl.querySelector('#bvaTable thead tr');
  const tbody = rootEl.querySelector('#bvaTable tbody');

  // ---- headers ----
  while (thead.children.length > 1) thead.removeChild(thead.lastChild);
  months.forEach(m => {
    const th = document.createElement('th');
    th.className = 'p-2 text-right';
    th.textContent = monthShort(m);
    thead.appendChild(th);
  });
  const totalTh = document.createElement('th');
  totalTh.className = 'p-2 text-right font-medium';
  totalTh.textContent = 'Total';
  thead.appendChild(totalTh);

  // ---- rows ----
  const cats = new Set();
  budget.laborMap.forEach((_, k) => cats.add(k.split('-')[0]));
  budget.directMap.forEach((_, k) => cats.add(k.split('-')[0]));
  actuals.forEach((_, k) => cats.add(k.split('-')[0]));

  let html = '';
  let grandBudget = 0, grandActual = 0;

  cats.forEach(cat => {
    let rowB = 0, rowA = 0;
    const cells = months.map(ym => {
      const bLabor = budget.laborMap.get(`${cat}-${ym}`) || 0;
      const bDirect = budget.directMap.get(`${cat}-${ym}`) || 0;
      const bAmt = bLabor * 100 + bDirect;               // $100/hr
      const aAmt = actuals.get(`${cat}-${ym}`) || 0;
      rowB += bAmt; rowA += aAmt;
      const varAmt = bAmt - aAmt;
      const cls = varAmt > 0 ? 'text-green-600' : varAmt < 0 ? 'text-red-600' : '';
      return `<td class="p-2 text-right ${cls}">${fmt(varAmt)}</td>`;
    }).join('');

    grandBudget += rowB; grandActual += rowA;
    const totalVar = rowB - rowA;
    const totalCls = totalVar > 0 ? 'text-green-600' : 'font-bold text-red-600';

    html += `<tr>
      <td class="p-2 sticky left-0 bg-white font-medium">${esc(cat)}</td>
      ${cells}
      <td class="p-2 text-right font-medium ${totalCls}">${fmt(totalVar)}</td>
    </tr>`;
  });

  // ---- totals row ----
  const totalCells = months.map(ym => {
    let b = 0, a = 0;
    cats.forEach(c => {
      b += (budget.laborMap.get(`${c}-${ym}`) || 0) * 100 + (budget.directMap.get(`${c}-${ym}`) || 0);
      a += actuals.get(`${c}-${ym}`) || 0;
    });
    const v = b - a;
    const vc = v > 0 ? 'text-green-600' : 'text-red-600';
    return `<td class="p-2 text-right font-medium ${vc}">${fmt(v)}</td>`;
  }).join('');

  const grandVar = grandBudget - grandActual;
  const grandCls = grandVar > 0 ? 'text-green-600' : 'font-bold text-red-600';

  html += `<tr class="bg-slate-100 font-bold">
    <td class="p-2 sticky left-0 bg-slate-100">TOTAL</td>
    ${totalCells}
    <td class="p-2 text-right ${grandCls}">${fmt(grandVar)}</td>
  </tr>`;

  tbody.innerHTML = html;
}

function renderCharts(months, budget, actuals) {
  const labels = months.map(m => monthShort(m));

  const budgetData = months.map(ym => {
    let tot = 0;
    budget.laborMap.forEach((h, k) => { if (k.endsWith(`-${ym}`)) tot += h * 100; });
    budget.directMap.forEach((a, k) => { if (k.endsWith(`-${ym}`)) tot += a; });
    return tot;
  });

  const actualData = months.map(ym => {
    let tot = 0;
    actuals.forEach((a, k) => { if (k.endsWith(`-${ym}`)) tot += a; });
    return tot;
  });

  // Monthly bar
  if (chartMonthly) chartMonthly.destroy();
  chartMonthly = new Chart(rootEl.querySelector('#chartMonthly'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Budget', data: budgetData, backgroundColor: '#3b82f6' },
      { label: 'Actual', data: actualData, backgroundColor: '#10b981' }
    ]},
    options: { responsive: true, plugins: { legend: { position: 'top' } } }
  });

  // Cumulative line
  const cumB = budgetData.reduce((a, v, i) => [...a, (a[i-1] ?? 0) + v], []);
  const cumA = actualData.reduce((a, v, i) => [...a, (a[i-1] ?? 0) + v], []);

  if (chartCumulative) chartCumulative.destroy();
  chartCumulative = new Chart(rootEl.querySelector('#chartCumulative'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Cumulative Budget', data: cumB, borderColor: '#3b82f6', fill: false },
      { label: 'Cumulative Actual', data: cumA, borderColor: '#10b981', fill: false }
    ]},
    options: { responsive: true, plugins: { legend: { position: 'top' } } }
  });
}

function updateSummary(budget, actuals) {
  let totalB = 0;
  budget.laborMap.forEach((h, k) => totalB += h * 100);
  budget.directMap.forEach(a => totalB += a);

  let totalA = 0;
  actuals.forEach(a => totalA += a);

  const remaining = totalB - totalA;
  const pct = totalB ? (totalA / totalB) * 100 : 0;

  rootEl.querySelector('#totalBudget').textContent = fmt(totalB);
  rootEl.querySelector('#spentToDate').textContent = fmt(totalA);
  rootEl.querySelector('#remaining').textContent = fmt(remaining);
  rootEl.querySelector('#pctSpent').textContent = pct.toFixed(1) + '%';
}

function clearDashboard() {
  rootEl.querySelector('#bvaTable tbody').innerHTML = '';
  rootEl.querySelector('#totalBudget').textContent = '$0';
  rootEl.querySelector('#spentToDate').textContent = '$0';
  rootEl.querySelector('#remaining').textContent = '$0';
  rootEl.querySelector('#pctSpent').textContent = '0%';
  if (chartMonthly) { chartMonthly.destroy(); chartMonthly = null; }
  if (chartCumulative) { chartCumulative.destroy(); chartCumulative = null; }
}

/* ---------- UI HELPERS ---------- */
function msg(txt) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  if (txt) setTimeout(() => el.textContent = '', 3000);
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

export const bvaTab = { template, init };
