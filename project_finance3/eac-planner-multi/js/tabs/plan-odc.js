// js/tabs/plan-odc.js
// Other Direct Cost planning tab: month columns for COST; saves to plan_odc.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">Other Direct Cost (Cost by Month)</h2>
      <div class="flex items-center gap-2">
        <button id="odcAddRow" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">+ Add Row</button>
        <button id="odcSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
      </div>
    </div>
    <div id="odcMsg" class="text-sm text-slate-500 mb-3"></div>
    <div class="overflow-x-auto">
      <table id="odcTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>
  </div>
`;

let state = {
  year: new Date().getUTCFullYear(),
  months: [],
  rows: [], // { odc_type, monthCost: { 'YYYY-MM': number } }
  projectFormula: 'TM',
  projectFeePct: 0
};

export async function init(rootEl) {
  const pid = getProjectId();
  const msg = $('#odcMsg');
  const table = $('#odcTable');

  if (!pid) {
    msg.textContent = 'Select or create a project to edit ODC.';
    table.innerHTML = '';
    return;
  }

  // Year from the month picker
  state.year = Number(($('#monthPicker')?.value || new Date().toISOString().slice(0,7)).slice(0,4));
  state.months = monthsForYear(state.year);

  msg.textContent = 'Loading…';
  try {
    // Project revenue formula/fee
    const proj = await fetchProject(pid);
    state.projectFormula = proj?.revenue_formula || 'TM';
    state.projectFeePct = Number(proj?.fee_pct || 0);

    // Existing plan (this year)
    const plan = await fetchPlanODC(pid, state.year);

    const byType = {};
    for (const r of plan) {
      const k = keyVal(r.ym);
      if (!k) continue;
      const t = r.odc_type || '';
      if (!byType[t]) byType[t] = { odc_type: t, monthCost: {} };
      byType[t].monthCost[k] = Number(r.cost || 0);
    }
    state.rows = Object.values(byType);
    if (state.rows.length === 0) state.rows.push(blankRow());

    renderGrid();
    msg.textContent = '';
  } catch (err) {
    console.error('ODC init error', err);
    table.innerHTML = `<tbody><tr><td class="p-3 text-red-600">Error: ${err?.message || err}</td></tr></tbody>`;
    msg.textContent = '';
  }

  // Wire buttons
  $('#odcAddRow').onclick = () => { state.rows.push(blankRow()); renderGrid(true); };
  $('#odcSave').onclick = saveAll;
}

// ---------------------
// Rendering & helpers
// ---------------------
function renderGrid(preserveFocus=false) {
  const table = $('#odcTable');
  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0,7));

  let html = '<thead><tr>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">ODC Type</th>';
  months.forEach(m => html += `<th class="p-2 text-right">${m.label}</th>`);
  html += `
    <th class="p-2 text-right">Year Cost</th>
    <th class="p-2 text-right">Year Revenue</th>
    <th class="p-2 text-right">Profit</th>
    <th class="p-2"></th>
  `;
  html += '</tr></thead><tbody>';

  state.rows.forEach((row, idx) => {
    const costYear = monthKeys.reduce((s,k)=> s + Number(row.monthCost[k] || 0), 0);
    const revYear  = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    const profit   = revYear - costYear;

    html += `<tr data-idx="${idx}">`;

    // Type (free text)
    html += `<td class="p-2 sticky left-0 bg-white">
      <input class="typeInp border rounded-md p-1 min-w-56" type="text" placeholder="e.g., Travel, Permits" value="${esc(row.odc_type || '')}">
    </td>`;

    // Month inputs (cost)
    monthKeys.forEach(k => {
      const v = row.monthCost[k] ?? '';
      html += `<td class="p-1 text-right">
        <input data-k="${k}" class="costInp border rounded-md p-1 w-24 text-right" type="number" min="0" step="0.01" value="${v !== '' ? String(v) : ''}">
      </td>`;
    });

    // Totals
    html += `<td class="p-2 text-right">${fmtUSD0(costYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(revYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(profit)}</td>`;

    // Remove
    html += `<td class="p-2 text-right">
      <button class="rowDel px-2 py-1 rounded-md border hover:bg-slate-50">✕</button>
    </td>`;

    html += '</tr>';
  });

  // Footer totals
  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += `<tr class="font-semibold">
    <td class="p-2 sticky left-0 bg-white">Totals</td>
    ${monthKeys.map(k => `<td class="p-2 text-right">${fmtUSD0(totals.costByMonth[k])}</td>`).join('')}
    <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear - totals.costYear)}</td>
    <td class="p-2"></td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;

  // Wire row handlers
  table.querySelectorAll('.typeInp').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      state.rows[idx].odc_type = e.target.value;
    });
  });

  table.querySelectorAll('.costInp').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      const k = e.target.getAttribute('data-k');
      const n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
      state.rows[idx].monthCost[k] = n === '' ? '' : (Number.isFinite(n) ? n : 0);
      renderGrid(true);
    });
  });

  table.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      state.rows.splice(idx, 1);
      if (state.rows.length === 0) state.rows.push(blankRow());
      renderGrid(true);
    });
  });
}

