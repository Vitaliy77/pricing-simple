// js/tabs/plan-subs.js
// Subcontractors planning tab: month columns for COST; saves to plan_subs.
// Now merges GL actuals (vw_actual_subs_monthly) + plan_subs and locks actual months.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';

export const template = /*html*/ `
  <section class="space-y-4">
    <!-- Header card – aligned with P&L / Employees -->
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">Subcontractors (Cost by Month)</h2>
        <p class="text-xs text-slate-500">
          Plan subcontractor costs by month; actuals are locked from GL, and forecast is editable.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <label class="text-xs text-slate-500 flex items-center gap-1">
          Year
          <select id="subsYearSelect" class="border rounded-md px-2 py-1 text-xs">
            <!-- options populated in init -->
          </select>
        </label>
        <div class="flex items-center gap-2">
          <button id="subsAddRow" class="px-3 py-1.5 rounded-md border text-xs hover:bg-slate-50">
            + Add Row
          </button>
          <button id="subsSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-xs text-white hover:bg-blue-700">
            Save
          </button>
        </div>
      </div>
    </div>

    <!-- Message -->
    <div id="subsMsg" class="text-xs text-slate-500"></div>

    <!-- Grid -->
    <div class="bg-white rounded-xl shadow-sm p-3 overflow-x-auto">
      <table id="subsTable" class="min-w-full text-xs border-separate border-spacing-y-[2px]"></table>
    </div>
  </section>
`;

const state = {
  year: new Date().getUTCFullYear(),
  months: [],
  rows: [], // { vendor_id, name, monthCost:{'YYYY-MM':num}, monthIsActual:{'YYYY-MM':bool} }
  projectFormula: 'TM',
  projectFeePct: 0,
  lastActualYm: null,
  vendors: [] // { id, name }
};

/* ---------------- focus/caret preserve helper ---------------- */
function withCaretPreserved(run) {
  const active = document.activeElement;
  const isCell = !!(active && active.classList && active.classList.contains('costInp'));
  const rowEl = active && active.closest ? active.closest('tr') : null;
  const rowIdx = rowEl ? rowEl.getAttribute('data-idx') : null;
  const monthKey = active && active.getAttribute ? active.getAttribute('data-k') : null;
  const s = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const e = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

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
  const msg = $('#subsMsg');
  const table = $('#subsTable');
  const yearSelect = $('#subsYearSelect');

  if (!pid) {
    if (msg) msg.textContent = 'Select or create a project to edit subcontractors.';
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
    console.error('Subs init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err?.message || String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  $('#subsAddRow')?.addEventListener('click', () => {
    state.rows.push(blankRow());
    withCaretPreserved(renderGrid);
  });

  $('#subsSave')?.addEventListener('click', saveAll);

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
        console.error('Subs year change error', err);
        if (msg) {
          msg.textContent =
            'Load failed: ' +
            (err && (err.details || err.message) ? err.details || err.message : String(err));
        }
      }
    });
  }
}

