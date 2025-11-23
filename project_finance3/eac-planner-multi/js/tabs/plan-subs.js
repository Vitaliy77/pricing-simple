// js/tabs/plan-subs.js
// Subcontractors planning tab: month columns for cost; saves to plan_subs.

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
          Plan subcontractor costs by month; revenue and profit are calculated automatically.
        </p>
      </div>
      <div class="flex items-center gap-3 text-xs">
        <label class="inline-flex items-center gap-1">
          <span class="text-slate-600">Year</span>
          <select id="subsYearSelect"
                  class="border border-slate-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          </select>
        </label>

        <button id="subsAddRow"
                class="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-slate-50">
          + Add Row
        </button>
        <button id="subsSave"
                class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          Save
        </button>
      </div>
    </div>

    <!-- Grid card -->
    <div class="bg-white rounded-xl shadow-sm p-4">
      <div id="subsMsg" class="text-sm text-slate-500 mb-3"></div>
      <div id="subsWrap" class="plan-table-wrap overflow-auto border rounded-lg">
        <table id="subsTable" class="plan-table text-xs md:text-sm min-w-full"></table>
      </div>
      <p class="mt-2 text-xs text-slate-500">
        Totals are per year for the selected planning year. Costs are stored in <code>plan_subs</code>.
      </p>
    </div>
  </section>
