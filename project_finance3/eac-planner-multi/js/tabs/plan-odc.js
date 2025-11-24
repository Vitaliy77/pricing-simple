// js/tabs/plan-odc.js
// Other Direct Cost planning tab: month columns for COST; saves to plan_odc.
// Uses project-level GL actuals from vw_actual_odc_monthly, plus type-level plan.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';

export const template = /*html*/ `
  <section class="space-y-4">
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">Other Direct Cost (Cost by Month)</h2>
        <p class="text-xs text-slate-500">
          Actual ODC from GL is locked; plan ODC types by month for future periods.
        </p>
      </div>

      <div class="flex items-center gap-3 text-xs">
        <label class="inline-flex items-center gap-1">
          <span class="text-slate-600">Year</span>
          <select id="odcYearSelect"
                  class="border border-slate-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          </select>
        </label>

        <button id="odcAddRow"
                class="px-3 py-1.5 rounded-md border bg-white text-slate-700 hover:bg-slate-50">
          + Add Row
        </button>

        <button id="odcSave"
                class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 shadow-sm">
          Save
        </button>
      </div>
    </div>

    <div id="odcMsg" class="text-xs text-slate-500"></div>

    <div class="bg-white rounded-xl shadow-sm p-3 overflow-x-auto">
      <table id="odcTable" class="min-w-full text-xs border-separate border-spacing-y-[2px]"></table>
    </div>

    <p class="mt-1 text-[11px] text-slate-500">
      Actual ODC totals come from <code>vw_actual_odc_monthly</code>. Planned ODC types are stored in <code>plan_odc</code>.
    </p>
  </section>
`;

const state = {
  year: new Date().getUTCFullYear(),
  months: [],
  rows: [], // { odc_type, label, isActualRow, monthCost:{k->num}, monthIsActual:{k->bool} }
  projectFormula: 'TM',
  projectFeePct: 0,
  lastActualYm: null
};

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
    const sel = 'tr[data-idx="' + rowIdx + '"] input.costInp[data-k="' + monthKey + '"]';
    const el = document.querySelector(sel);
    if (el) {
      el.focus();
      if (s !== null && e !== null) {
        try { el.setSelectionRange(s, e); } catch (_) {}
      }
    }
  }
}

/* ---------------- init ---------------- */

export async function init(rootEl) {
  const pid = getProjectId();
  const msg = $('#odcMsg');
  const table = $('#odcTable');
  const yearSelect = $('#odcYearSelect');

  if (!pid) {
    if (msg) msg.textContent = 'Select or create a project to edit ODC.';
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
    state.year = defaultYear;
  } else {
    state.year = new Date().getUTCFullYear();
  }

  state.months = monthsForYear(state.year);

  if (msg) msg.textContent = 'Loading…';

  try {
    await loadYearData(pid);
    if (msg) msg.textContent = '';
  } catch (err) {
    console.error('ODC init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err?.message || String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  $('#odcAddRow')?.addEventListener('click', () => {
    state.rows.push(blankRow());
    withCaretPreserved(renderGrid);
  });

  $('#odcSave')?.addEventListener('click', saveAll);

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
        console.error('ODC year change error', err);
        if (msg) msg.textContent =
          'Load failed: ' + (err && (err.details || err.message) ? (err.details || err.message) : String(err));
      }
    });
  }
}

/* ---------------- data load ---------------- */