/* ---------------- load year data ---------------- */
async function loadYearData(pid) {
  const msg = $('#subsMsg');
  const table = $('#subsTable');
  if (table) table.innerHTML = '<tbody><tr><td class="p-3">Loading…</td></tr></tbody>';

  // 1) Project settings
  const projRes = await client
    .from('projects')
    .select('id, revenue_formula, fee_pct')
    .eq('id', pid)
    .single();
  if (projRes.error) throw projRes.error;
  const proj = projRes.data || {};
  state.projectFormula = proj.revenue_formula || 'TM';
  state.projectFeePct = Number(proj.fee_pct || 0);

  // 2) Vendors lookup
  const vres = await client.from('sub_vendors').select('id, name').order('name');
  if (vres.error) throw vres.error;
  state.vendors = vres.data || [];

  // 3) Plan subs for the year
  const planRes = await client
    .from('plan_subs')
    .select('vendor_id, ym, cost')
    .eq('project_id', pid);
  if (planRes.error) throw planRes.error;
  const plan = (planRes.data || []).filter((r) => {
    const k = keyVal(r.ym);
    return k && k.slice(0, 4) === String(state.year);
  });

  // 4) Actual subs for the year (per vendor per month)
  const actRes = await client
    .from('vw_actual_subs_monthly')
    .select('vendor_id, ym, cost')
    .eq('project_id', pid)
    .gte('ym', state.year + '-01-01')
    .lte('ym', state.year + '-12-31')
    .order('ym');
  if (actRes.error && actRes.error.code !== 'PGRST204') throw actRes.error;
  const actual = actRes.data || [];

  // 5) Determine last actual month for header band
  let last = null;
  for (let i = 0; i < actual.length; i++) {
    const ak = keyVal(actual[i].ym);
    if (ak && (!last || ak > last)) last = ak;
  }
  state.lastActualYm = last;

  const vendorById = {};
  (state.vendors || []).forEach((v) => {
    vendorById[v.id] = v;
  });

  const byVendor = {};

  function ensureRow(vendorId) {
    if (!byVendor[vendorId]) {
      const v = vendorById[vendorId] || {};
      byVendor[vendorId] = {
        vendor_id: vendorId,
        name: v.name || '',
        monthCost: {},
        monthIsActual: {}
      };
    }
    return byVendor[vendorId];
  }

  // Seed from ACTUALS
  for (let i = 0; i < actual.length; i++) {
    const ar = actual[i];
    const ak = keyVal(ar.ym);
    if (!ak || ak.slice(0, 4) !== String(state.year)) continue;
    const row = ensureRow(ar.vendor_id);
    row.monthCost[ak] = Number(ar.cost || 0);
    row.monthIsActual[ak] = true;
  }

  // Overlay PLAN where there is no actual
  for (let j = 0; j < plan.length; j++) {
    const r = plan[j];
    const pk = keyVal(r.ym);
    if (!pk || pk.slice(0, 4) !== String(state.year)) continue;
    const row = ensureRow(r.vendor_id);
    if (!row.monthIsActual[pk]) {
      row.monthCost[pk] = Number(r.cost || 0);
    }
  }

  state.rows = Object.values(byVendor);
  if (state.rows.length === 0) state.rows.push(blankRow());

  renderGrid();
}