`;

/* ---------------- focus-preserve helper ---------------- */
function withCaretPreserved(run) {
  const active = document.activeElement;
  const isCell = !!(active && active.classList && active.classList.contains('costInp'));
  const rowEl = active && active.closest ? active.closest('tr') : null;
  const rowIdx = rowEl ? rowEl.getAttribute('data-idx') : null;
  const monthKey = active && active.getAttribute ? active.getAttribute('data-k') : null;
  const s = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  const e = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;

  run(); // re-render

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

let state = {
  year: new Date().getUTCFullYear(),
  months: [],
  rows: [], // { vendor_id, name, note, monthCost: { 'YYYY-MM': number } }
  projectFormula: 'TM',
  projectFeePct: 0,
  _vendorList: [],
  _venById: {},
  _idByName: {}
};

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
  }

  state.year = defaultYear;
  state.months = monthsForYear(state.year);

  if (msg) msg.textContent = 'Loading…';

  try {
    await loadVendorCaches();
    await loadProjectSettings(pid);
    await loadYearData(pid);
    if (msg) msg.textContent = '';
  } catch (err) {
    console.error('Subs init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err && err.message ? err.message : String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  // Buttons
  $('#subsAddRow')?.addEventListener('click', () => {
    state.rows.push(blankRow());
    withCaretPreserved(() => renderGrid());
  });

  $('#subsSave')?.addEventListener('click', saveAll);

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
        console.error('Subs year change error', err);
        if (msg) msg.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
      }
    });
  }
}

/* ---------------- data loaders ---------------- */

async function loadVendorCaches() {
  const resSV = await client.from('sub_vendors').select('id, name').limit(2000);
  if (resSV.error) throw resSV.error;
  const liveSubs = resSV.data || [];

  const caches = buildVendorCaches(liveSubs);
  state._vendorList = caches.list;
  state._venById = caches.byId;
  state._idByName = caches.idByName;
}

async function loadProjectSettings(projectId) {
  const projRes = await client
    .from('projects')
    .select('id, revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (projRes.error) throw projRes.error;
  const proj = projRes.data || {};
  state.projectFormula = proj.revenue_formula || 'TM';
  state.projectFeePct = Number(proj.fee_pct || 0);
}

async function loadYearData(projectId) {
  const planRes = await client
    .from('plan_subs')
    .select('vendor_id, ym, cost, note')
    .eq('project_id', projectId);

  if (planRes.error) throw planRes.error;
  const plan = (planRes.data || []).filter((r) => {
    const yk = keyVal(r.ym);
    return yk && yk.slice(0, 4) === String(state.year);
  });

  const rowsByKey = new Map();
  let rowSeq = 0;

  for (let i = 0; i < plan.length; i++) {
    const r = plan[i];
    const k = keyVal(r.ym);
    if (!k) continue;

    const exists = !!state._venById[r.vendor_id];
    const key = exists ? r.vendor_id : 'row_' + rowSeq++;

    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        vendor_id: exists ? r.vendor_id : null,
        name: exists ? (state._venById[r.vendor_id] && state._venById[r.vendor_id].name) || '' : '',
        note: r.note || '',
        monthCost: {}
      });
    }
    const row = rowsByKey.get(key);
    row.monthCost[k] = Number(r.cost || 0);
  }

  state.rows = Array.from(rowsByKey.values());
  if (state.rows.length === 0) state.rows.push(blankRow());

  renderGrid();
}

/* ---------------- rendering ---------------- */

function renderGrid() {
  const table = $('#subsTable');
  if (!table) return;

  const months = state.months;
  const monthKeys = months.map((m) => m.ym.slice(0, 7));

  let html = '<thead><tr>';

  // Sticky vendor column
  html += `
    <th class="p-2 sticky-col text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b">
      Vendor
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
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>
    <th class="p-2 text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b">Note</th>
    <th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>
  `;
  html += '</tr></thead><tbody>';

  const vendorOptions = (state._vendorList || [])
    .map((v) => {
      return (
        '<option value="' +
        v.id +
        '" data-name="' +
        esc(v.name || '') +
        '">' +
        esc(v.name || '') +
        '</option>'
      );
    })
    .join('');

  state.rows.forEach((row, idx) => {
    const costYear = monthKeys.reduce((s, k) => s + Number(row.monthCost[k] || 0), 0);
    const revYear = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    const profit = revYear - costYear;

    html += '<tr data-idx="' + idx + '" class="pl-row">';

    // Sticky vendor select
    html +=
      '<td class="p-2 sticky-col bg-white align-middle">' +
      '<select class="venSel border rounded-md px-2 py-1 min-w-56 text-xs">' +
      '<option value="">— Select —</option>' +
      vendorOptions +
      '</select>' +
      '</td>';

    // Month inputs
    monthKeys.forEach((k) => {
      const v =
        row.monthCost && row.monthCost[k] !== undefined && row.monthCost[k] !== null
          ? row.monthCost[k]
          : '';
      html +=
        '<td class="p-1 text-right">' +
        '<input data-k="' +
        k +
        '" class="costInp border rounded-md px-2 py-1 w-24 text-right text-xs" type="number" min="0" step="0.01" value="' +
        (v !== '' ? String(v) : '') +
        '">' +
        '</td>';
    });

    // Totals
    html += '<td class="p-2 text-right">' + fmtUSD0(costYear) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(revYear) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(profit) + '</td>';

    // Note
    html +=
      '<td class="p-2">' +
      '<input class="noteInp border rounded-md px-2 py-1 w-56 text-xs" type="text" placeholder="optional" value="' +
      esc(row.note || '') +
      '">' +
      '</td>';

    // Remove
    html +=
      '<td class="p-2 text-right">' +
      '<button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-slate-50">✕</button>' +
      '</td>';

    html += '</tr>';
  });

  // Footer totals
  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html +=
    '<tr class="font-semibold summary-row">' +
    '<td class="p-2 sticky-col bg-white">Totals</td>' +
    monthKeys
      .map((k) => '<td class="p-2 text-right">' + fmtUSD0(totals.costByMonth[k]) + '</td>')
      .join('') +
    '<td class="p-2 text-right">' +
    fmtUSD0(totals.costYear) +
    '</td>' +
    '<td class="p-2 text-right">' +
    fmtUSD0(totals.revYear) +
    '</td>' +
    '<td class="p-2 text-right">' +
    fmtUSD0(totals.revYear - totals.costYear) +
    '</td>' +
    '<td class="p-2" colspan="2"></td>' +
    '</tr>';

  html += '</tbody>';
  table.innerHTML = html;

  // Set select values
  table.querySelectorAll('tr[data-idx]').forEach((tr) => {
    const i = Number(tr.getAttribute('data-idx'));
    const sel = tr.querySelector('.venSel');
    if (sel) sel.value = state.rows[i].vendor_id || '';
  });

  // Handlers
  table.querySelectorAll('.venSel').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const tr = e.target.closest && e.target.closest('tr');
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const opt =
        e.target.selectedOptions && e.target.selectedOptions[0]
          ? e.target.selectedOptions[0]
          : null;
      state.rows[idx].vendor_id = e.target.value || null;
      state.rows[idx].name = opt && opt.getAttribute('data-name') ? opt.getAttribute('data-name') : '';
      withCaretPreserved(() => renderGrid());
    });
  });

  table.querySelectorAll('.costInp').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest && e.target.closest('tr');
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const k = e.target.getAttribute('data-k');
      const n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
      state.rows[idx].monthCost[k] =
        e.target.value === '' ? '' : (isFinite(n) ? n : 0);
      withCaretPreserved(() => renderGrid());
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
    });
  });

  table.querySelectorAll('.noteInp').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest && e.target.closest('tr');
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      state.rows[idx].note = e.target.value;
    });
  });

  table.querySelectorAll('.rowDel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tr = btn.closest && btn.closest('tr');
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
  return { vendor_id: null, name: '', note: '', monthCost: {} };
}

function monthsForYear(year) {
  const arr = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(year, i, 1));
    const mm = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); // Jan, Feb...
    const yy = String(year).slice(2); // "25"
    arr.push({
      label: `${mm}-${yy}`,
      ym: d.toISOString().slice(0, 10)
    });
  }
  return arr;
}

// Dedupes vendors by UUID and by normalized name
function buildVendorCaches(vendorsArr) {
  const byUuidMap = new Map();
  (vendorsArr || []).forEach((v) => {
    if (v && v.id) byUuidMap.set(v.id, v);
  });
  const uniqueById = Array.from(byUuidMap.values());

  const norm = (s) => String(s || '').trim().toLowerCase();
  const byNameMap = new Map();
  uniqueById.forEach((v) => {
    const k = norm(v.name);
    if (!k) return;
    if (!byNameMap.has(k)) byNameMap.set(k, v);
  });

  const list = Array.from(byNameMap.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );

  const byId = {};
  const idByName = {};
  list.forEach((v) => {
    byId[v.id] = v;
    idByName[String(v.name || '')] = v.id;
  });
  return { list, byId, idByName };
}

function keyVal(ym) {
  try {
    if (typeof ym === 'string') return ym.slice(0, 7);
    return new Date(ym).toISOString().slice(0, 7);
  } catch (_) {
    return null;
  }
}

function computeRevenue(cost, formula, feePct) {
  const c = Number(cost);
  if (!isFinite(c)) return 0;
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
  const costByMonth = {};
  monthKeys.forEach((k) => {
    costByMonth[k] = 0;
  });
  let costYear = 0;
  let revYear = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const yCost = monthKeys.reduce(
      (s, k) => s + Number(row.monthCost && row.monthCost[k] || 0),
      0
    );
    const yRev = computeRevenue(yCost, formula, feePct);
    monthKeys.forEach((k) => {
      costByMonth[k] += Number(row.monthCost && row.monthCost[k] || 0);
    });
    costYear += yCost;
    revYear += yRev;
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
  const str = s == null ? '' : String(s);
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- persistence ---------------- */

async function saveAll() {
  const msg = $('#subsMsg');
  const pid = getProjectId();
  if (!pid) {
    if (msg) msg.textContent = 'Select a project first.';
    return;
  }
  if (msg) msg.textContent = 'Saving…';

  try {
    const vres = await client.from('sub_vendors').select('id, name').limit(2000);
    if (vres.error) throw vres.error;
    const liveVendors = vres.data || [];
    const liveSet = new Set(liveVendors.map((v) => v.id));
    const idByNameLive = {};
    liveVendors.forEach((v) => {
      idByNameLive[String(v.name || '')] = v.id;
    });

    const months = state.months.map((m) => m.ym.slice(0, 7));
    const inserts = [];
    const skipped = [];

    for (let i = 0; i < state.rows.length; i++) {
      const row = state.rows[i];
      let vendorId = row.vendor_id || null;
      if (!vendorId && row.name && idByNameLive[row.name]) {
        vendorId = idByNameLive[row.name];
        row.vendor_id = vendorId;
      }
      if (!vendorId || !liveSet.has(vendorId)) {
        const hasAny =
          months.some((mk) => Number(row.monthCost && row.monthCost[mk] || 0)) ||
          (row.note && row.note.trim() !== '');
        if (hasAny) skipped.push(row.name || '(no vendor selected)');
        continue;
      }
      for (let j = 0; j < months.length; j++) {
        const mk = months[j];
        const cost = Number(row.monthCost && row.monthCost[mk] || 0);
        const note = (row.note || '').trim() || null;
        if (!cost && !note) continue;
        inserts.push({
          project_id: pid,
          vendor_id: vendorId,
          ym: mk + '-01',
          cost,
          note
        });
      }
    }

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
      if (insRes.error) {
        console.error('plan_subs insert error', insRes, { sample: inserts.slice(0, 3) });
        throw insRes.error;
      }
    }

    if (msg) {
      msg.textContent = skipped.length
        ? 'Saved with ' + skipped.length + ' row(s) skipped (select a valid vendor).'
        : 'Saved.';
      setTimeout(() => {
        msg.textContent = '';
      }, 2500);
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
