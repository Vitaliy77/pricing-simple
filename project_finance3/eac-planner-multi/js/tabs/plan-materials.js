// js/tabs/plan-materials.js
// Materials planning tab: month columns for QTY; saves to plan_materials.
// Uses tolerant materialsList from lookups.js: [{sku, description, unit_cost, waste_pct}]

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, materialsList } from '../data/lookups.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">Materials (Qty by Month)</h2>
      <div class="flex items-center gap-2">
        <button id="matAddRow" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">+ Add Row</button>
        <button id="matSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
      </div>
    </div>
    <div id="matMsg" class="text-sm text-slate-500 mb-3"></div>
    <div class="overflow-x-auto">
      <table id="matTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>
  </div>
`;

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

  if (!pid) {
    msg.textContent = 'Select or create a project to edit materials.';
    table.innerHTML = '';
    return;
  }

  // Year from the month picker
  state.year = Number(($('#monthPicker')?.value || new Date().toISOString().slice(0,7)).slice(0,4));
  state.months = monthsForYear(state.year);

  msg.textContent = 'Loading…';
  try {
    await loadLookups();

    // Project revenue formula/fee
    const proj = await fetchProject(pid);
    state.projectFormula = proj?.revenue_formula || 'TM';
    state.projectFeePct = Number(proj?.fee_pct || 0);

    // Existing plan (this year)
    const plan = await fetchPlanMaterials(pid, state.year);

    const bySku = {};
    for (const r of plan) {
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
    msg.textContent = '';
  } catch (err) {
    console.error('Materials init error', err);
    table.innerHTML = `<tbody><tr><td class="p-3 text-red-600">Error: ${err?.message || err}</td></tr></tbody>`;
    msg.textContent = '';
  }

  // Wire buttons
  $('#matAddRow').onclick = () => { state.rows.push(blankRow()); renderGrid(true); };
  $('#matSave').onclick = saveAll;
}

// ---------------------
// Rendering & helpers
// ---------------------
function renderGrid(preserveFocus=false) {
  const table = $('#matTable');
  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0,7));

  let html = '<thead><tr>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Material</th>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Unit Cost</th>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Waste %</th>';
  months.forEach(m => html += `<th class="p-2 text-right">${m.label}</th>`);
  html += `
    <th class="p-2 text-right">Year Qty</th>
    <th class="p-2 text-right">Year Cost</th>
    <th class="p-2 text-right">Year Revenue</th>
    <th class="p-2 text-right">Profit</th>
    <th class="p-2"></th>
  `;
  html += '</tr></thead><tbody>';

  const matOptions = materialsList
    .map(m => `<option value="${esc(m.sku || '')}" data-desc="${esc(m.description||'')}" data-unit="${Number(m.unit_cost||0)}" data-waste="${Number(m.waste_pct||0)}">${esc(labelMaterial(m))}</option>`)
    .join('');

  state.rows.forEach((row, idx) => {
    const yearQty  = monthKeys.reduce((s,k)=> s + Number(row.monthQty[k] || 0), 0);
    const yearCost = yearQty * loadedUnitCost(row.unit_cost, row.waste_pct);
    const yearRev  = computeRevenue(yearCost, state.projectFormula, state.projectFeePct);
    const profit   = yearRev - yearCost;

    html += `<tr data-idx="${idx}">`;

    // Material select
    html += `<td class="p-2 sticky left-0 bg-white">
      <select class="matSel border rounded-md p-1 min-w-56">
        <option value="">— Select —</option>
        ${matOptions}
      </select>
      <div class="text-xs text-slate-500">${esc(row.description || '')}</div>
    </td>`;

    // Unit cost & waste (readonly)
    html += `<td class="p-2 sticky left-0 bg-white">
      <input class="ucInp border rounded-md p-1 w-36 bg-slate-50" value="${fmtUSD0(row.unit_cost)}" disabled>
    </td>`;
    html += `<td class="p-2 sticky left-0 bg-white">
      <input class="wasteInp border rounded-md p-1 w-20 bg-slate-50" value="${fmtPct(row.waste_pct)}" disabled>
    </td>`;

    // Month inputs (qty)
    monthKeys.forEach(k => {
      const v = row.monthQty[k] ?? '';
      html += `<td class="p-1 text-right">
        <input data-k="${k}" class="qtyInp border rounded-md p-1 w-20 text-right" type="number" min="0" step="0.01" value="${v !== '' ? String(v) : ''}">
      </td>`;
    });

    // Totals
    html += `<td class="p-2 text-right">${fmtNum(yearQty)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(yearCost)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(yearRev)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(profit)}</td>`;

    // Remove
    html += `<td class="p-2 text-right">
      <button class="rowDel px-2 py-1 rounded-md border hover:bg-slate-50">✕</button>
    </td>`;

    html += '</tr>';
  });

  // Footer totals
  const totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += `<tr class="font-semibold">
    <td class="p-2 sticky left-0 bg-white">Totals</td>
    <td class="p-2 sticky left-0 bg-white"></td>
    <td class="p-2 sticky left-0 bg-white"></td>
    ${monthKeys.map(k => `<td class="p-2 text-right">${fmtNum(totals.qtyByMonth[k])}</td>`).join('')}
    <td class="p-2 text-right">${fmtNum(totals.qtyYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear - totals.costYear)}</td>
    <td class="p-2"></td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;

  // Set selects
  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = Number(tr.getAttribute('data-idx'));
    const sel = tr.querySelector('.matSel');
    if (sel) sel.value = state.rows[i].sku || '';
  });

  // Wire row handlers
  table.querySelectorAll('.matSel').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      const opt = e.target.selectedOptions[0];
      const sku   = e.target.value || '';
      const desc  = opt?.dataset?.desc || '';
      const unit  = Number(opt?.dataset?.unit || 0);
      const waste = Number(opt?.dataset?.waste || 0);
      state.rows[idx].sku = sku || null;
      state.rows[idx].description = desc;
      state.rows[idx].unit_cost = unit;
      state.rows[idx].waste_pct = waste;
      renderGrid(true);
    });
  });

  table.querySelectorAll('.qtyInp').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      const k = e.target.getAttribute('data-k');
      const n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
      state.rows[idx].monthQty[k] = n === '' ? '' : (Number.isFinite(n) ? n : 0);
      renderGrid(true);
    });
  });

  table.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      state.rows.splice(idx, 1);
      if (state.rows.length === 0) state.rows.push(blankRow());
      renderGrid(true);
    });
  });
}

