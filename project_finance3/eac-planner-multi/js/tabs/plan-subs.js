// js/tabs/plan-subs.js
// Subcontractors planning tab: month columns for cost; saves to plan_subs.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';

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

/* ---------------- focus-preserve helper (no optional chaining) ---------------- */
function withCaretPreserved(run) {
  var active = document.activeElement;
  var isCell = !!(active && active.classList && active.classList.contains('costInp'));
  var rowEl = active ? active.closest && active.closest('tr') : null;
  var rowIdx = rowEl ? rowEl.getAttribute('data-idx') : null;
  var monthKey = active ? active.getAttribute && active.getAttribute('data-k') : null;
  var s = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  var e = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;

  run(); // re-render

  if (isCell && rowIdx !== null && monthKey) {
    var sel = 'tr[data-idx="' + rowIdx + '"] input.costInp[data-k="' + monthKey + '"]';
    var el = document.querySelector(sel);
    if (el) {
      el.focus();
      if (s !== null && e !== null) {
        try { el.setSelectionRange(s, e); } catch (_) {}
      }
    }
  }
}

var state = {
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
  var pid = getProjectId();
  var msg = $('#subsMsg');
  var table = $('#subsTable');

  if (!pid) {
    msg.textContent = 'Select or create a project to edit subcontractors.';
    table.innerHTML = '';
    return;
  }

  // Year from the month picker
  var mp = $('#monthPicker');
  var mpVal = mp && mp.value ? mp.value : new Date().toISOString().slice(0,7);
  state.year = Number(mpVal.slice(0,4));
  state.months = monthsForYear(state.year);

  msg.textContent = 'Loading…';
  try {
    // Fetch sub vendors directly from DB to match FK target
    var resSV = await client.from('sub_vendors').select('id, name').limit(2000);
    if (resSV.error) throw resSV.error;
    var liveSubs = resSV.data || [];

    var caches = buildVendorCaches(liveSubs);
    state._vendorList = caches.list;
    state._venById = caches.byId;
    state._idByName = caches.idByName;

    // Project revenue formula/fee
    var projRes = await client
      .from('projects')
      .select('id, revenue_formula, fee_pct')
      .eq('id', pid)
      .single();
    if (projRes.error) throw projRes.error;
    var proj = projRes.data || {};
    state.projectFormula = proj.revenue_formula || 'TM';
    state.projectFeePct = Number(proj.fee_pct || 0);

    // Existing plan for this year
    var planRes = await client
      .from('plan_subs')
      .select('vendor_id, ym, cost, note')
      .eq('project_id', pid);
    if (planRes.error) throw planRes.error;
    var plan = (planRes.data || []).filter(function (r) {
      var yk = keyVal(r.ym);
      return yk && yk.slice(0,4) === String(state.year);
    });

    // Build rows keyed by vendor; drop legacy/stale vendor_ids (forces re-select)
    var rowsByKey = new Map();
    var rowSeq = 0;

    for (var i = 0; i < plan.length; i++) {
      var r = plan[i];
      var k = keyVal(r.ym);
      if (!k) continue;

      var exists = !!state._venById[r.vendor_id];
      var key = exists ? r.vendor_id : ('row_' + (rowSeq++));

      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          vendor_id: exists ? r.vendor_id : null,
          name: exists ? (state._venById[r.vendor_id] && state._venById[r.vendor_id].name || '') : '',
          note: (r.note || ''),
          monthCost: {}
        });
      }
      var row = rowsByKey.get(key);
      row.monthCost[k] = Number(r.cost || 0);
    }

    state.rows = Array.from(rowsByKey.values());
    if (state.rows.length === 0) state.rows.push(blankRow());

    renderGrid();
    msg.textContent = '';
  } catch (err) {
    console.error('Subs init error', err);
    table.innerHTML = '<tbody><tr><td class="p-3 text-red-600">Error: ' + (err && err.message ? err.message : String(err)) + '</td></tr></tbody>';
    msg.textContent = '';
  }

  // Wire buttons
  $('#subsAddRow').onclick = function () { state.rows.push(blankRow()); withCaretPreserved(function(){ renderGrid(); }); };
  $('#subsSave').onclick = saveAll;
}

