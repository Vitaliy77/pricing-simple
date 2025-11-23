// js/tabs/plan-equipment.js
// Equipment planning tab: month columns for HOURS; saves to plan_equipment.
// Uses tolerant equipmentList from lookups.js: [{equip_type, rate, rate_unit}]

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, equipmentList } from '../data/lookups.js';

export const template = /*html*/ `
  <section class="space-y-4">
    <!-- Header card – aligned with P&L / Employees / Subs -->
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">Equipment (Hours by Month)</h2>
        <p class="text-xs text-slate-500">
          Plan equipment hours by month; costs and revenue are calculated automatically.
        </p>
      </div>
      <div class="flex items-center gap-3 text-xs">
        <label class="inline-flex items-center gap-1">
          <span class="text-slate-600">Year</span>
          <select id="equipYearSelect"
                  class="border border-slate-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          </select>
        </label>

        <button id="equipAddRow"
                class="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-slate-50">
          + Add Row
        </button>
        <button id="equipSave"
                class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          Save
        </button>
      </div>
    </div>

    <!-- Grid card -->
    <div class="bg-white rounded-xl shadow-sm p-4">
      <div id="equipMsg" class="text-sm text-slate-500 mb-3"></div>
      <div id="equipWrap" class="plan-table-wrap overflow-auto border rounded-lg">
        <table id="equipTable" class="plan-table text-xs md:text-sm min-w-full"></table>
      </div>
      <p class="mt-2 text-xs text-slate-500">
        Totals are per year for the selected planning year. Hours are stored in <code>plan_equipment</code>.
      </p>
    </div>
  </section>
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
  const yearSelect = $('#equipYearSelect');

  if (!pid) {
    if (msg) msg.textContent = 'Select or create a project to edit equipment.';
    if (table) table.innerHTML = '';
    return;
  }

  // Year dropdown: 2024–2034, default 2025
  const years = [];
  for (let y = 2024; y <= 2034; y++) years.push(y);
  const defaultYear = 2025;
  if (yearSelect) {
    yearSelect.innerHTML = years
      .map(y => `<option value="${y}" ${y === defaultYear ? 'selected' : ''}>${y}</option>`)
      .join('');
  }

  state.year = defaultYear;
  state.months = monthsForYear(state.year);

  if (msg) msg.textContent = 'Loading…';

  try {
    await loadLookups(); // loads equipmentList, vendors, etc.

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

    // Load plan data for this year
    await loadYearData(pid);

    if (msg) msg.textContent = '';
  } catch (err) {
    console.error('Equipment init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err && err.message ? err.message : String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  // Wire buttons
  $('#equipAddRow')?.addEventListener('click', () => {
    state.rows.push(blankRow());
    withCaretPreserved(() => renderGrid());
  });

  $('#equipSave')?.addEventListener('click', saveAll);

  // Year change
  if (yearSelect) {
    yearSelect.addEventListener('change', async () => {
      const pid2 = getProjectId();
      if (!pid2) return;
      state.year = Number(yearSelect.value || state.year);
      state.months = monthsForYear(state.year);
      if (msg) msg.textContent = 'Loading…';
      try {
        await loadYearData(pid2);
        if (msg) msg.textContent = '';
      } catch (err) {
        console.error('Equipment year change error', err);
        if (msg) msg.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
      }
    });
  }
}

/* ---------------- data loader ---------------- */

async function loadYearData(projectId) {
  const planRes = await client
    .from('plan_equipment')
    .select('equipment_type, ym, hours')
    .eq('project_id', projectId);

  if (planRes.error) throw planRes.error;

  const plan = (planRes.data || []).filter((r) => {
    const k = keyVal(r.ym);
    return k && k.slice(0, 4) === String(state.year);
  });

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
}

/* ---------------- rendering ---------------- */

function renderGrid() {
  const table = $('#equipTable');
  if (!table) return;

  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0, 7));

  let html = '<thead><tr>';

  // One sticky column: Equipment + Rate
  html += `
    <th class="p-2 sticky-col text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b">
      Equipment / Rate
    </th>
  `;

  // Month headers: Jan-25 etc.
  months.forEach((m) => {
    html += `
      <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">
        ${m.label}
      </th>
    `;
  });

  html += `
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Hours</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>
    <th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>
  `;
  html += '</tr></thead><tbody>';

  const eqOptions = (equipmentList || [])
    .map(e => {
      const t = labelEquip(e);
      const rate = Number(e.rate || 0);
      const unit = e.rate_unit ? String(e.rate_unit) : 'hour';
      return (
        '<option value="' + esc(e.equip_type || '') +
        '" data-rate="' + rate +
        '" data-unit="' + esc(unit) + '">' +
        esc(t) +
        '</option>'
      );
    })
    .join('');

  state.rows.forEach((row, idx) => {
    const yearHours = monthKeys.reduce((s, k) => s + Number(row.monthHours[k] || 0), 0);
    const yearCost  = yearHours * Number(row.rate || 0);
    const yearRev   = computeRevenue(yearCost, state.projectFormula, state.projectFeePct);
    const profit    = yearRev - yearCost;

    html += '<tr data-idx="' + idx + '" class="pl-row">';

    // Sticky Equipment + Rate cell (same line)
    html += `
      <td class="p-2 sticky-col bg-white align-middle">
        <div class="flex flex-row items-center gap-2">
          <select class="eqSel border rounded-md px-2 py-1 min-w-56 text-xs">
            <option value="">— Select —</option>
            ${eqOptions}
          </select>
          <input
            class="rateInp border rounded-md px-2 py-1 w-40 bg-slate-50 text-xs"
            value="${esc(fmtRate(row.rate, row.unit))}"
            disabled
          >
        </div>
      </td>
    `;

    // Month inputs (hours)
    monthKeys.forEach(k => {
      const v = (row.monthHours[k] !== undefined && row.monthHours[k] !== null) ? row.monthHours[k] : '';
      html += `
        <td class="p-1 text-right">
          <input
            data-k="${k}"
            class="hrInp border rounded-md px-2 py-1 w-20 text-right text-xs"
            type="number"
            min="0"
            step="0.1"
            value="${v !== '' ? String(v) : ''}"
          >
        </td>
      `;
    });

    // Totals
    html += '<td class="p-2 text-right">' + fmtNum(yearHours) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(yearCost)  + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(yearRev)   + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(profit)    + '</td>';

    // Remove
    html += `
      <td class="p-2 text-right">
        <button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-slate-50">✕</button>
      </td>
    `;

    html += '</tr>';
  });

  // Footer totals
  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += `
    <tr class="font-semibold summary-row">
      <td class="p-2 sticky-col bg-white">Totals</td>
      ${monthKeys.map(k => `
        <td class="p-2 text-right">${fmtNum(totals.hoursByMonth[k])}</td>
      `).join('')}
      <td class="p-2 text-right">${fmtNum(totals.hoursYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear - totals.costYear)}</td>
      <td class="p-2"></td>
    </tr>
  `;

  html += '</tbody>';
  table.innerHTML = html;

  // Restore selected equipment
  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = Number(tr.getAttribute('data-idx'));
    const sel = tr.querySelector('.eqSel');
    if (sel) sel.value = state.rows[i].equip_type || '';
  });

  // Handlers

  // On equipment change, update rate/unit and re-render
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

  // Hours inputs
  table.querySelectorAll('.hrInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest ? e.target.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const k = e.target.getAttribute('data-k');
      let n = (e.target.value === '') ? '' : Number(e.target.value);
      if (n !== '' && !Number.isFinite(n)) n = 0;
      if (idx >= 0 && k) {
        state.rows[idx].monthHours[k] =
          (e.target.value === '') ? '' : Math.max(0, n);
        withCaretPreserved(() => renderGrid());
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });

  // Delete row
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

/* ---------------- helpers ---------------- */

function blankRow() {
  return { equip_type: null, rate: 0, unit: 'hour', monthHours: {} };
}

function monthsForYear(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, i, 1));
    const mm = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); // Jan, Feb...
    const yy = String(year).slice(2); // "25"
    return {
      label: `${mm}-${yy}`,
      ym: d.toISOString().slice(0, 10) // YYYY-MM-01
    };
  });
}

function keyVal(ym) {
  try {
    if (typeof ym === 'string') return ym.slice(0, 7);
    return new Date(ym).toISOString().slice(0, 7);
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
    case 'COST_PLUS':
      return c * (1 + (Number(feePct || 0) / 100));
    case 'TM':
    case 'FP':
    default:
      return c;
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
  return (
    n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }) + '/' + unit
  );
}
function fmtNum(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
function fmtUSD0(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}
function esc(s) {
  const str = (s == null ? '' : String(s));
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- persistence ---------------- */

async function saveAll() {
  const msg = $('#equipMsg');
  const pid = getProjectId();
  if (!pid) {
    if (msg) msg.textContent = 'Select a project first.';
    return;
  }
  if (msg) msg.textContent = 'Saving…';

  const months = state.months.map(m => m.ym.slice(0, 7));
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

    if (msg) {
      msg.textContent = 'Saved.';
      setTimeout(() => { msg.textContent = ''; }, 1200);
    }
  } catch (err) {
    console.error('Equipment save error', err);
    if (msg) {
      msg.textContent =
        'Save failed: ' +
        (err && err.message ? err.message : String(err));
    }
  }
}