async function loadYearData(projectId) {
  const msg = $('#odcMsg');
  const table = $('#odcTable');
  if (table) {
    table.innerHTML = '<tbody><tr><td class="p-3 text-slate-600">Loading…</td></tr></tbody>';
  }

  // Project settings
  const projRes = await client
    .from('projects')
    .select('id, revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (projRes.error) throw projRes.error;
  const proj = projRes.data || {};
  state.projectFormula = proj.revenue_formula || 'TM';
  state.projectFeePct = Number(proj.fee_pct || 0);

  // Plan ODC
  const planRes = await client
    .from('plan_odc')
    .select('odc_type, ym, cost')
    .eq('project_id', projectId);
  if (planRes.error) throw planRes.error;
  const plan = (planRes.data || []).filter(r => {
    const k = keyVal(r.ym);
    return k && k.slice(0, 4) === String(state.year);
  });

  // Actual ODC (project-level) from GL view
  const actRes = await client
    .from('vw_actual_odc_monthly')
    .select('ym, cost')
    .eq('project_id', projectId)
    .gte('ym', state.year + '-01-01')
    .lte('ym', state.year + '-12-31')
    .order('ym');

  if (actRes.error && actRes.error.code !== 'PGRST204') throw actRes.error;
  const actual = actRes.data || [];

  // Last actual month for band
  let last = null;
  for (let i = 0; i < actual.length; i++) {
    const ak = keyVal(actual[i].ym);
    if (ak && (!last || ak > last)) last = ak;
  }
  state.lastActualYm = last;

  const byType = {};

  // Actual row (single row)
  if (actual.length) {
    const actRow = {
      odc_type: '__ACTUAL__',
      label: 'Actual ODC (All Types)',
      isActualRow: true,
      monthCost: {},
      monthIsActual: {}
    };
    for (let i = 0; i < actual.length; i++) {
      const r = actual[i];
      const k = keyVal(r.ym);
      if (!k || k.slice(0, 4) !== String(state.year)) continue;
      actRow.monthCost[k] = Number(r.cost || 0);
      actRow.monthIsActual[k] = true;
    }
    byType['__ACTUAL__'] = actRow;
  }

  // Plan rows per odc_type
  function ensureRow(odcType) {
    if (!byType[odcType]) {
      byType[odcType] = {
        odc_type: odcType,
        label: odcType,
        isActualRow: false,
        monthCost: {},
        monthIsActual: {}
      };
      // lock months <= last actual (plan is for forecast)
      if (state.lastActualYm) {
        const yearPrefix = String(state.year);
        for (let m = 0; m < 12; m++) {
          const d = new Date(Date.UTC(state.year, m, 1));
          const mk = d.toISOString().slice(0, 7);
          if (mk <= state.lastActualYm) {
            byType[odcType].monthIsActual[mk] = true;
          }
        }
      }
    }
    return byType[odcType];
  }

  for (let i = 0; i < plan.length; i++) {
    const r = plan[i];
    const k = keyVal(r.ym);
    if (!k || k.slice(0, 4) !== String(state.year)) continue;
    const row = ensureRow(r.odc_type || 'ODC');
    if (!row.monthIsActual[k]) {
      row.monthCost[k] = Number(r.cost || 0);
    }
  }

  state.rows = Object.values(byType);
  // Place actual row first
  state.rows.sort((a, b) => {
    if (a.isActualRow && !b.isActualRow) return -1;
    if (!a.isActualRow && b.isActualRow) return 1;
    return (a.label || '').localeCompare(b.label || '');
  });

  if (!state.rows.length) state.rows.push(blankRow());

  renderGrid();
}

/* ---------------- render ---------------- */

function renderGrid() {
  const table = $('#odcTable');
  if (!table) return;

  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0, 7));

  let html = '<thead>';

  const last = state.lastActualYm;
  if (last) {
    const actualCount = monthKeys.filter(k => k <= last).length;
    const forecastCount = monthKeys.length - actualCount;
    html += '<tr>';
    html += '<th class="p-1 text-xs text-slate-500 sticky left-0 bg-white"></th>';
    if (actualCount > 0) {
      html += `<th colspan="${actualCount}" class="p-1 text-xs font-semibold text-emerald-700 text-center bg-emerald-50 border-b border-emerald-200">Actuals</th>`;
    }
    if (forecastCount > 0) {
      html += `<th colspan="${forecastCount}" class="p-1 text-xs font-semibold text-sky-700 text-center bg-sky-50 border-b border-sky-200">Forecast</th>`;
    }
    html += '<th colspan="3" class="p-1 text-xs font-semibold text-slate-600 text-center bg-slate-50 border-b">Totals</th>';
    html += '<th class="p-1 bg-slate-50 border-b"></th>';
    html += '</tr>';
  }

  // Main header
  html += '<tr>';
  html += '<th class="p-2 text-left text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 border-b">ODC Type</th>';
  months.forEach(m => {
    html += `<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">${esc(m.label)}</th>`;
  });
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>';
  html += '<th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>';
  html += '</tr></thead><tbody>';

  state.rows.forEach((row, idx) => {
    const yearCost = monthKeys.reduce((s, k) => s + Number(row.monthCost && row.monthCost[k] || 0), 0);
    const yearRev = computeRevenue(yearCost, state.projectFormula, state.projectFeePct);
    const profit = yearRev - yearCost;

    html += `<tr data-idx="${idx}" class="even:bg-slate-50 hover:bg-slate-100 transition-colors">`;

    // Left cell: label or editable type
    if (row.isActualRow) {
      html += `<td class="p-2 sticky left-0 bg-white font-semibold text-slate-700">${esc(row.label || 'Actual ODC')}</td>`;
    } else {
      html += `<td class="p-2 sticky left-0 bg-white">
        <input class="odcTypeInp border rounded-md px-2 py-1 w-40 text-xs"
               type="text"
               value="${esc(row.odc_type || '')}"
               placeholder="e.g., Travel, Software, Supplies">
      </td>`;
    }

    monthKeys.forEach(k => {
      const v = (row.monthCost && row.monthCost[k] !== undefined && row.monthCost[k] !== null)
        ? row.monthCost[k]
        : '';
      const isLocked = row.isActualRow || (row.monthIsActual && row.monthIsActual[k]);
      html += `
        <td class="p-1 text-right">
          <input
            data-k="${k}"
            class="costInp border rounded-md px-2 py-1 w-24 text-right text-xs ${isLocked ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}"
            type="number"
            min="0"
            step="1"
            value="${v !== '' ? String(v) : ''}"
            ${isLocked ? 'disabled' : ''}
          >
        </td>
      `;
    });

    html += `<td class="p-2 text-right font-medium">${fmtUSD0(yearCost)}</td>`;
    html += `<td class="p-2 text-right font-medium">${fmtUSD0(yearRev)}</td>`;
    html += `<td class="p-2 text-right font-medium ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}">${fmtUSD0(profit)}</td>`;

    if (row.isActualRow) {
      html += `<td class="p-2"></td>`;
    } else {
      html += `<td class="p-2 text-right">
        <button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-red-50 text-red-600">
          Remove
        </button>
      </td>`;
    }

    html += '</tr>';
  });

  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += `
    <tr class="font-bold text-slate-900 bg-slate-100 summary-row">
      <td class="p-2 sticky left-0 bg-slate-100">Totals (All Types)</td>
      ${monthKeys.map(k => `<td class="p-2 text-right">${fmtUSD0(totals.costByMonth[k])}</td>`).join('')}
      <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
      <td class="p-2 text-right ${totals.revYear - totals.costYear >= 0 ? 'text-emerald-700' : 'text-red-600'}">
        ${fmtUSD0(totals.revYear - totals.costYear)}
      </td>
      <td class="p-2"></td>
    </tr>
  `;

  html += '</tbody>';
  table.innerHTML = html;

  // Events
  table.querySelectorAll('.odcTypeInp').forEach(inp => {
    inp.addEventListener('change', e => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      state.rows[idx].odc_type = e.target.value || '';
      state.rows[idx].label = state.rows[idx].odc_type;
    });
  });

  table.querySelectorAll('.costInp').forEach(inp => {
    inp.addEventListener('change', e => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      const k = e.target.dataset.k;
      const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0);
      if (!state.rows[idx].monthCost) state.rows[idx].monthCost = {};
      state.rows[idx].monthCost[k] = val;
      withCaretPreserved(renderGrid);
    });
    inp.addEventListener('keydown', e => e.key === 'Enter' && e.target.blur());
  });

  table.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const idx = Number(tr.dataset.idx);
      state.rows.splice(idx, 1);
      if (!state.rows.length) state.rows.push(blankRow());
      withCaretPreserved(renderGrid);
    });
  });
}

