// js/tabs/plan-equipment.js
// Equipment planning tab: month columns for HOURS; saves to plan_equipment.
// Uses tolerant equipmentList from lookups.js: [{equip_type, rate, rate_unit}]

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, equipmentList } from '../data/lookups.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">Equipment (Hours by Month)</h2>
      <div class="flex items-center gap-2">
        <button id="equipAddRow" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">+ Add Row</button>
        <button id="equipSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
      </div>
    </div>
    <div id="equipMsg" class="text-sm text-slate-500 mb-3"></div>
    <div class="overflow-x-auto">
      <table id="equipTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>
  </div>
`;

/* ---------- keep focus/caret when re-rendering ---------- */
function withCaretPreserved(run) {
  const active = document.activeElement;
  const isCell = !!(active && active.classList && active.classList.contains('hrInp'));
  const rowEl = active && active.closest ? active.closest('tr') : null;
  const rowIdx = rowEl ? rowEl.getAttribute('data-idx') : null;
  const monthKey = active && active.getAttribute ? active.getAttribute('data-k') : null;
  const s = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  const e = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;

  run();

  if (isCell && rowIdx !== null && monthKey) {
    const el = document.querySelector('tr[data-idx="' + rowIdx + '"] input.hrInp[data-k="' + monthKey + '"]');
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
  rows: [], // { equip_type, rate, unit, monthHours: { 'YYYY-MM': number } }
  projectFormula: 'TM',
  projectFeePct: 0
};

export async function init(rootEl) {
  const pid = getProjectId();
  const msg = $('#equipMsg');
  const table = $('#equipTable');

  if (!pid) {
    msg.textContent = 'Select or create a project to edit equipment.';
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
    await loadLookups();

    // Project revenue formula/fee (no optional chaining)
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
      .from('plan_equipment')
      .select('equipment_type, ym, hours')
      .eq('project_id', pid);
    if (planRes.error) throw planRes.error;
    const plan = (planRes.data || []).filter(r => {
      const k = keyVal(r.ym);
      return k && k.slice(0,4) === String(state.year);
    });

    // Build rows by equipment type
    const byType = {};
    for (let i = 0; i < plan.length; i++) {
      const r = plan[i];
      const k = keyVal(r.ym);
      if (!k) continue;

      if (!byType[r.equipment_type]) {
        const meta = findEquipMeta(r.equipment_type);
        byType[r.equipment_type] = {
          equip_type: r.equipment_type,
          rate: meta.rate,
          unit: meta.rate_unit,
          monthHours: {}
        };
      }
      byType[r.equipment_type].monthHours[k] = Number(r.hours || 0);
    }
    state.rows = Object.values(byType);
    if (state.rows.length === 0) state.rows.push(blankRow());

    renderGrid();
    msg.textContent = '';
  } catch (err) {
    console.error('Equipment init error', err);
    table.innerHTML = '<tbody><tr><td class="p-3 text-red-600">Error: ' + (err && err.message ? err.message : String(err)) + '</td></tr></tbody>';
    msg.textContent = '';
  }

  // Wire buttons
  $('#equipAddRow').onclick = () => { state.rows.push(blankRow()); withCaretPreserved(() => renderGrid()); };
  $('#equipSave').onclick = saveAll;
}

// ---------------------
// Rendering & helpers
// ---------------------
function renderGrid() {
  const table = $('#equipTable');
  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0,7));

  let html = '<thead><tr>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Equipment</th>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Rate</th>';
  months.forEach(m => html += '<th class="p-2 text-right">' + m.label + '</th>');
  html += ''
    + '<th class="p-2 text-right">Year Hours</th>'
    + '<th class="p-2 text-right">Year Cost</th>'
    + '<th class="p-2 text-right">Year Revenue</th>'
    + '<th class="p-2 text-right">Profit</th>'
    + '<th class="p-2"></th>';
  html += '</tr></thead><tbody>';

  const eqOptions = (equipmentList || [])
    .map(e => {
      const t = labelEquip(e);
      const rate = Number(e.rate || 0);
      const unit = e.rate_unit ? String(e.rate_unit) : 'hour';
      return '<option value="' + esc(e.equip_type || '') + '" data-rate="' + rate + '" data-unit="' + esc(unit) + '">' + esc(t) + '</option>';
    })
    .join('');

  state.rows.forEach((row, idx) => {
    const yearHours = monthKeys.reduce((s,k)=> s + Number(row.monthHours[k] || 0), 0);
    const yearCost  = yearHours * Number(row.rate || 0);
    const yearRev   = computeRevenue(yearCost, state.projectFormula, state.projectFeePct);
    const profit    = yearRev - yearCost;

    html += '<tr data-idx="' + idx + '">';

    // Equipment select
    html += '<td class="p-2 sticky left-0 bg-white">'
         +  '<select class="eqSel border rounded-md p-1 min-w-56">'
         +  '<option value="">— Select —</option>'
         +   eqOptions
         +  '</select>'
         +  '</td>';

    // Rate (readonly)
    html += '<td class="p-2 sticky left-0 bg-white">'
         +  '<input class="rateInp border rounded-md p-1 w-40 bg-slate-50" value="' + fmtRate(row.rate, row.unit) + '" disabled>'
         +  '</td>';

    // Month inputs (hours)
    monthKeys.forEach(k => {
      const v = (row.monthHours[k] !== undefined && row.monthHours[k] !== null) ? row.monthHours[k] : '';
      html += '<td class="p-1 text-right">'
           +  '<input data-k="' + k + '" class="hrInp border rounded-md p-1 w-20 text-right" type="number" min="0" step="0.1" value="' + (v !== '' ? String(v) : '') + '">'
           +  '</td>';
    });

    // Totals
    html += '<td class="p-2 text-right">' + fmtNum(yearHours) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(yearCost)  + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(yearRev)   + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(profit)    + '</td>';

    // Remove
    html += '<td class="p-2 text-right">'
         +  '<button class="rowDel px-2 py-1 rounded-md border hover:bg-slate-50">✕</button>'
         +  '</td>';

    html += '</tr>';
  });

  // Footer totals
  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += '<tr class="font-semibold">'
      +  '<td class="p-2 sticky left-0 bg-white">Totals</td>'
      +  '<td class="p-2 sticky left-0 bg-white"></td>'
      +   monthKeys.map(k => '<td class="p-2 text-right">' + fmtNum(totals.hoursByMonth[k]) + '</td>').join('')
      +  '<td class="p-2 text-right">' + fmtNum(totals.hoursYear) + '</td>'
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.costYear) + '</td>'
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.revYear)  + '</td>'
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.revYear - totals.costYear) + '</td>'
      +  '<td class="p-2"></td>'
      +  '</tr>';

  html += '</tbody>';
  table.innerHTML = html;

  // Set selects
  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = Number(tr.getAttribute('data-idx'));
    const sel = tr.querySelector('.eqSel');
    if (sel) sel.value = state.rows[i].equip_type || '';
  });

  // Handlers

  // On equipment change, update rate/unit; re-render preserving caret
  table.querySelectorAll('.eqSel').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const tr = e.target.closest ? e.target.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const opt = (e.target.selectedOptions && e.target.selectedOptions[0]) ? e.target.selectedOptions[0] : null;
      const type = e.target.value || '';
      const rate = opt ? Number(opt.getAttribute('data-rate') || 0) : 0;
      const unit = opt ? (opt.getAttribute('data-unit') || 'hour') : 'hour';
      if (idx >= 0) {
        state.rows[idx].equip_type = type || null;
        state.rows[idx].rate = rate;
        state.rows[idx].unit = unit;
        withCaretPreserved(() => renderGrid());
      }
    });
  });

  // IMPORTANT: commit on change/blur, not on every keystroke
  table.querySelectorAll('.hrInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest ? e.target.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const k = e.target.getAttribute('data-k');
      let n = (e.target.value === '') ? '' : Number(e.target.value);
      if (n !== '' && !Number.isFinite(n)) n = 0;
      if (idx >= 0 && k) {
        state.rows[idx].monthHours[k] = (e.target.value === '') ? '' : Math.max(0, n);
        withCaretPreserved(() => renderGrid());
      }
    });
    // prevent Enter from jumping
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
  return { equip_type: null, rate: 0, unit: 'hour', monthHours: {} };
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

function labelEquip(e) {
  const t = e.equip_type ? e.equip_type : (e.name ? e.name : '');
  const r = Number(e.rate || 0);
  const u = e.rate_unit ? e.rate_unit : 'hour';
  return r ? (t + ' — ' + fmtRate(r, u)) : t;
}

function findEquipMeta(type) {
  const arr = equipmentList || [];
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    const key = x.equip_type ? x.equip_type : (x.name ? x.name : '');
    if (key === type) {
      return {
        rate: Number(x.rate || 0),
        rate_unit: x.rate_unit ? x.rate_unit : 'hour'
      };
    }
  }
  return { rate: 0, rate_unit: 'hour' };
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
  const hoursByMonth = {};
  monthKeys.forEach(k => hoursByMonth[k] = 0);
  let hoursYear = 0, costYear = 0, revYear = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const hYear = monthKeys.reduce((s,k)=> s + Number(row.monthHours[k] || 0), 0);
    const cost  = hYear * Number(row.rate || 0);
    const rev   = computeRevenue(cost, formula, feePct);

    monthKeys.forEach(k => { hoursByMonth[k] += Number(row.monthHours[k] || 0); });
    hoursYear += hYear;
    costYear  += cost;
    revYear   += rev;
  }
  return { hoursByMonth, hoursYear, costYear, revYear };
}

function fmtRate(rate, unit='hour') {
  const n = Number(rate || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) + '/' + unit;
}
function fmtNum(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
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
  const msg = $('#equipMsg');
  const pid = getProjectId();
  if (!pid) { msg.textContent = 'Select a project first.'; return; }
  msg.textContent = 'Saving…';

  const months = state.months.map(m => m.ym.slice(0,7));
  const inserts = [];

  for (let i = 0; i < state.rows.length; i++) {
    const row = state.rows[i];
    if (!row.equip_type) continue;
    for (let j = 0; j < months.length; j++) {
      const mk = months[j];
      const hrs = Number(row.monthHours[mk] || 0);
      if (!hrs) continue;
      inserts.push({
        project_id: pid,
        equipment_type: row.equip_type,
        ym: mk + '-01',
        hours: hrs
      });
    }
  }

  try {
    const yearPrefix = String(state.year) + '-';
    const delRes = await client
      .from('plan_equipment')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delRes.error) throw delRes.error;

    if (inserts.length) {
      const insRes = await client.from('plan_equipment').insert(inserts);
      if (insRes.error) throw insRes.error;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1200);
  } catch (err) {
    console.error('Equipment save error', err);
    msg.textContent = 'Save failed: ' + (err && err.message ? err.message : String(err));
  }
}
