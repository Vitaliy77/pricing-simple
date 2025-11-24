// js/tabs/plan-materials.js
// Materials planning tab: month columns for QTY; saves to plan_materials.
// Merges GL actuals from vw_actual_materials_monthly with plan_materials.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, materialsList } from '../data/lookups.js';

export const template = /*html*/ `
  <section class="space-y-4">
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">Materials (Qty by Month)</h2>
        <p class="text-xs text-slate-500">
          Plan material quantities by month; GL actuals are locked, forecast is editable.
        </p>
      </div>

      <div class="flex items-center gap-3 text-xs">
        <label class="inline-flex items-center gap-1">
          <span class="text-slate-600">Year</span>
          <select id="matYearSelect"
                  class="border border-slate-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          </select>
        </label>

        <button id="matAddRow"
                class="px-3 py-1.5 rounded-md border bg-white text-slate-700 hover:bg-slate-50">
          + Add Row
        </button>

        <button id="matSave"
                class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 shadow-sm">
          Save
        </button>
      </div>
    </div>

    <div id="matMsg" class="text-xs text-slate-500"></div>

    <div class="bg-white rounded-xl shadow-sm p-3 overflow-x-auto">
      <table id="matTable" class="min-w-full text-xs border-separate border-spacing-y-[2px]"></table>
    </div>

    <p class="mt-1 text-[11px] text-slate-500">
      Quantities are stored in <code>plan_materials</code>. Actuals are read-only from <code>vw_actual_materials_monthly</code>.
    </p>
  </section>
`;

const state = {
  year: new Date().getUTCFullYear(),
  months: [],
  rows: [], // { sku, description, unit_cost, monthQty:{k->num}, monthIsActual:{k->bool} }
  projectFormula: 'TM',
  projectFeePct: 0,
  lastActualYm: null,
  matLookup: []
};

/* ---------- keep focus/caret on re-render ---------- */
function withCaretPreserved(run) {
  const active = document.activeElement;
  const isCell = !!(active && active.classList && active.classList.contains('qtyInp'));
  const rowEl = active && active.closest ? active.closest('tr') : null;
  const rowIdx = rowEl ? rowEl.getAttribute('data-idx') : null;
  const monthKey = active && active.getAttribute ? active.getAttribute('data-k') : null;
  const s = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  const e = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;

  run();

  if (isCell && rowIdx !== null && monthKey) {
    const sel = 'tr[data-idx="' + rowIdx + '"] input.qtyInp[data-k="' + monthKey + '"]';
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
  const msg = $('#matMsg');
  const table = $('#matTable');
  const yearSelect = $('#matYearSelect');

  if (!pid) {
    if (msg) msg.textContent = 'Select or create a project to edit materials.';
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
    await loadLookups();
    state.matLookup = materialsList || [];
    await loadYearData(pid);
    if (msg) msg.textContent = '';
  } catch (err) {
    console.error('Materials init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err?.message || String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  $('#matAddRow')?.addEventListener('click', () => {
    state.rows.push(blankRow());
    withCaretPreserved(renderGrid);
  });

  $('#matSave')?.addEventListener('click', saveAll);

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
        console.error('Materials year change error', err);
        if (msg) msg.textContent =
          'Load failed: ' + (err && (err.details || err.message) ? (err.details || err.message) : String(err));
      }
    });
  }
}

/* ---------------- data load ---------------- */