/* ---------------- render ---------------- */
function renderGrid() {
  const table = $('#subsTable');
  if (!table) return;

  const months = state.months;
  const monthKeys = months.map((m) => m.ym.slice(0, 7));

  let html = '<thead>';

  // Actuals vs Forecast band
  const last = state.lastActualYm;
  if (last) {
    const actualCount = monthKeys.filter((k) => k <= last).length;
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
  html += '<th class="p-2 text-left text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 border-b">Vendor</th>';
  months.forEach((m) => {
    html += `<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">${esc(m.label)}</th>`;
  });
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>';
  html += '<th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>';
  html += '</tr></thead><tbody>';

  const vendorOptions = (state.vendors || [])
    .map((v) => `<option value="${esc(v.id)}">${esc(v.name || '')}</option>`)
    .join('');

  // Data rows
  state.rows.forEach((row, idx) => {
    const yearCost = monthKeys.reduce((s, k) => s + Number(row.monthCost[k] || 0), 0);
    const yearRevenue = computeRevenue(yearCost, state.projectFormula, state.projectFeePct);
    const profit = yearRevenue - yearCost;

    html += `<tr data-idx="${idx}" class="even:bg-slate-50 hover:bg-slate-100 transition-colors">`;

    html += `<td class="p-2 sticky left-0 bg-white align-top">
      <select class="vendorSel border rounded-md px-2 py-1 min-w-48 text-xs">
        <option value="">— Select —</option>${vendorOptions}
      </select>
    </td>`;

    monthKeys.forEach((k) => {
      const v = row.monthCost[k] !== undefined ? row.monthCost[k] : '';
      const isActual = !!(row.monthIsActual && row.monthIsActual[k]);
      html += `<td class="p-1 text-right">
        <input
          data-k="${k}"
          class="costInp border rounded-md px-2 py-1 w-24 text-right text-xs ${isActual ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}"
          type="number"
          min="0"
          step="1"
          value="${v !== '' ? v : ''}"
          ${isActual ? 'disabled' : ''}
        >
      </td>`;
    });

    html += `<td class="p-2 text-right font-medium">${fmtUSD0(yearCost)}</td>`;
    html += `<td class="p-2 text-right font-medium">${fmtUSD0(yearRevenue)}</td>`;
    html += `<td class="p-2 text-right font-medium ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}">${fmtUSD0(profit)}</td>`;
    html += `<td class="p-2 text-right">
      <button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-red-50 text-red-600">Remove</button>
    </td>`;

    html += '</tr>';
  });

  // Totals row
  const totals = calcTotals(state.rows, monthKeys);
  html += `<tr class="font-bold text-slate-900 bg-slate-100 summary-row">
    <td class="p-2 sticky left-0 bg-slate-100">Totals</td>
    ${monthKeys.map((k) => `<td class="p-2 text-right">${fmtUSD0(totals.costByMonth[k])}</td>`).join('')}
    <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
    <td class="p-2 text-right ${totals.revYear - totals.costYear >= 0 ? 'text-emerald-700' : 'text-red-600'}">${fmtUSD0(totals.revYear - totals.costYear)}</td>
    <td class="p-2"></td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;

  // Restore vendor selections
  table.querySelectorAll('tr[data-idx]').forEach((tr) => {
    const i = Number(tr.dataset.idx);
    const sel = tr.querySelector('.vendorSel');
    if (sel) sel.value = state.rows[i].vendor_id || '';
  });

  // Events
  table.querySelectorAll('.vendorSel').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      state.rows[idx].vendor_id = e.target.value || null;

      const v = (state.vendors || []).find((x) => x.id === state.rows[idx].vendor_id);
      state.rows[idx].name = v?.name || '';
    });
  });

  table.querySelectorAll('.costInp').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      const k = e.target.dataset.k;
      const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0);
      state.rows[idx].monthCost[k] = val;
      withCaretPreserved(renderGrid);
    });
    inp.addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());
  });

  table.querySelectorAll('.rowDel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.closest('tr').dataset.idx);
      state.rows.splice(idx, 1);
      if (!state.rows.length) state.rows.push(blankRow());
      withCaretPreserved(renderGrid);
    });
  });
}

/* ---------------- helpers ---------------- */
function blankRow() {
  return { vendor_id: null, name: '', monthCost: {}, monthIsActual: {} };
}

function monthsForYear(y) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, i, 1));
    return {
      label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + '-' + String(y).slice(2),
      ym: d.toISOString().slice(0, 10)
    };
  });
}
function keyVal(ym) {
  try {
    return typeof ym === 'string' ? ym.slice(0, 7) : new Date(ym).toISOString().slice(0, 7);
  } catch (e) {
    return null;
  }
}
function computeRevenue(c, f, p) {
  if (!isFinite(c)) return 0;
  c = Number(c);
  return f === 'COST_PLUS' ? c * (1 + (Number(p || 0) / 100)) : c;
}
function calcTotals(rows, keys) {
  const cbm = {};
  keys.forEach((k) => (cbm[k] = 0));
  let cy = 0;
  let ry = 0;
  rows.forEach((r) => {
    const cost = keys.reduce((s, k) => s + Number(r.monthCost[k] || 0), 0);
    const rev = computeRevenue(cost, state.projectFormula, state.projectFeePct);
    keys.forEach((k) => {
      cbm[k] += Number(r.monthCost[k] || 0);
    });
    cy += cost;
    ry += rev;
  });
  return { costByMonth: cbm, costYear: cy, revYear: ry };
}
function fmtUSD0(v) {
  return Number(v || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- save ---------------- */
async function saveAll() {
  const msg = $('#subsMsg');
  const pid = getProjectId();
  if (!pid) {
    if (msg) msg.textContent = 'Select a project first.';
    return;
  }
  if (msg) msg.textContent = 'Saving…';

  try {
    const months = state.months.map((m) => m.ym.slice(0, 7));
    const inserts = [];

    state.rows.forEach((row) => {
      if (!row.vendor_id) return;
      months.forEach((mk) => {
        // Don't overwrite actuals: skip months with actuals
        if (row.monthIsActual && row.monthIsActual[mk]) return;
        const c = Number(row.monthCost[mk] || 0);
        if (c) {
          inserts.push({
            project_id: pid,
            vendor_id: row.vendor_id,
            ym: mk + '-01',
            cost: c
          });
        }
      });
    });

    const yearPrefix = String(state.year) + '-';
    const delRes = await client
      .from('plan_subs')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delRes.error) throw delRes.error;

    if (inserts.length) {
      const insRes = await client.from('plan_subs').insert(inserts);
      if (insRes.error) throw insRes.error;
    }

    if (msg) {
      msg.textContent = 'Saved.';
      setTimeout(() => {
        msg.textContent = '';
      }, 2000);
    }
  } catch (err) {
    console.error('Subs save error', err);
    if (msg) {
      msg.textContent =
        'Save failed: ' +
        (err && (err.details || err.message) ? err.details || err.message : String(err));
    }
  }
}
