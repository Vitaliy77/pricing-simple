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
      <div class="bg-blue-50 p-4 rounded"><div class="text-xs text-slate-500 uppercase">Total Budget</div><div id="totalBudget" class="text-2xl font-bold">$0</div></div>
      <div class="bg-green-50 p-4 rounded"><div class="text-xs text-slate-500 uppercase">Spent to Date</div><div id="spentToDate" class="text-2xl font-bold">$0</div></div>
      <div class="bg-yellow-50 p-4 rounded"><div class="text-xs text-slate-500 uppercase">Remaining</div><div id="remaining" class="text-2xl font-bold">$0</div></div>
      <div class="bg-purple-50 p-4 rounded"><div class="text-xs text-slate-500 uppercase">% Spent</div><div id="pctSpent" class="text-2xl font-bold">0%</div></div>
    </div>

    <div class="overflow-x-auto">
      <table id="bvaTable" class="min-w-full text-sm">
        <thead class="bg-slate-50"><tr><th class="p-2 text-left sticky left-0 bg-white">Category</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-slate-50 p-4 rounded"><h3 class="font-medium mb-2">Monthly BvA</h3><canvas id="chartMonthly"></canvas></div>
      <div class="bg-slate-50 p-4 rounded"><h3 class="font-medium mb-2">Cumulative Spend</h3><canvas id="chartCumulative"></canvas></div>
    </div>
  </div>
`;

export async function init(root, params = {}) {
  rootEl = root;
  const urlGrantId = params.grantId;

  await loadGrants();
  setupEventListeners();            // ← now defined

  if (urlGrantId) {
    const sel = rootEl.querySelector('#grantSelect');
    sel.value = urlGrantId;
    currentGrant = { id: urlGrantId };
  }
  await loadBvA();
}

/* ----------  EVENT LISTENERS ---------- */
function setupEventListeners() {
  const sel = rootEl.querySelector('#grantSelect');
  sel.addEventListener('change', () => {
    const id = sel.value;
    currentGrant = id ? { id } : null;
    loadBvA();
  });
}

/* ----------  REST OF THE FILE (unchanged) ---------- */
async function loadGrants() { /* … same as before … */ }
async function loadBvA() { /* … same as before … */ }
async function getGrantMonths() { /* … */ }
async function loadBudgetData() { /* … */ }
async function loadActualsData(months) { /* … */ }
function renderTable(months, budget, actuals) { /* … */ }
function renderCharts(months, budget, actuals) { /* … */ }
function updateSummary(budget, actuals) { /* … */ }
function clearDashboard() { /* … */ }
function msg(txt) { /* … */ }
function monthShort(ym) { /* … */ }
function fmt(v) { /* … */ }
function esc(s) { /* … */ }

export const bvaTab = { template, init };