/* ---------------- helpers ---------------- */

function blankRow() {
  return {
    odc_type: '',
    label: '',
    isActualRow: false,
    monthCost: {},
    monthIsActual: {}
  };
}

function monthsForYear(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, i, 1));
    const mm = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const yy = String(year).slice(2);
    return { label: `${mm}-${yy}`, ym: d.toISOString().slice(0, 10) };
  });
}

function keyVal(ym) {
  try {
    return typeof ym === 'string' ? ym.slice(0, 7) : new Date(ym).toISOString().slice(0, 7);
  } catch (e) {
    return null;
  }
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
  const cbm = {};
  monthKeys.forEach(k => { cbm[k] = 0; });
  let cy = 0, ry = 0;

  rows.forEach(row => {
    const yc = monthKeys.reduce((s, k) => s + Number(row.monthCost && row.monthCost[k] || 0), 0);
    const rev = computeRevenue(yc, formula, feePct);
    monthKeys.forEach(k => {
      cbm[k] += Number(row.monthCost && row.monthCost[k] || 0);
    });
    cy += yc;
    ry += rev;
  });

  return { costByMonth: cbm, costYear: cy, revYear: ry };
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
  const str = s == null ? '' : String(s);
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

/* ---------------- save ---------------- */

async function saveAll() {
  const msg = $('#odcMsg');
  const pid = getProjectId();
  if (!pid) {
    if (msg) msg.textContent = 'Select a project first.';
    return;
  }

  if (msg) msg.textContent = 'Saving…';

  const months = state.months.map(m => m.ym.slice(0, 7));
  const inserts = [];

  state.rows.forEach(row => {
    if (row.isActualRow) return; // never save the synthetic actual row
    const odcType = (row.odc_type || '').trim();
    if (!odcType) return;

    months.forEach(mk => {
      // Skip months locked as "actual period"
      if (row.monthIsActual && row.monthIsActual[mk]) return;
      const c = Number(row.monthCost && row.monthCost[mk] || 0);
      if (c) {
        inserts.push({
          project_id: pid,
          odc_type: odcType,
          ym: mk + '-01',
          cost: c
        });
      }
    });
  });

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

    if (msg) {
      msg.textContent = 'Saved.';
      setTimeout(() => { msg.textContent = ''; }, 1200);
    }
  } catch (err) {
    console.error('ODC save error', err);
    if (msg) {
      msg.textContent =
        'Save failed: ' +
        (err && (err.details || err.message) ? (err.details || err.message) : String(err));
    }
  }
}
