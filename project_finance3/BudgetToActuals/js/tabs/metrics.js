// js/tabs/metrics.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Grant Metrics & Alerts</h2>
      <select id="grantSelect" class="border rounded-md px-3 py-1.5 text-sm"></select>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- KPI Gauges -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl text-center">
        <div class="text-sm text-slate-600 uppercase mb-2">Time Elapsed</div>
        <div id="timeElapsed" class="text-4xl font-bold text-blue-700">0%</div>
        <canvas id="gaugeTime" height="100"></canvas>
      </div>
      <div class="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl text-center">
        <div class="text-sm text-slate-600 uppercase mb-2">Budget Spent</div>
        <div id="budgetSpent" class="text-4xl font-bold text-green-700">0%</div>
        <canvas id="gaugeBudget" height="100"></canvas>
      </div>
      <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl text-center">
        <div class="text-sm text-slate-600 uppercase mb-2">Performance</div>
        <div id="performance" class="text-4xl font-bold" style="color:#7c3aed">—</div>
        <div class="text-xs mt-2" id="performanceLabel">On Track</div>
      </div>
    </div>

    <!-- Burn Rate -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-slate-50 p-5 rounded-lg">
        <h3 class="font-medium mb-3">Monthly Burn Rate</h3>
        <div class="flex justify-between text-lg">
          <span>Actual:</span><span id="actualBurn" class="font-bold">$0</span>
        </div>
        <div class="flex justify-between text-lg">
          <span>Budgeted:</span><span id="budgetedBurn" class="font-bold">$0</span>
        </div>
        <div class="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div id="burnBar" class="h-full bg-gradient-to-r from-yellow-400 to-red-500 transition-all" style="width:0%"></div>
        </div>
        <div id="burnStatus" class="text-xs mt-2 text-center"></div>
      </div>

      <div class="bg-slate-50 p-5 rounded-lg">
        <h3 class="font-medium mb-3">Top 3 Overruns</h3>
        <div id="overrunsList" class="space-y-2 text-sm">
          <div class="text-slate-500">No overruns</div>
        </div>
      </div>
    </div>

    <!-- Variance Trend Sparkline -->
    <div class="bg-slate-50 p-5 rounded-lg">
      <h3 class="font-medium mb-3">Monthly Variance Trend</h3>
      <canvas id="sparkline" height="60"></canvas>
    </div>

    <!-- Alerts -->
    <div id="alerts" class="space-y-2"></div>
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
  await loadMetrics();
}

