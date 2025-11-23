// js/tabs/plan-materials.js
// Materials planning tab: month columns for QTY; saves to plan_materials.
// Uses tolerant materialsList from lookups.js: [{sku, description, unit_cost, waste_pct}]

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, materialsList } from '../data/lookups.js';

export const template = /*html*/ `
  <section class="space-y-4">
    <!-- Header card – aligned with other planning tabs -->
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">Materials (Qty by Month)</h2>
        <p class="text-xs text-slate-500">
          Plan material quantities by month; costs and revenue are calculated automatically.
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
                class="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-slate-50">
          + Add Row
        </button>
        <button id="matSave"
                class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          Save
        </button>
      </div>
    </div>

    <!-- Grid card -->
    <div class="bg-white rounded-xl shadow-sm p-4">
      <div id="matMsg" class="text-sm text-slate-500 mb-3"></div>
      <div id="matWrap" class="plan-table-wrap overflow-auto border rounded-lg">
        <table id="matTable" class="plan-table text-xs md:text-sm min-w-full"></table>
      </div>
      <p class="mt-2 text-xs text-slate-500">
        Totals are per year for the selected planning year. Quantities are stored in <code>plan_materials</code>.
      </p>
    </div>
  </section>
`;

/* ---------- keep focus/caret when re-rendering ---------- */
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
    const el = document.querySelector(
      'tr[data-idx="' + rowIdx + '"] input.qtyInp[data-k="' + monthKey + '"]'
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
  rows: [], // { sku, description, unit_cost, waste_pct, monthQty: { 'YYYY-MM': number } }
  projectFormula: 'TM',
  projectFeePct: 0
};

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
  }

  state.year = defaultYear;
  state.months = monthsForYear(state.year);

  if (msg) msg.textContent = 'Loading…';

  try {
    await loadLookups();

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
    console.error('Materials init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err && err.message ? err.message : String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  // Wire buttons
  $('#matAddRow')?.addEventListener('click', () => {
    state.rows.push(blankRow());
    withCaretPreserved(() => renderGrid());
  });

  $('#matSave')?.addEventListener('click', saveAll);

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
        console.error('Materials year change error', err);
        if (msg) msg.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
      }
    });
  }
}

/* ---------------- data loader ---------------- */

async function loadYearData(projectId) {
  const planRes = await client
    .from('plan_materials')
    .select('sku, ym, qty')
    .eq('project_id', projectId);

  if (planRes.error) throw planRes.error;

  const plan = (planRes.data || []).filter((r) => {
    const k = keyVal(r.ym);
    return k && k.slice(0, 4) === String(state.year);
  });

  const bySku = {};
  for (let i = 0; i < plan.length; i++) {
    const r = plan[i];
    const k = keyVal(r.ym);
    if (!k) continue;

    const meta = findMaterialMeta(r.sku);
    if (!bySku[r.sku]) {
      bySku[r.sku] = {
        sku: r.sku,
        description: meta.description,
        unit_cost: meta.unit_cost,
        waste_pct: meta.waste_pct,
        monthQty: {}
      };
    }
    bySku[r.sku].monthQty[k] = Number(r.qty || 0);
  }

  state.rows = Object.values(bySku);
  if (state.rows.length === 0) state.rows.push(blankRow());

  renderGrid();
}

/* ---------------- rendering ---------------- */