function blankRow() {
  return { odc_type: '', monthCost: {} };
}

function monthsForYear(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, i, 1));
    return {
      label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      ym: d.toISOString().slice(0,10) // YYYY-MM-01
    };
  });
}

function keyVal(ym) {
  try { return (typeof ym === 'string') ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7); }
  catch { return null; }
}

function computeRevenue(cost, formula, feePct) {
  if (!Number.isFinite(cost)) return 0;
  switch (formula) {
    case 'COST_PLUS': return cost * (1 + (Number(feePct || 0) / 100));
    case 'TM':        return cost; // placeholder
    case 'FP':        return cost; // placeholder
    default:          return cost;
  }
}

function calcTotals(rows, monthKeys, formula, feePct) {
  const costByMonth = {};
  monthKeys.forEach(k => costByMonth[k] = 0);
  let costYear = 0, revYear = 0;

  for (const row of rows) {
    const yCost = monthKeys.reduce((s,k)=> s + Number(row.monthCost[k] || 0), 0);
    const yRev  = computeRevenue(yCost, formula, feePct);
    monthKeys.forEach(k => { costByMonth[k] += Number(row.monthCost[k] || 0); });
    costYear += yCost;
    revYear  += yRev;
  }
  return { costByMonth, costYear, revYear };
}

function fmtUSD0(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------------------
// Persistence
// ---------------------
async function fetchProject(projectId) {
  const { data, error } = await client
    .from('projects')
    .select('id, revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchPlanODC(projectId, year) {
  const { data, error } = await client
    .from('plan_odc')
    .select('odc_type, ym, cost')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data || []).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
}

async function saveAll() {
  const msg = $('#odcMsg');
  const pid = getProjectId();
  if (!pid) { msg.textContent = 'Select a project first.'; return; }
  msg.textContent = 'Saving…';

  const months = state.months.map(m => m.ym.slice(0,7));
  const inserts = [];

  for (const row of state.rows) {
    const type = (row.odc_type || '').trim();
    if (!type) continue;
    for (const mk of months) {
      const cost = Number(row.monthCost[mk] || 0);
      if (!cost) continue;
      inserts.push({
        project_id: pid,
        odc_type: type,
        ym: mk + '-01',
        cost
      });
    }
  }

  try {
    const yearPrefix = String(state.year) + '-';
    const { error: delErr } = await client
      .from('plan_odc')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delErr) throw delErr;

    if (inserts.length) {
      const { error: insErr } = await client.from('plan_odc').insert(inserts);
      if (insErr) throw insErr;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1200);
  } catch (err) {
    console.error('ODC save error', err);
    msg.textContent = `Save failed: ${err?.message || err}`;
  }
}