async function loadYearData(projectId) {
  const msg = $('#matMsg');
  const table = $('#matTable');
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

  // Plan materials
  const planRes = await client
    .from('plan_materials')
    .select('sku, ym, qty')
    .eq('project_id', projectId);
  if (planRes.error) throw planRes.error;
  const plan = (planRes.data || []).filter(r => {
    const k = keyVal(r.ym);
    return k && k.slice(0, 4) === String(state.year);
  });

  // Actual materials (monthly) from view
  const actRes = await client
    .from('vw_actual_materials_monthly')
    .select('sku, ym, qty, cost')
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

  const matBySku = {};
  (state.matLookup || []).forEach(m => { if (m.sku) matBySku[m.sku] = m; });

  const bySku = {};

  function ensureRow(sku) {
    if (!bySku[sku]) {
      const meta = matBySku[sku] || {};
      bySku[sku] = {
        sku,
        description: meta.description || '',
        unit_cost: Number(meta.unit_cost || 0),
        monthQty: {},
        monthIsActual: {}
      };
    }
    return bySku[sku];
  }

  // Seed from ACTUALS
  for (let i = 0; i < actual.length; i++) {
    const ar = actual[i];
    const ak = keyVal(ar.ym);
    if (!ak || ak.slice(0, 4) !== String(state.year)) continue;
    const row = ensureRow(ar.sku || '');
    row.monthQty[ak] = Number(ar.qty || 0);
    row.monthIsActual[ak] = true;
  }

  // Overlay PLAN where no actual
  for (let i = 0; i < plan.length; i++) {
    const r = plan[i];
    const pk = keyVal(r.ym);
    if (!pk || pk.slice(0, 4) !== String(state.year)) continue;
    const row = ensureRow(r.sku || '');
    if (!row.monthIsActual[pk]) {
      row.monthQty[pk] = Number(r.qty || 0);
    }
  }

  state.rows = Object.values(bySku);
  if (!state.rows.length) state.rows.push(blankRow());

  renderGrid();
}

/* ---------------- render ---------------- */