/* ---------- EVENT LISTENERS ---------- */
function setupEventListeners() {
  const sel = rootEl.querySelector('#grantSelect');
  sel.addEventListener('change', () => {
    const id = sel.value;
    currentGrant = id ? { id } : null;
    loadMetrics();
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

async function loadMetrics() {
  if (!currentGrant) { clearMetrics(); return; }
  msg('Loading metrics...');

  const { grant, months } = await getGrantContext();
  const [budgetMap, actualsMap] = await Promise.all([
    loadBudgetData(),
    loadActualsData(months)
  ]);

  const m = calculateMetrics(grant, months, budgetMap, actualsMap);
  renderAll(m, months, budgetMap, actualsMap);
  msg('');
}

/* ---------- CONTEXT & DATA ---------- */
async function getGrantContext() {
  const { data } = await client
    .from('grants')
    .select('start_date, end_date, total_award')
    .eq('id', currentGrant.id)
    .single();

  const start = new Date(data.start_date);
  const end   = new Date(data.end_date);
  const list  = [];

  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    list.push(d.toISOString().slice(0, 7) + '-01');
  }
  return { grant: data, months: list, start, end };
}

async function loadBudgetData() {
  const [labor, direct] = await Promise.all([
    client.from('budget_labor').select('*').eq('grant_id', currentGrant.id),
    client.from('budget_direct').select('*').eq('grant_id', currentGrant.id)
  ]);

  const map = new Map();
  labor.data?.forEach(r => {
    const key = `${r.employee_name}-${r.ym}`;
    map.set(key, (map.get(key) || 0) + r.hours * 100);   // $100/hr
  });
  direct.data?.forEach(r => {
    const key = `${r.category}-${r.ym}`;
    map.set(key, (map.get(key) || 0) + r.amount);
  });
  return map;
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

/* ---------- CALCULATIONS ---------- */
function calculateMetrics(grant, months, budgetMap, actualsMap) {
  const today = new Date();
  const totalMonths = months.length;
  const elapsedMonths = months.filter(m => new Date(m) <= today).length;
  const timePct = totalMonths ? elapsedMonths / totalMonths : 0;

  let totalB = 0; budgetMap.forEach(v => totalB += v);
  let totalA = 0; actualsMap.forEach(v => totalA += v);
  const spentPct = totalB ? totalA / totalB : 0;
  const remaining = totalB - totalA;

  const monthlyA = totalA / Math.max(elapsedMonths, 1);
  const monthlyB = totalB / totalMonths;

  // variance per category
  const cats = new Set([...budgetMap.keys(), ...actualsMap.keys()].map(k => k.split('-')[0]));
  const variances = new Map();
  cats.forEach(c => {
    let b = 0, a = 0;
    months.forEach(ym => {
      b += budgetMap.get(`${c}-${ym}`) || 0;
      a += actualsMap.get(`${c}-${ym}`) || 0;
    });
    variances.set(c, { budget: b, actual: a, variance: b - a });
  });

  const topOverruns = Array.from(variances.entries())
    .map(([c, v]) => ({ cat: c, variance: v.variance }))
    .filter(v => v.variance < 0)
    .sort((a, b) => a.variance - b.variance)
    .slice(0, 3);

  const monthlyVariance = months.map(ym => {
    let b = 0, a = 0;
    cats.forEach(c => {
      b += budgetMap.get(`${c}-${ym}`) || 0;
      a += actualsMap.get(`${c}-${ym}`) || 0;
    });
    return b - a;
  });

  return {
    timePct, spentPct, remaining,
    monthlyA, monthlyB,
    topOverruns, monthlyVariance,
    totalB, totalA
  };
}

/* ---------- RENDERING ---------- */
function renderAll(m, months, budgetMap, actualsMap) {
  renderGauges(m);
  renderBurnRate(m);
  renderOverruns(m);
  renderSparkline(m.monthlyVariance);
  renderAlerts(m);
}

/* Gauges */
function renderGauges(m) {
  drawGauge(rootEl.querySelector('#gaugeTime'), m.timePct, '#3b82f6');
  drawGauge(rootEl.querySelector('#gaugeBudget'), m.spentPct, '#10b981');

  rootEl.querySelector('#timeElapsed').textContent = (m.timePct * 100).toFixed(0) + '%';
  rootEl.querySelector('#budgetSpent').textContent = (m.spentPct * 100).toFixed(0) + '%';

  const perf = m.spentPct > m.timePct + 0.1 ? 'Behind' :
               m.spentPct < m.timePct - 0.1 ? 'Ahead' : 'On Track';
  const color = perf === 'Behind' ? '#ef4444' : perf === 'Ahead' ? '#10b981' : '#7c3aed';
  rootEl.querySelector('#performance').textContent = perf;
  rootEl.querySelector('#performance').style.color = color;
  rootEl.querySelector('#performanceLabel').textContent =
    perf === 'Behind' ? 'Spending too slow' :
    perf === 'Ahead' ? 'Spending too fast' : 'Perfectly paced';
}
function drawGauge(ctx, pct, color) {
  const w = ctx.width = 150, h = ctx.height = 100;
  const c = ctx.getContext('2d');
  c.clearRect(0, 0, w, h);
  // background arc
  c.beginPath(); c.arc(75, 75, 60, Math.PI, 2 * Math.PI);
  c.strokeStyle = '#e5e7eb'; c.lineWidth = 12; c.stroke();
  // progress arc
  c.beginPath(); c.arc(75, 75, 60, Math.PI, Math.PI + pct * Math.PI);
  c.strokeStyle = color; c.lineWidth = 12; c.stroke();
}

/* Burn Rate */
function renderBurnRate(m) {
  rootEl.querySelector('#actualBurn').textContent = fmt(m.monthlyA);
  rootEl.querySelector('#budgetedBurn').textContent = fmt(m.monthlyB);
  const ratio = m.monthlyB ? m.monthlyA / m.monthlyB : 0;
  const bar = rootEl.querySelector('#burnBar');
  bar.style.width = Math.min(ratio * 100, 100) + '%';

  const status = rootEl.querySelector('#burnStatus');
  if (ratio > 1.2) {
    status.textContent = 'Burning too fast!';
    status.className = 'text-xs mt-2 text-center text-red-600 font-medium';
  } else if (ratio < 0.8) {
    status.textContent = 'Under-spending';
    status.className = 'text-xs mt-2 text-center text-yellow-600';
  } else {
    status.textContent = 'On pace';
    status.className = 'text-xs mt-2 text-center text-green-600';
  }
}

/* Overruns */
function renderOverruns(m) {
  const el = rootEl.querySelector('#overrunsList');
  if (!m.topOverruns.length) {
    el.innerHTML = '<div class="text-slate-500">No overruns</div>';
    return;
  }
  el.innerHTML = m.topOverruns.map(o => `
    <div class="flex justify-between">
      <span class="font-medium">${esc(o.cat)}</span>
      <span class="text-red-600 font-medium">${fmt(o.variance)}</span>
    </div>
  `).join('');
}

/* Sparkline */
function renderSparkline(variances) {
  const ctx = rootEl.querySelector('#sparkline');
  const w = ctx.width = ctx.parentElement.clientWidth;
  const h = ctx.height = 60;
  const c = ctx.getContext('2d');
  c.clearRect(0, 0, w, h);

  const max = Math.max(...variances.map(Math.abs), 1);
  const pts = variances.map((v, i) => ({
    x: (i / (variances.length - 1)) * (w - 40) + 20,
    y: h / 2 - (v / max) * (h / 2 - 10)
  }));

  c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
  pts.forEach(p => c.lineTo(p.x, p.y));
  c.strokeStyle = '#6b7280'; c.lineWidth = 2; c.stroke();

  c.lineTo(pts[pts.length - 1].x, h / 2);
  c.lineTo(pts[0].x, h / 2);
  c.fillStyle = 'rgba(107,114,128,0.1)'; c.fill();
}

/* Alerts */
function renderAlerts(m) {
  const container = rootEl.querySelector('#alerts');
  const list = [];

  if (m.spentPct > m.timePct + 0.15)
    list.push({ type: 'warning', text: `Spending 15%+ faster than time elapsed` });
  if (m.monthlyA > m.monthlyB * 1.3)
    list.push({ type: 'danger', text: `Burn rate 30%+ over budget` });
  if (m.remaining < 0)
    list.push({ type: 'danger', text: `Budget overrun by ${fmt(-m.remaining)}` });
  if (m.topOverruns.length)
    list.push({ type: 'info', text: `${m.topOverruns.length} categories over budget` });

  if (!list.length) {
    container.innerHTML = '<div class="text-green-600 text-sm">All systems go!</div>';
    return;
  }

  container.innerHTML = list.map(a => `
    <div class="p-3 rounded-lg text-sm font-medium ${
      a.type === 'danger' ? 'bg-red-50 text-red-700 border border-red-200' :
      a.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
      'bg-blue-50 text-blue-700 border border-blue-200'
    }">${a.text}</div>
  `).join('');
}

/* ---------- CLEAR & UI HELPERS ---------- */
function clearMetrics() {
  rootEl.querySelector('#timeElapsed').textContent = '0%';
  rootEl.querySelector('#budgetSpent').textContent = '0%';
  rootEl.querySelector('#performance').textContent = '—';
  rootEl.querySelector('#actualBurn').textContent = '$0';
  rootEl.querySelector('#budgetedBurn').textContent = '$0';
  rootEl.querySelector('#burnBar').style.width = '0%';
  rootEl.querySelector('#overrunsList').innerHTML = '<div class="text-slate-500">Select a grant</div>';
  rootEl.querySelector('#alerts').innerHTML = '';
  const ctx = rootEl.querySelector('#sparkline');
  ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
}
function msg(txt) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  if (txt) setTimeout(() => el.textContent = '', 3000);
}
function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export const metricsTab = { template, init };
