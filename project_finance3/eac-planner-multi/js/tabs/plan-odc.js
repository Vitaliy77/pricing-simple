// js/tabs/plan-odc.js
// Other Direct Cost planning tab: month columns for COST; saves to plan_odc.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';

export const template = /*html*/ `
  <section class="space-y-4">
    <!-- Header card – aligned with other planning tabs -->
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">Other Direct Cost (Cost by Month)</h2>
        <p class="text-xs text-slate-500">
          Plan ODC categories by month; revenue and profit are derived from project settings.
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
                class="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-slate-50">
          + Add Row
        </button>
        <button id="odcSave"
                class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          Save
        </button>
      </div>
    </div>

    <!-- Grid card -->
    <div class="bg-white rounded-xl shadow-sm p-4">
      <div id="odcMsg" class="text-sm text-slate-500 mb-3"></div>
      <div id="odcWrap" class="plan-table-wrap overflow-auto border rounded-lg">
        <table id="odcTable" class="plan-table text-xs md:text-sm min-w-full"></table>
      </div>
      <p class="mt-2 text-xs text-slate-500">
        Totals are calculated for the selected year only. Rows are stored in <code>plan_odc</code>.
      </p>
    </div>
  </section>
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
    const el = document.querySelector(
      'tr[data-idx="' + rowIdx + '"] input.costInp[data-k="' + monthKey + '"]'
    );
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
  }

  state.year = defaultYear;
  state.months = monthsForYear(state.year);

  if (msg) msg.textContent = 'Loading…';

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

    // Load ODC data for this year
    await loadYearData(pid);

    if (msg) msg.textContent = '';
  } catch (err) {
    console.error('ODC init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err && err.message ? err.message : String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  // Wire buttons
  $('#odcAddRow')?.addEventListener('click', () => {
    state.rows.push(blankRow());
    withCaretPreserved(() => renderGrid());
  });

  $('#odcSave')?.addEventListener('click', saveAll);

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
        console.error('ODC year change error', err);
        if (msg) msg.textContent =
          'Error: ' + (err && err.message ? err.message : String(err));
      }
    });
  }
}

/* ---------------- data loader ---------------- */

async function loadYearData(projectId) {
  const planRes = await client
    .from('plan_odc')
    .select('odc_type, ym, cost')
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
    const t = r.odc_type ? String(r.odc_type) : '';
    if (!byType[t]) byType[t] = { odc_type: t, monthCost: {} };
    byType[t].monthCost[k] = Number(r.cost || 0);
  }

  state.rows = Object.values(byType);
  if (state.rows.length === 0) state.rows.push(blankRow());

  renderGrid();
}

/* ---------------- rendering ---------------- */

function renderGrid() {
  const table = $('#odcTable');
  if (!table) return;

  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0, 7));

  let html = '<thead><tr>';

  // Sticky left column: ODC Type
  html += `
    <th class="p-2 sticky-col text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b">
      ODC Type
    </th>
  `;

  // Month headers: Jan-25 style
  months.forEach((m) => {
    html += `
      <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">
        ${m.label}
      </th>
    `;
  });

  html += `
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>
    <th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>
  `;

  html += '</tr></thead><tbody>';

  for (let idx = 0; idx < state.rows.length; idx++) {
    const row = state.rows[idx];
    const costYear = monthKeys.reduce((s,k)=> s + Number(row.monthCost && row.monthCost[k] || 0), 0);
    const revYear  = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    const profit   = revYear - costYear;

    html += '<tr data-idx="' + idx + '" class="pl-row">';

    // ODC Type input (sticky)
    html += `
      <td class="p-2 sticky-col bg-white align-top">
        <input
          class="typeInp border rounded-md px-2 py-1 min-w-56 text-xs"
          type="text"
          placeholder="e.g., Travel, Permits"
          value="${esc(row.odc_type || '')}"
        >
      </td>
    `;

    // Month inputs
    for (let i = 0; i < monthKeys.length; i++) {
      const k = monthKeys[i];
      const v =
        row.monthCost && row.monthCost[k] !== undefined && row.monthCost[k] !== null
          ? row.monthCost[k]
          : '';
      html += `
        <td class="p-1 text-right">
          <input
            data-k="${k}"
            class="costInp border rounded-md px-2 py-1 w-24 text-right text-xs"
            type="number"
            min="0"
            step="0.01"
            value="${v !== '' ? String(v) : ''}"
          >
        </td>
      `;
    }

    // Totals
    html += '<td class="p-2 text-right">' + fmtUSD0(costYear) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(revYear)  + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(profit)   + '</td>';

    // Remove
    html += `
      <td class="p-2 text-right">
        <button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-slate-50">✕</button>
      </td>
    `;

    html += '</tr>';
  }

  // Footer totals
  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += `
    <tr class="font-semibold summary-row">
      <td class="p-2 sticky-col bg-white">Totals</td>
      ${monthKeys.map(k => `
        <td class="p-2 text-right">${fmtUSD0(totals.costByMonth[k])}</td>
      `).join('')}
      <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear - totals.costYear)}</td>
      <td class="p-2"></td>
    </tr>
  `;

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

  table.querySelectorAll('.costInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest ? e.target.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const k = e.target.getAttribute('data-k');
      let n = (e.target.value === '') ? '' : Number(e.target.value);
      if (n !== '' && !Number.isFinite(n)) n = 0;
      if (idx >= 0 && k) {
        state.rows[idx].monthCost[k] =
          (e.target.value === '') ? '' : Math.max(0, n);
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

/* ---------------- helpers ---------------- */

function blankRow() {
  return { odc_type: '', monthCost: {} };
}

function monthsForYear(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, i, 1));
    const mm = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); // Jan, Feb
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

function computeRevenue(cost, formula, feePct) {
  const c = Number(cost || 0);
  switch (formula) {
    case 'COST_PLUS': return c * (1 + (Number(feePct || 0) / 100));
    case 'TM':
    case 'FP':
    default:
      return c;
  }
}

function calcTotals(rows, monthKeys, formula, feePct) {
  const costByMonth = {};
  monthKeys.forEach(k => { costByMonth[k] = 0; });
  let costYear = 0, revYear = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const yCost = monthKeys.reduce(
      (s,k)=> s + Number(row.monthCost && row.monthCost[k] || 0),
      0
    );
    const yRev  = computeRevenue(yCost, formula, feePct);

    monthKeys.forEach((k) => {
      costByMonth[k] += Number(row.monthCost && row.monthCost[k] || 0);
    });
    costYear += yCost;
    revYear  += yRev;
  }
  return { costByMonth, costYear, revYear };
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
  return str.replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

/* ---------------- persistence ---------------- */

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

  for (let i = 0; i < state.rows.length; i++) {
    const row = state.rows[i];
    const type = (row.odc_type || '').trim();
    if (!type) continue;
    for (let j = 0; j < months.length; j++) {
      const mk = months[j];
      const cost = Number(row.monthCost && row.monthCost[mk] || 0);
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

    if (msg) {
      msg.textContent = 'Saved.';
      setTimeout(() => { msg.textContent = ''; }, 1200);
    }
  } catch (err) {
    console.error('ODC save error', err);
    if (msg) {
      msg.textContent =
        'Save failed: ' +
        (err && err.message ? err.message : String(err));
    }
  }
}