// ---------------------
// Rendering & helpers
// ---------------------
function renderGrid() {
  var table = $('#subsTable');
  var months = state.months;
  var monthKeys = months.map(function(m){ return m.ym.slice(0,7); });

  var html = '<thead><tr>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Vendor</th>';
  months.forEach(function(m){ html += '<th class="p-2 text-right">' + m.label + '</th>'; });
  html += ''
    + '<th class="p-2 text-right">Year Cost</th>'
    + '<th class="p-2 text-right">Year Revenue</th>'
    + '<th class="p-2 text-right">Profit</th>'
    + '<th class="p-2 text-left">Note</th>'
    + '<th class="p-2"></th>';
  html += '</tr></thead><tbody>';

  var vendorOptions = (state._vendorList || [])
    .map(function(v){
      return '<option value="' + v.id + '" data-name="' + esc(v.name || '') + '">' + esc(v.name || '') + '</option>';
    })
    .join('');

  state.rows.forEach(function(row, idx){
    var costYear = monthKeys.reduce(function(s,k){ return s + Number(row.monthCost[k] || 0); }, 0);
    var revYear  = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    var profit   = revYear - costYear;

    html += '<tr data-idx="' + idx + '">';

    // Vendor select
    html += '<td class="p-2 sticky left-0 bg-white">'
          + '<select class="venSel border rounded-md p-1 min-w-56">'
          + '<option value="">— Select —</option>'
          + vendorOptions
          + '</select>'
          + '</td>';

    // Month inputs
    monthKeys.forEach(function(k){
      var v = (row.monthCost[k] !== undefined && row.monthCost[k] !== null) ? row.monthCost[k] : '';
      html += '<td class="p-1 text-right">'
           +  '<input data-k="' + k + '" class="costInp border rounded-md p-1 w-24 text-right" type="number" min="0" step="0.01" value="' + (v !== '' ? String(v) : '') + '">'
           +  '</td>';
    });

    // Totals
    html += '<td class="p-2 text-right">' + fmtUSD0(costYear) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(revYear)  + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(profit)   + '</td>';

    // Note
    html += '<td class="p-2">'
         +  '<input class="noteInp border rounded-md p-1 w-56" type="text" placeholder="optional" value="' + esc(row.note || '') + '">'
         +  '</td>';

    // Remove
    html += '<td class="p-2 text-right">'
         +  '<button class="rowDel px-2 py-1 rounded-md border hover:bg-slate-50">✕</button>'
         +  '</td>';

    html += '</tr>';
  });

  // Footer totals
  var totals = calcTotals(state.rows, monthKeys, state.projectFormula, state.projectFeePct);
  html += '<tr class="font-semibold">'
      +  '<td class="p-2 sticky left-0 bg-white">Totals</td>'
      +  monthKeys.map(function(k){ return '<td class="p-2 text-right">' + fmtUSD0(totals.costByMonth[k]) + '</td>'; }).join('')
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.costYear) + '</td>'
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.revYear)  + '</td>'
      +  '<td class="p-2 text-right">' + fmtUSD0(totals.revYear - totals.costYear) + '</td>'
      +  '<td class="p-2" colspan="2"></td>'
      +  '</tr>';

  html += '</tbody>';
  table.innerHTML = html;

  // Set select values
  table.querySelectorAll('tr[data-idx]').forEach(function(tr){
    var i = Number(tr.getAttribute('data-idx'));
    var sel = tr.querySelector('.venSel');
    if (sel) sel.value = state.rows[i].vendor_id || '';
  });

  // Handlers
  table.querySelectorAll('.venSel').forEach(function(sel){
    sel.addEventListener('change', function(e){
      var tr = e.target.closest && e.target.closest('tr');
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      var opt = e.target.selectedOptions && e.target.selectedOptions[0];
      state.rows[idx].vendor_id = e.target.value || null;
      state.rows[idx].name = opt && opt.getAttribute('data-name') ? opt.getAttribute('data-name') : '';
      withCaretPreserved(function(){ renderGrid(); });
    });
  });

  table.querySelectorAll('.costInp').forEach(function(inp){
    inp.addEventListener('change', function(e){
      var tr = e.target.closest && e.target.closest('tr');
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      var k = e.target.getAttribute('data-k');
      var n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
      state.rows[idx].monthCost[k] = (e.target.value === '') ? '' : (isFinite(n) ? n : 0);
      withCaretPreserved(function(){ renderGrid(); });
    });
    inp.addEventListener('keydown', function(e){
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });

  table.querySelectorAll('.noteInp').forEach(function(inp){
    inp.addEventListener('change', function(e){
      var tr = e.target.closest && e.target.closest('tr');
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      state.rows[idx].note = e.target.value;
    });
  });

  table.querySelectorAll('.rowDel').forEach(function(btn){
    btn.addEventListener('click', function(){
      var tr = btn.closest && btn.closest('tr');
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      if (idx >= 0) {
        state.rows.splice(idx, 1);
        if (state.rows.length === 0) state.rows.push(blankRow());
        withCaretPreserved(function(){ renderGrid(); });
      }
    });
  });
}

function blankRow() {
  return { vendor_id: null, name: '', note: '', monthCost: {} };
}

function monthsForYear(year) {
  var arr = [];
  for (var i = 0; i < 12; i++) {
    var d = new Date(Date.UTC(year, i, 1));
    arr.push({
      label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      ym: d.toISOString().slice(0,10)
    });
  }
  return arr;
}

// Dedupes vendors by UUID and by normalized name
function buildVendorCaches(vendorsArr) {
  var byUuidMap = new Map();
  (vendorsArr || []).forEach(function(v){ if (v && v.id) byUuidMap.set(v.id, v); });
  var uniqueById = Array.from(byUuidMap.values());

  var norm = function(s){ return String(s || '').trim().toLowerCase(); };
  var byNameMap = new Map();
  uniqueById.forEach(function(v){
    var k = norm(v.name);
    if (!k) return;
    if (!byNameMap.has(k)) byNameMap.set(k, v);
  });

  var list = Array.from(byNameMap.values())
    .sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||'')); });

  var byId = {};
  var idByName = {};
  list.forEach(function(v){
    byId[v.id] = v;
    idByName[String(v.name || '')] = v.id;
  });
  return { list: list, byId: byId, idByName: idByName };
}