function renderGrid() {
  const table = $('#matTable');
  if (!table) return;

  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0, 7));

  let html = '<thead>';

  // Actuals vs Forecast band
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
    html += '<th colspan="4" class="p-1 text-xs font-semibold text-slate-600 text-center bg-slate-50 border-b">Totals</th>';
    html += '<th class="p-1 bg-slate-50 border-b"></th>';
    html += '</tr>';
  }

  // Main header row
  html += '<tr>';
  html += '<th class="p-2 text-left text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 border-b">Material</th>';
  months.forEach(m => {
    html += `<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">${esc(m.label)}</th>`;
  });
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Qty</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>';
  html += '<th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>';
  html += '</tr></thead><tbody>';

  const matOptions = (state.matLookup || [])
    .map(m => {
      const label = m.sku || '';
      const desc = m.description || '';
      const unitCost = Number(m.unit_cost || 0);
      const pricing = unitCost ? `${fmtUSD0(unitCost)}/unit` : '';
      let text = label;
      if (desc) text += ` — ${desc}`;
      if (pricing) text += ` (${pricing})`;
      return `<option value="${esc(label)}" data-cost="${unitCost}">${esc(text)}</option>`;
    })
    .join('');

  state.rows.forEach((row, idx) => {
    const yearQty = monthKeys.reduce((s, k) => s + Number(row.monthQty && row.monthQty[k] || 0), 0);
    const yearCost = yearQty * Number(row.unit_cost || 0);
    const yearRev = computeRevenue(yearCost, state.projectFormula, state.projectFeePct);
    const profit = yearRev - yearCost;

    html += `<tr data-idx="${idx}" class="even:bg-slate-50 hover:bg-slate-100 transition-colors">`;

    // Left cell: material select + description
    const descLine = row.description || '';
    const unitCostLabel = row.unit_cost ? `${fmtUSD0(row.unit_cost)}/unit` : '';
    html += `
      <td class="p-2 sticky left-0 bg-white align-top">
        <div class="flex flex-col gap-1">
          <select class="matSel border rounded-md px-2 py-1 min-w-60 text-xs">
            <option value="">— Select —</option>${matOptions}
          </select>
          <div class="text-[11px] text-slate-500">
            ${esc(descLine)}${descLine && unitCostLabel ? ' · ' : ''}${esc(unitCostLabel)}
          </div>
        </div>
      </td>
    `;

    monthKeys.forEach(k => {
      const v = (row.monthQty && row.monthQty[k] !== undefined && row.monthQty[k] !== null)
        ? row.monthQty[k]
        : '';
      const isActual = !!(row.monthIsActual && row.monthIsActual[k]);
      html += `
        <td class="p-1 text-right">
          <input
            data-k="${k}"
            class="qtyInp border rounded-md px-2 py-1 w-20 text-right text-xs ${isActual ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}"
            type="number"
            min="0"
            step="0.01"
            value="${v !== '' ? String(v) : ''}"
            ${isActual ? 'disabled' : ''}
          >
        </td>
      `;
    });

    html += `<td class="p-2 text-right font-medium">${fmtNum(yearQty)}</td>`;
    html += `<td class="p-2 text-right font-medium">${fmtUSD0(yearCost)}</td>`;
    html += `<td class="p-2 text-right font-medium">${fmtUSD0(yearRev)}</td>`;
    html += `<td class="p-2 text-right font-medium ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}">${fmtUSD0(profit)}</td>`;
    html += `
      <td class="p-2 text-right">
        <button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-red-50 text-red-600">
          Remove
        </button>
      </td>
    `;

    html += '</tr>';
  });

  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += `
    <tr class="font-bold text-slate-900 bg-slate-100 summary-row">
      <td class="p-2 sticky left-0 bg-slate-100">Totals</td>
      ${monthKeys.map(k => `<td class="p-2 text-right">${fmtNum(totals.qtyByMonth[k])}</td>`).join('')}
      <td class="p-2 text-right">${fmtNum(totals.qtyYear)}</td>
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

  // Restore selects
  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = Number(tr.dataset.idx);
    const sel = tr.querySelector('.matSel');
    if (sel) sel.value = state.rows[i].sku || '';
  });

  // Events
  table.querySelectorAll('.matSel').forEach(sel => {
    sel.addEventListener('change', e => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      const opt = e.target.selectedOptions[0];
      const sku = e.target.value || '';
      state.rows[idx].sku = sku;

      const meta = (state.matLookup || []).find(m => m.sku === sku) || {};
      state.rows[idx].description = meta.description || '';
      state.rows[idx].unit_cost = Number(meta.unit_cost || 0);

      withCaretPreserved(renderGrid);
    });
  });

  table.querySelectorAll('.qtyInp').forEach(inp => {
    inp.addEventListener('change', e => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      const k = e.target.dataset.k;
      const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0);
      if (!state.rows[idx].monthQty) state.rows[idx].monthQty = {};
      state.rows[idx].monthQty[k] = val;
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
    sku: null,
    description: '',
    unit_cost: 0,
    monthQty: {},
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
  const qbm = {};
  monthKeys.forEach(k => { qbm[k] = 0; });
  let qtyYear = 0, costYear = 0, revYear = 0;

  rows.forEach(row => {
    const unitCost = Number(row.unit_cost || 0);
    const yq = monthKeys.reduce((s, k) => s + Number(row.monthQty && row.monthQty[k] || 0), 0);
    const cost = yq * unitCost;
    const rev = computeRevenue(cost, formula, feePct);

    monthKeys.forEach(k => {
      qbm[k] += Number(row.monthQty && row.monthQty[k] || 0);
    });

    qtyYear += yq;
    costYear += cost;
    revYear += rev;
  });

  return { qtyByMonth: qbm, qtyYear, costYear, revYear };
}

function fmtNum(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
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
  const msg = $('#matMsg');
  const pid = getProjectId();
  if (!pid) {
    if (msg) msg.textContent = 'Select a project first.';
    return;
  }

  if (msg) msg.textContent = 'Saving…';

  const months = state.months.map(m => m.ym.slice(0, 7));
  const inserts = [];

  state.rows.forEach(row => {
    if (!row.sku) return;
    months.forEach(mk => {
      // Skip months that are actuals
      if (row.monthIsActual && row.monthIsActual[mk]) return;
      const qty = Number(row.monthQty && row.monthQty[mk] || 0);
      if (qty) {
        inserts.push({
          project_id: pid,
          sku: row.sku,
          ym: mk + '-01',
          qty
        });
      }
    });
  });

  try {
    const yearPrefix = String(state.year) + '-';
    const delRes = await client
      .from('plan_materials')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delRes.error) throw delRes.error;

    if (inserts.length) {
      const insRes = await client.from('plan_materials').insert(inserts);
      if (insRes.error) throw insRes.error;
    }

    if (msg) {
      msg.textContent = 'Saved.';
      setTimeout(() => { msg.textContent = ''; }, 1200);
    }
  } catch (err) {
    console.error('Materials save error', err);
    if (msg) {
      msg.textContent =
        'Save failed: ' + (err && (err.details || err.message) ? (err.details || err.message) : String(err));
    }
  }
}