function renderGrid() {
  const table = $('#matTable');
  if (!table) return;

  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0, 7));

  let html = '<thead><tr>';

  // Sticky Material column (select + description)
  html += `
    <th class="p-2 sticky-col text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b">
      Material
    </th>
  `;

  // Unit cost + Waste header
  html += `
    <th class="p-2 text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b">
      Unit Cost
    </th>
    <th class="p-2 text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b">
      Waste %
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
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Qty</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>
    <th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>
  `;

  html += '</tr></thead><tbody>';

  const matOptions = (materialsList || [])
    .map(m => {
      const sku   = m.sku ? String(m.sku) : '';
      const desc  = m.description ? String(m.description) : '';
      const unit  = Number(m.unit_cost || 0);
      const waste = Number(m.waste_pct || 0);
      return (
        '<option value="' + esc(sku) + '"' +
        ' data-desc="' + esc(desc) + '"' +
        ' data-unit="' + unit + '"' +
        ' data-waste="' + waste + '"' +
        '>' + esc(labelMaterial(m)) + '</option>'
      );
    })
    .join('');

  for (let idx = 0; idx < state.rows.length; idx++) {
    const row = state.rows[idx];
    const yearQty  = monthKeys.reduce((s,k)=> s + Number(row.monthQty[k] || 0), 0);
    const yearCost = yearQty * loadedUnitCost(row.unit_cost, row.waste_pct);
    const yearRev  = computeRevenue(yearCost, state.projectFormula, state.projectFeePct);
    const profit   = yearRev - yearCost;

    html += '<tr data-idx="' + idx + '" class="pl-row">';

    // Material sticky cell
    html += `
      <td class="p-2 sticky-col bg-white align-top">
        <div class="flex flex-col gap-1">
          <select class="matSel border rounded-md px-2 py-1 min-w-56 text-xs">
            <option value="">— Select —</option>
            ${matOptions}
          </select>
          <div class="text-[0.7rem] text-slate-500 truncate max-w-xs">
            ${esc(row.description || '')}
          </div>
        </div>
      </td>
    `;

    // Unit cost & waste (readonly)
    html += `
      <td class="p-2 align-middle">
        <input
          class="ucInp border rounded-md px-2 py-1 w-32 bg-slate-50 text-xs"
          value="${esc(fmtUSD0(row.unit_cost))}"
          disabled
        >
      </td>
      <td class="p-2 align-middle">
        <input
          class="wasteInp border rounded-md px-2 py-1 w-20 bg-slate-50 text-xs"
          value="${esc(fmtPct(row.waste_pct))}"
          disabled
        >
      </td>
    `;

    // Month inputs (qty)
    monthKeys.forEach((k) => {
      const v =
        row.monthQty && row.monthQty[k] !== undefined && row.monthQty[k] !== null
          ? row.monthQty[k]
          : '';
      html += `
        <td class="p-1 text-right">
          <input
            data-k="${k}"
            class="qtyInp border rounded-md px-2 py-1 w-20 text-right text-xs"
            type="number"
            min="0"
            step="0.01"
            value="${v !== '' ? String(v) : ''}"
          >
        </td>
      `;
    });

    // Totals
    html += '<td class="p-2 text-right">' + fmtNum(yearQty) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(yearCost) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(yearRev)  + '</td>';
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
      <td class="p-2"></td>
      <td class="p-2"></td>
      ${monthKeys.map(k => `
        <td class="p-2 text-right">${fmtNum(totals.qtyByMonth[k])}</td>
      `).join('')}
      <td class="p-2 text-right">${fmtNum(totals.qtyYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear - totals.costYear)}</td>
      <td class="p-2"></td>
    </tr>
  `;

  html += '</tbody>';
  table.innerHTML = html;

  // Set selects to current values
  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = Number(tr.getAttribute('data-idx'));
    const sel = tr.querySelector('.matSel');
    if (sel) sel.value = state.rows[i].sku || '';
  });

  // Handlers

  // Material change -> update meta; re-render preserving caret
  table.querySelectorAll('.matSel').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const tr = e.target.closest ? e.target.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const opt = (e.target.selectedOptions && e.target.selectedOptions[0]) ? e.target.selectedOptions[0] : null;
      const sku   = e.target.value || '';
      const desc  = opt ? (opt.getAttribute('data-desc') || '') : '';
      const unit  = opt ? Number(opt.getAttribute('data-unit') || 0) : 0;
      const waste = opt ? Number(opt.getAttribute('data-waste') || 0) : 0;
      if (idx >= 0) {
        state.rows[idx].sku = sku || null;
        state.rows[idx].description = desc;
        state.rows[idx].unit_cost = unit;
        state.rows[idx].waste_pct = waste;
        withCaretPreserved(() => renderGrid());
      }
    });
  });

  // Qty inputs
  table.querySelectorAll('.qtyInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest ? e.target.closest('tr') : null;
      const idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      const k = e.target.getAttribute('data-k');
      let n = (e.target.value === '') ? '' : Number(e.target.value);
      if (n !== '' && !Number.isFinite(n)) n = 0;
      if (idx >= 0 && k) {
        state.rows[idx].monthQty[k] =
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
  return { sku: null, description: '', unit_cost: 0, waste_pct: 0, monthQty: {} };
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

function labelMaterial(m) {
  const d = m.description ? m.description : '';
  const u = Number(m.unit_cost || 0);
  const sku = m.sku ? m.sku : '';
  return u ? (sku + ' — ' + d + ' — ' + fmtUSD0(u) + '/unit') : (sku + ' — ' + d);
}

function findMaterialMeta(sku) {
  const arr = materialsList || [];
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x.sku === sku) {
      return {
        description: x.description ? x.description : '',
        unit_cost: Number(x.unit_cost || 0),
        waste_pct: Number(x.waste_pct || 0)
      };
    }
  }
  return { description: '', unit_cost: 0, waste_pct: 0 };
}

// loaded unit cost with waste factor (assumes waste_pct is fraction: 0.05 => 5%)
function loadedUnitCost(unitCost, wastePct) {
  const u = Number(unitCost || 0);
  const w = Number(wastePct || 0);
  return u * (1 + w);
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
  const qtyByMonth = {};
  monthKeys.forEach(k => qtyByMonth[k] = 0);
  let qtyYear = 0, costYear = 0, revYear = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const qYear = monthKeys.reduce((s,k)=> s + Number(row.monthQty && row.monthQty[k] || 0), 0);
    const cost  = qYear * loadedUnitCost(row.unit_cost, row.waste_pct);
    const rev   = computeRevenue(cost, formula, feePct);

    monthKeys.forEach((k) => {
      qtyByMonth[k] += Number(row.monthQty && row.monthQty[k] || 0);
    });
    qtyYear  += qYear;
    costYear += cost;
    revYear  += rev;
  }
  return { qtyByMonth, qtyYear, costYear, revYear };
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
function fmtPct(v) {
  const n = Number(v || 0) * 100; // assumes fraction in DB (0.05 => 5%)
  return n.toFixed(0) + '%';
}
function esc(s) {
  const str = (s == null ? '' : String(s));
  return str.replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

/* ---------------- persistence ---------------- */

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

  for (let i = 0; i < state.rows.length; i++) {
    const row = state.rows[i];
    if (!row.sku) continue;
    for (let j = 0; j < months.length; j++) {
      const mk = months[j];
      const qty = Number(row.monthQty && row.monthQty[mk] || 0);
      if (!qty) continue;
      inserts.push({
        project_id: pid,
        sku: row.sku,
        ym: mk + '-01',
        qty: qty
      });
    }
  }

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
        'Save failed: ' +
        (err && err.message ? err.message : String(err));
    }
  }
}
