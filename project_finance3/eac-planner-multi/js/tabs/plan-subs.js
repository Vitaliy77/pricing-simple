// js/tabs/plan-subs.js
// Subcontractors planning tab: month columns for cost; saves to plan_subs.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, vendors as vendorLookup } from '../data/lookups.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">Subcontractors (Cost by Month)</h2>
      <div class="flex items-center gap-2">
        <button id="subsAddRow" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">+ Add Row</button>
        <button id="subsSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
      </div>
    </div>
    <div id="subsMsg" class="text-sm text-slate-500 mb-3"></div>
    <div class="overflow-x-auto">
      <table id="subsTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>
  </div>
`;

/* ---------------- focus-preserve helper ---------------- */
function withCaretPreserved(run) {
  const active = document.activeElement;
  const isCell = active?.classList?.contains('costInp');
  const rowIdx = active?.closest?.('tr')?.getAttribute?.('data-idx');
  const monthKey = active?.getAttribute?.('data-k');
  const s = active?.selectionStart, e = active?.selectionEnd;

  run(); // re-render

  if (isCell && rowIdx != null && monthKey) {
    const el = document.querySelector(`tr[data-idx="${rowIdx}"] input.costInp[data-k="${monthKey}"]`);
    if (el) {
      el.focus();
      if (s != null && e != null) { try { el.setSelectionRange(s, e); } catch {} }
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

  if (!pid) {
    msg.textContent = 'Select or create a project to edit subcontractors.';
    table.innerHTML = '';
    return;
  }

  // Year from the month picker
  state.year = Number(($('#monthPicker')?.value || new Date().toISOString().slice(0,7)).slice(0,4));
  state.months = monthsForYear(state.year);

  msg.textContent = 'Loading…';
  try {
    await loadLookups();

    // Build vendor caches (dedupe by id and normalized name)
    const { list, byId, idByName } = buildVendorCaches(vendorLookup);
    state._vendorList = list;
    state._venById = byId;
    state._idByName = idByName;

    // Project revenue formula/fee
    const proj = await fetchProject(pid);
    state.projectFormula = proj?.revenue_formula || 'TM';
    state.projectFeePct = Number(proj?.fee_pct || 0);

    // Existing plan for this year
    const plan = await fetchPlanSubs(pid, state.year);

    // Build rows keyed by vendor; drop legacy/stale vendor_ids (forces re-select)
    const rowsByKey = new Map(); // key = vendor_id or synthetic row key
    let rowSeq = 0;

    for (const r of plan) {
      const k = keyVal(r.ym);
      if (!k) continue;

      const exists = !!state._venById[r.vendor_id];
      const key = exists ? r.vendor_id : `row_${rowSeq++}`;

      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          vendor_id: exists ? r.vendor_id : null,     // null if stale
          name: exists ? (state._venById[r.vendor_id]?.name ?? '') : '',
          note: r.note ?? '',
          monthCost: {}
        });
      }
      const row = rowsByKey.get(key);
      row.monthCost[k] = Number(r.cost || 0);
    }

    state.rows = Array.from(rowsByKey.values());
    if (state.rows.length === 0) state.rows.push(blankRow());

    renderGrid();
    msg.textContent = '';
  } catch (err) {
    console.error('Subs init error', err);
    table.innerHTML = `<tbody><tr><td class="p-3 text-red-600">Error: ${err?.message || err}</td></tr></tbody>`;
    msg.textContent = '';
  }

  // Wire buttons
  $('#subsAddRow').onclick = () => { state.rows.push(blankRow()); withCaretPreserved(() => renderGrid()); };
  $('#subsSave').onclick = saveAll;
}

// ---------------------
// Rendering & helpers
// ---------------------
function renderGrid() {
  const table = $('#subsTable');
  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0,7));

  let html = '<thead><tr>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Vendor</th>';
  months.forEach(m => html += `<th class="p-2 text-right">${m.label}</th>`);
  html += `
    <th class="p-2 text-right">Year Cost</th>
    <th class="p-2 text-right">Year Revenue</th>
    <th class="p-2 text-right">Profit</th>
    <th class="p-2 text-left">Note</th>
    <th class="p-2"></th>
  `;
  html += '</tr></thead><tbody>';

  const vendorOptions = (state._vendorList || [])
    .map(v => `<option value="${v.id}" data-name="${esc(v.name || '')}">${esc(v.name || '')}</option>`)
    .join('');

  state.rows.forEach((row, idx) => {
    const costYear = monthKeys.reduce((s,k)=> s + Number(row.monthCost[k] || 0), 0);
    const revYear  = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    const profit   = revYear - costYear;

    html += `<tr data-idx="${idx}">`;

    // Vendor select (value must be UUID)
    html += `<td class="p-2 sticky left-0 bg-white">
      <select class="venSel border rounded-md p-1 min-w-56">
        <option value="">— Select —</option>
        ${vendorOptions}
      </select>
    </td>`;

    // Month inputs (cost)
    monthKeys.forEach(k => {
      const v = row.monthCost[k] ?? '';
      html += `<td class="p-1 text-right">
        <input data-k="${k}" class="costInp border rounded-md p-1 w-24 text-right" type="number" min="0" step="0.01" value="${v !== '' ? String(v) : ''}">
      </td>`;
    });

    // Totals
    html += `<td class="p-2 text-right">${fmtUSD0(costYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(revYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(profit)}</td>`;

    // Note
    html += `<td class="p-2">
      <input class="noteInp border rounded-md p-1 w-56" type="text" placeholder="optional" value="${esc(row.note || '')}">
    </td>`;

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
    ${monthKeys.map(k => `<td class="p-2 text-right">${fmtUSD0(totals.costByMonth[k])}</td>`).join('')}
    <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear - totals.costYear)}</td>
    <td class="p-2" colspan="2"></td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;

  // Set select values
  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = Number(tr.getAttribute('data-idx'));
    const sel = tr.querySelector('.venSel');
    if (sel) sel.value = state.rows[i].vendor_id || '';
  });

  // Wire row handlers
  table.querySelectorAll('.venSel').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      const opt = e.target.selectedOptions[0];
      state.rows[idx].vendor_id = e.target.value || null;         // UUID
      state.rows[idx].name = opt?.dataset?.name || '';
      withCaretPreserved(() => renderGrid());
    });
  });

  // Use 'change' to avoid re-render on each keystroke
  table.querySelectorAll('.costInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      const k = e.target.getAttribute('data-k');
      const n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
      state.rows[idx].monthCost[k] = n === '' ? '' : (Number.isFinite(n) ? n : 0);
      withCaretPreserved(() => renderGrid());
    });
    // optional: prevent Enter from jumping
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });

  table.querySelectorAll('.noteInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      state.rows[idx].note = e.target.value;
    });
  });

  table.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const idx = Number(tr.getAttribute('data-idx'));
      state.rows.splice(idx, 1);
      if (state.rows.length === 0) state.rows.push(blankRow());
      withCaretPreserved(() => renderGrid());
    });
  });
}

function blankRow() {
  return { vendor_id: null, name: '', note: '', monthCost: {} };
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

// Dedupes vendors by UUID and by normalized name
function buildVendorCaches(vendorsArr) {
  // 1) de-dup by UUID
  const byUuidMap = new Map();
  (vendorsArr || []).forEach(v => { if (v?.id) byUuidMap.set(v.id, v); });
  const uniqueById = Array.from(byUuidMap.values());

  // 2) de-dup by normalized name (case/space-insensitive)
  const norm = s => String(s || '').trim().toLowerCase();
  const byNameMap = new Map();
  uniqueById.forEach(v => {
    const k = norm(v.name);
    if (!k) return;
    if (!byNameMap.has(k)) byNameMap.set(k, v);
  });

  const list = Array.from(byNameMap.values())
    .sort((a,b) => String(a.name||'').localeCompare(String(b.name||'')));

  const byId = Object.fromEntries(list.map(v => [v.id, v]));
  const idByName = Object.fromEntries(list.map(v => [String(v.name || ''), v.id]));
  return { list, byId, idByName };
}

function keyVal(ym) {
  try { return (typeof ym === 'string') ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7); }
  catch { return null; }
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
  const costByMonth = {};
  monthKeys.forEach(k => costByMonth[k] = 0);
  let costYear = 0, revYear = 0;

  for (const row of rows) {
    const yCost = monthKeys.reduce((s,k)=> s + Number(row.monthCost[k] || 0), 0);
    const yRev  = computeRevenue(yCost, formula, feePct);
    monthKeys.forEach(k => { costByMonth[k] += Number(row.monthCost[k] || 0); });
    costYear += yCost;
    revYear  += yRev;
  }
  return { costByMonth, costYear, revYear };
}

function fmtUSD0(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* --------------------- Persistence --------------------- */
async function fetchProject(projectId) {
  const { data, error } = await client
    .from('projects')
    .select('id, revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchPlanSubs(projectId, year) {
  const { data, error } = await client
    .from('plan_subs')
    .select('vendor_id, ym, cost, note')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data || []).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
}

async function saveAll() {
  const msg = $('#subsMsg');
  const pid = getProjectId();
  if (!pid) { msg.textContent = 'Select a project first.'; return; }
  msg.textContent = 'Saving…';

  try {
    // Re-fetch authoritative vendor list (avoid stale cache)
    const { data: liveVendors, error: vErr } = await client
      .from('vendors')
      .select('id, name')
      .limit(2000);
    if (vErr) throw vErr;

    const liveSet = new Set((liveVendors || []).map(v => v.id));
    const idByNameLive = Object.fromEntries((liveVendors || []).map(v => [String(v.name || ''), v.id]));

    const months = state.months.map(m => m.ym.slice(0,7));
    const inserts = [];
    const skipped = [];

    for (const row of state.rows) {
      // Resolve/validate vendor_id
      let vendorId = row.vendor_id || null;
      if (!vendorId && row.name && idByNameLive[row.name]) {
        vendorId = idByNameLive[row.name];
        row.vendor_id = vendorId; // cache in UI state
      }

      if (!vendorId || !liveSet.has(vendorId)) {
        const hasAny = months.some(mk => Number(row.monthCost?.[mk] || 0)) || (row.note && row.note.trim() !== '');
        if (hasAny) skipped.push(row.name || '(no vendor selected)');
        continue; // don’t try to insert invalid FK
      }

      for (const mk of months) {
        const cost = Number(row.monthCost?.[mk] || 0);
        const note = (row.note ?? '').trim() || null;
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

    // Wipe this year’s rows for this project, then insert only valid rows
    const yearPrefix = String(state.year) + '-';
    const { error: delErr } = await client
      .from('plan_subs')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delErr) throw delErr;

    if (inserts.length) {
      const { error: insErr } = await client.from('plan_subs').insert(inserts);
      if (insErr) {
        console.error('plan_subs insert error', insErr, { sample: inserts.slice(0,3) });
        throw insErr;
      }
    }

    if (skipped.length) {
      msg.textContent = `Saved with ${skipped.length} row(s) skipped (select a valid vendor): ${skipped.slice(0,3).join(', ')}${skipped.length>3?'…':''}`;
    } else {
      msg.textContent = 'Saved.';
    }
    setTimeout(() => (msg.textContent = ''), 2500);
  } catch (err) {
    console.error('Subs save error', err);
    msg.textContent = `Save failed: ${err?.details || err?.message || String(err)}`;
  }
}
