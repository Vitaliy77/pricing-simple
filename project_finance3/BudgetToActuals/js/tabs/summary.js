// js/tabs/summary.js
import { client } from '../api/supabase.js';

export const template = /*html*/`
  <div class="card space-y-6">
    <h2 class="text-xl font-semibold text-slate-800">Grant Summary</h2>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <select id="grantSelect" class="input text-sm"></select>
      <div></div>
      <button id="runReport" class="btn btn-primary">Run Report</button>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <div id="summaryOutput" class="bg-slate-50 p-6 rounded-lg hidden">
      <ul class="space-y-2 text-sm">
        <li><strong>Total Budget:</strong> <span id="totalBudget">$0</span></li>
        <li><strong>Spent to Date:</strong> <span id="spentToDate">$0</span></li>
        <li><strong>Remaining:</strong> <span id="remaining">$0</span></li>
        <li><strong>Award Amount:</strong> <span id="awardAmount">$0</span></li>
        <li><strong>Time Elapsed:</strong> <span id="timeElapsed">0 / 0 months</span></li>
      </ul>
    </div>
  </div>
`;

let rootEl = null;

export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;

  await loadGrants();
  setupEventListeners();
}

async function loadGrants() {
  const { data, error } = await client
    .from('grants')
    .select('id,name,grant_id,start_date,end_date,amount')
    .eq('status', 'active')
    .order('name');

  const rows = Array.isArray(data) ? data : []; // SAFE: never .map(null)

  const select = rootEl.querySelector('#grantSelect');
  select.innerHTML = '<option value="">— Select Grant —</option>';
  rows.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = `${g.name} (${g.grant_id || ''})`;
    select.appendChild(opt);
  });

  if (error) msg('Failed to load grants: ' + error.message, true);
}

function setupEventListeners() {
  rootEl.querySelector('#runReport').addEventListener('click', runSummary);
}

async function runSummary() {
  const select = rootEl.querySelector('#grantSelect');
  const grantId = select.value;
  if (!grantId) return msg('Please select a grant');

  msg('Loading summary...');

  try {
    // 1. Grant details
    const { data: grant, error: gErr } = await client
      .from('grants')
      .select('start_date,end_date,amount')
      .eq('id', grantId)
      .single();
    if (gErr) throw gErr;

    // 2. Budget Labor
    const { data: laborRows, error: lErr } = await client
      .from('budget_labor')
      .select('hours,hourly_rate')
      .eq('grant_id', grantId);
    if (lErr) throw lErr;

    // 3. Budget Direct
    const { data: directRows, error: dErr } = await client
      .from('budget_direct')
      .select('amount')
      .eq('grant_id', grantId);
    if (dErr) throw dErr;

    // 4. Actuals
    const { data: actualRows, error: aErr } = await client
      .from('actuals')
      .select('amount,gl_date')
      .eq('grant_id', grantId)
      .gte('gl_date', grant.start_date.slice(0, 10))
      .lte('gl_date', grant.end_date.slice(0, 10));
    if (aErr) throw aErr;

    // --- SAFE MAPS ---
    const laborCost = sum((Array.isArray(laborRows) ? laborRows : []).map(r => (r.hours || 0) * (r.hourly_rate || 0)));
    const directCost = sum((Array.isArray(directRows) ? directRows : []).map(r => r.amount || 0));
    const budgetTotal = laborCost + directCost;

    const actualTotal = sum((Array.isArray(actualRows) ? actualRows : []).map(r => r.amount || 0));

    const remaining = budgetTotal - actualTotal;

    const totalMonths = monthDiff(new Date(grant.start_date), new Date(grant.end_date)) + 1;
    const today = new Date();
    const elapsedMonths = Math.max(0, Math.min(totalMonths, monthDiff(new Date(grant.start_date), today) + 1));

    // --- UPDATE UI ---
    rootEl.querySelector('#totalBudget').textContent = fmt(budgetTotal);
    rootEl.querySelector('#spentToDate').textContent = fmt(actualTotal);
    rootEl.querySelector('#remaining').textContent = fmt(remaining);
    rootEl.querySelector('#awardAmount').textContent = fmt(grant.amount || 0);
    rootEl.querySelector('#timeElapsed').textContent = `${elapsedMonths} / ${totalMonths} months`;

    rootEl.querySelector('#summaryOutput').classList.remove('hidden');
    msg('');

  } catch (err) {
    msg('Error: ' + err.message, true);
  }
}

function sum(arr) {
  return arr.reduce((s, v) => s + (Number(v) || 0), 0);
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}

function monthDiff(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function msg(txt, isError = false) {
  const el = rootEl.querySelector('#msg');
  if (!el) return;
  el.textContent = txt;
  el.className = isError ? 'text-sm text-red-600' : 'text-sm text-green-600';
  if (txt) setTimeout(() => el.textContent = '', 4000);
}

export const summaryTab = { template, init };
