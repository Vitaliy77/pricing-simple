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

/* ---------- keep focus/caret when re-rendering ---------- */
function withCaretPreserved(run) {
  const active = document.activeElement;
  const isCell = !!(active && active.classList && active.classList.contains('costInp'));
  const rowEl = active && active.closest ? active.closest('tr') : null;
  const rowIdx = rowEl ? rowEl.getAttribute('data-idx') : null;
  const monthKey = active && active.getAttribute ? active.getAttribute('data-k') : null;
  const s = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  const e = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;

  run();

  if (isCell && rowIdx !== null && monthKey) {
    const el = document.querySelector('tr[data-idx="' + rowIdx + '"] input.costInp[data-k="' + monthKey + '"]');
    if (el) {
      el.focus();
      if (s !== null && e !== null) {
        try { el.setSelectionRange(s, e); } catch (_) {}
      }
    }
  }
}

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

  // Year from the month picker (no optional chaining)
  const mp = $('#monthPicker');
  const mpVal = (mp && mp.value) ? mp.value : new Date().toISOString().slice(0,7);
  state.year = Number(mpVal.slice(0,4));
  state.months = monthsForYear(state.year);

  msg.textContent = 'Loading…';
  try {
    // Project revenue formula/fee
    const projRes = await client
      .from('projects')
      .select('id, revenue_formula, fee_pct')
      .eq('id', pid)
      .single();
    if (projRes.error) throw projRes.error;
    const proj = projRes.data || {};
    state.projectFormula = proj.revenue_formula || 'TM';
    state.projectFeePct = Number(proj.fee_pct || 0);

    // Existing plan (this year)
    const planRes = await client
      .from('plan_odc')
      .select('odc_type, ym, cost')
      .eq('project_id', pid);
    if (planRes.error) throw planRes.error;

    const plan = (planRes.data || []).filter(r => {
      const k = keyVal(r.ym);
      return k && k.slice(0,4) === String(state.year);
    });

    const byType = {};
    for (let i = 0; i < plan.length; i++) {
      const r = plan[i];
      const k = keyVal(r.ym);
      if (!k) continue;
      const t = r.odc_type ? String(r.odc_type) : '';
      if (!byType[t]) byType[t] = { odc_type: t, monthCost: {} };
      byType[t].monthCost[k] = Number(r.cost || 0);
    }

    state.rows = Object.values(byType);
    if (state.rows.length === 0) state.rows.push(blankRow());

    renderGrid();
    msg.textContent = '';
  } catch (err) {
    console.error('ODC init error', err);
    table.innerHTML = '<tbody><tr><td class="p-3 text-red-600">Error: ' + (err && err.message ? err.message : String(err)) + '</td></tr></tbody>';
    msg.textContent = '';
  }

  // Wire buttons
  $('#odcAddRow').onclick = () => { state.rows.push(blankRow()); withCaretPreserved(() => renderGrid()); };
  $('#odcSave').onclick = saveAll;
}

