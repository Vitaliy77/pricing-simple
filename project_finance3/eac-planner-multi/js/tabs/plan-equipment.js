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
        Actuals months are locked; forecast months are editable. Hours are stored in <code>plan_equipment</code>.
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
  projectFeePct: 0,
  lastActualYm: null // 'YYYY-MM' of last equipment actual (from actuals_monthly)
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
    await loadLookups(); // loads equipmentList, etc.

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

    // Determine last actual month for equipment from actuals_monthly
    const actRes = await client
      .from('actuals_monthly')
      .select('ym')
      .eq('project_id', pid)
      .eq('category', 'equipment')
      .order('ym');

    if (actRes.error && actRes.error.code !== 'PGRST204') throw actRes.error;
    let last = null;
    (actRes.data || []).forEach(r => {
      const k = keyVal(r.ym);
      if (k && (!last || k > last)) last = k;
    });
    state.lastActualYm = last; // e.g. '2025-03'

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
  const last = state.lastActualYm; // 'YYYY-MM' or null

  let html = '<thead>';

  // Actuals vs Forecast band (like Employees tab)
  if (last) {
    const actualCount = monthKeys.filter(k => k <= last).length;
    const forecastCount = monthKeys.length - actualCount;

    html += '<tr>';
    html += '<th class="p-1 text-xs text-slate-500 sticky-col bg-white"></th>';
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
          </select