function keyVal(ym) {
  try {
    if (typeof ym === 'string') return ym.slice(0,7);
    return new Date(ym).toISOString().slice(0,7);
  } catch (_) {
    return null;
  }
}

function computeRevenue(cost, formula, feePct) {
  if (!isFinite(Number(cost))) return 0;
  switch (formula) {
    case 'COST_PLUS': return Number(cost) * (1 + (Number(feePct || 0) / 100));
    case 'TM':        return Number(cost);
    case 'FP':        return Number(cost);
    default:          return Number(cost);
  }
}

function calcTotals(rows, monthKeys, formula, feePct) {
  var costByMonth = {};
  monthKeys.forEach(function(k){ costByMonth[k] = 0; });
  var costYear = 0, revYear = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var yCost = monthKeys.reduce(function(s,k){ return s + Number(row.monthCost[k] || 0); }, 0);
    var yRev  = computeRevenue(yCost, formula, feePct);
    monthKeys.forEach(function(k){ costByMonth[k] += Number(row.monthCost[k] || 0); });
    costYear += yCost;
    revYear  += yRev;
  }
  return { costByMonth: costByMonth, costYear: costYear, revYear: revYear };
}

function fmtUSD0(v) {
  var n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function esc(s) {
  var str = (s == null ? '' : String(s));
  return str.replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); });
}

/* --------------------- Persistence --------------------- */
async function saveAll() {
  var msg = $('#subsMsg');
  var pid = getProjectId();
  if (!pid) { msg.textContent = 'Select a project first.'; return; }
  msg.textContent = 'Saving…';

  try {
    // re-fetch authoritative sub_vendors
    var vres = await client.from('sub_vendors').select('id, name').limit(2000);
    if (vres.error) throw vres.error;
    var liveVendors = vres.data || [];
    var liveSet = new Set(liveVendors.map(function(v){ return v.id; }));
    var idByNameLive = {};
    liveVendors.forEach(function(v){ idByNameLive[String(v.name || '')] = v.id; });

    var months = state.months.map(function(m){ return m.ym.slice(0,7); });
    var inserts = [];
    var skipped = [];

    for (var i = 0; i < state.rows.length; i++) {
      var row = state.rows[i];
      var vendorId = row.vendor_id || null;
      if (!vendorId && row.name && idByNameLive[row.name]) {
        vendorId = idByNameLive[row.name];
        row.vendor_id = vendorId;
      }
      if (!vendorId || !liveSet.has(vendorId)) {
        var hasAny = months.some(function(mk){ return Number(row.monthCost && row.monthCost[mk] || 0); }) ||
                     (row.note && row.note.trim() !== '');
        if (hasAny) skipped.push(row.name || '(no vendor selected)');
        continue;
      }
      for (var j = 0; j < months.length; j++) {
        var mk = months[j];
        var cost = Number(row.monthCost && row.monthCost[mk] || 0);
        var note = (row.note || '').trim() || null;
        if (!cost && !note) continue;
        inserts.push({
          project_id: pid,
          vendor_id: vendorId,
          ym: mk + '-01',
          cost: cost,
          note: note
        });
      }
    }

    var yearPrefix = String(state.year) + '-';
    var delRes = await client
      .from('plan_subs')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delRes.error) throw delRes.error;

    if (inserts.length) {
      var insRes = await client.from('plan_subs').insert(inserts);
      if (insRes.error) {
        console.error('plan_subs insert error', insRes, { sample: inserts.slice(0,3) });
        throw insRes.error;
      }
    }

    msg.textContent = skipped.length
      ? ('Saved with ' + skipped.length + ' row(s) skipped (select a valid vendor).')
      : 'Saved.';
    setTimeout(function(){ msg.textContent = ''; }, 2500);
  } catch (err) {
    console.error('Subs save error', err);
    msg.textContent = 'Save failed: ' + (err && (err.details || err.message) ? (err.details || err.message) : String(err));
  }
}