// ---------------------
// Rendering & helpers
// ---------------------
function renderGrid() {
  const table = $('#odcTable');
  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0,7));

  let html = '<thead><tr>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">ODC Type</th>';
  for (let i = 0; i < months.length; i++) html += '<th class="p-2 text-right">' + months[i].label + '</th>';
  html += ''
    + '<th class="p-2 text-right">Year Cost</th>'
    + '<th class="p-2 text-right">Year Revenue</th>'
    + '<th class="p-2 text-right">Profit</th>'
    + '<th class="p-2"></th>';
  html += '</tr></thead><tbody>';

  for (let idx = 0; idx < state.rows.length; idx++) {
    const row = state.rows[idx];
    const costYear = monthKeys.reduce((s,k)=> s + Number(row.monthCost[k] || 0), 0);
    const revYear  = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    const profit   = revYear - costYear;

    html += '<tr data-idx="' + idx + '">';

    // Type (free text)
    html += '<td class="p-2 sticky left-0 bg-white">'
        +  '<input class="typeInp border rounded-md p-1 min-w-56" type="text" placeholder="e.g., Travel, Permits" value="' + esc(row.odc_type || '') + '">'
        +  '</td>';

    // Month inputs (cost)
    for (let i = 0; i < monthKeys.length; i++) {
      const k = monthKeys[i];
      const v = (row.monthCost[k] !== undefined && row.monthCost[k] !== null) ? row.monthCost[k] : '';
      html += '<td class="p-1 text-right">'
          +  '<input data-k="' + k + '" class="costInp border rounded-md p-1 w-24 text-right" type="number" min="0" step="0.01" value="' + (v !== '' ? String(v) : '') + '">'
          +  '</td>';
    }

    // Totals
    html += '<td class="p-2 text-right">' + fmtUSD0(costYear) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(revYear)  + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(profit)   + '</td>';

    // Remove
    html += '<td class="p-2 text-right">'
        +  '<button class="rowDel px-2 py-1 rounded-md border hover:bg-slate-50">✕</button>'
        +  '</td>';

    html += '</tr>';
  }

  // Footer totals
  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += '<tr class="font-semibold">'
      +  '<td class="p-2 sticky left-0 bg-white">Totals</td>'
      +   monthKeys.map(k => '<td class="p-2 text-right">' + fmtUSD0(totals.costByMonth[k]) + '</td>').join('')
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.costYear) + '</td>'
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.revYear)  + '</td>'
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.revYear - totals.costYear) + '</td>'
      +  '<td class="p-2"></td>'
      +  '</tr>';

  html += '</tbody>';
  table.innerHTML = html;

  // Handlers
  table.querySelectorAll('.typeInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest ? e.target.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      if (idx >= 0) state.rows[idx].odc_type = e.target.value;
    });
  });

  // IMPORTANT: commit on change; prevent Enter from jumping
  table.querySelectorAll('.costInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest ? e.target.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const k = e.target.getAttribute('data-k');
      let n = (e.target.value === '') ? '' : Number(e.target.value);
      if (n !== '' && !Number.isFinite(n)) n = 0;
      if (idx >= 0 && k) {
        state.rows[idx].monthCost[k] = (e.target.value === '') ? '' : Math.max(0, n);
        withCaretPreserved(() => renderGrid());
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });

  table.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest ? btn.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      if (idx >= 0) {
        state.rows.splice(idx, 1);
        if (state.rows.length === 0) state.rows.push(blankRow());
        withCaretPreserved(() => renderGrid());
      }
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
  try {
    if (typeof ym === 'string') return ym.slice(0,7);
    return new Date(ym).toISOString().slice(0,7);
  } catch (_) { return null; }
}

function computeRevenue(cost, formula, feePct) {
  const c = Number(cost || 0);
  switch (formula) {
    case 'COST_PLUS': return c * (1 + (Number(feePct || 0) / 100));
    case 'TM':        return c; // placeholder
    case 'FP':        return c; // placeholder
    default:          return c;
  }
}

function calcTotals(rows, monthKeys, formula, feePct) {
  const costByMonth = {};
  for (let i = 0; i < monthKeys.length; i++) costByMonth[monthKeys[i]] = 0;
  let costYear = 0, revYear = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const yCost = monthKeys.reduce((s,k)=> s + Number(row.monthCost[k] || 0), 0);
    const yRev  = computeRevenue(yCost, formula, feePct);
    for (let i = 0; i < monthKeys.length; i++) {
      const k = monthKeys[i];
      costByMonth[k] += Number(row.monthCost[k] || 0);
    }
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
  const str = (s == null ? '' : String(s));
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------------------
// Persistence
// ---------------------
async function saveAll() {
  const msg = $('#odcMsg');
  const pid = getProjectId();
  if (!pid) { msg.textContent = 'Select a project first.'; return; }
  msg.textContent = 'Saving…';

  const months = state.months.map(m => m.ym.slice(0,7));
  const inserts = [];

  for (let i = 0; i < state.rows.length; i++) {
    const row = state.rows[i];
    const type = (row.odc_type || '').trim();
    if (!type) continue;
    for (let j = 0; j < months.length; j++) {
      const mk = months[j];
      const cost = Number(row.monthCost[mk] || 0);
      if (!cost) continue;
      inserts.push({
        project_id: pid,
        odc_type: type,
        ym: mk + '-01',
        cost: cost
      });
    }
  }

  try {
    const yearPrefix = String(state.year) + '-';
    const delRes = await client
      .from('plan_odc')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delRes.error) throw delRes.error;

    if (inserts.length) {
      const insRes = await client.from('plan_odc').insert(inserts);
      if (insRes.error) throw insRes.error;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1200);
  } catch (err) {
    console.error('ODC save error', err);
    msg.textContent = 'Save failed: ' + (err && err.message ? err.message : String(err));
  }
}