function blankRow() {
  return { sku: null, description: '', unit_cost: 0, waste_pct: 0, monthQty: {} };
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
  try { return (typeof ym === 'string') ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7); }
  catch { return null; }
}

function labelMaterial(m) {
  const d = m.description ?? '';
  const u = Number(m.unit_cost || 0);
  return u ? `${m.sku ?? ''} — ${d} — ${fmtUSD0(u)}/unit` : `${m.sku ?? ''} — ${d}`;
}

function findMaterialMeta(sku) {
  const found = (materialsList || []).find(x => x.sku === sku) || {};
  return {
    description: found.description ?? '',
    unit_cost: Number(found.unit_cost || 0),
    waste_pct: Number(found.waste_pct || 0)
  };
}

function loadedUnitCost(unitCost, wastePct) {
  const u = Number(unitCost || 0);
  const w = Number(wastePct || 0);
  return u * (1 + w);
}

function computeRevenue(cost, formula, feePct) {
  if (!Number.isFinite(cost)) return 0;
  switch (formula) {
    case 'COST_PLUS': return cost * (1 + (Number(feePct || 0) / 100));
    case 'TM':        return cost; // placeholder
    case 'FP':        return cost; // placeholder
    default:          return cost;
  }
}

function calcTotals(rows, monthKeys, formula, feePct) {
  const qtyByMonth = {};
  monthKeys.forEach(k => qtyByMonth[k] = 0);
  let qtyYear = 0, costYear = 0, revYear = 0;

  for (const row of rows) {
    const qYear = monthKeys.reduce((s,k)=> s + Number(row.monthQty[k] || 0), 0);
    const cost  = qYear * loadedUnitCost(row.unit_cost, row.waste_pct);
    const rev   = computeRevenue(cost, formula, feePct);

    monthKeys.forEach(k => { qtyByMonth[k] += Number(row.monthQty[k] || 0); });
    qtyYear += qYear;
    costYear  += cost;
    revYear   += rev;
  }
  return { qtyByMonth, qtyYear, costYear, revYear };
}

function fmtNum(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function fmtUSD0(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtPct(v) {
  const n = Number(v || 0) * 100;
  return n.toFixed(0) + '%';
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------------------
// Persistence
// ---------------------
async function fetchProject(projectId) {
  const { data, error } = await client
    .from('projects')
    .select('id, revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchPlanMaterials(projectId, year) {
  const { data, error } = await client
    .from('plan_materials')
    .select('sku, ym, qty')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data || []).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
}

async function saveAll() {
  const msg = $('#matMsg');
  const pid = getProjectId();
  if (!pid) { msg.textContent = 'Select a project first.'; return; }
  msg.textContent = 'Saving…';

  const months = state.months.map(m => m.ym.slice(0,7));
  const inserts = [];

  for (const row of state.rows) {
    if (!row.sku) continue;
    for (const mk of months) {
      const qty = Number(row.monthQty[mk] || 0);
      if (!qty) continue;
      inserts.push({
        project_id: pid,
        sku: row.sku,
        ym: mk + '-01',
        qty
      });
    }
  }

  try {
    const yearPrefix = String(state.year) + '-';
    const { error: delErr } = await client
      .from('plan_materials')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delErr) throw delErr;

    if (inserts.length) {
      const { error: insErr } = await client.from('plan_materials').insert(inserts);
      if (insErr) throw insErr;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1200);
  } catch (err) {
    console.error('Materials save error', err);
    msg.textContent = `Save failed: ${err?.message || err}`;
  }
}
