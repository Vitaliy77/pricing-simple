// js/tabs/plan-employees.js
// Employees planning tab: month columns for HOURS; saves to plan_labor.
// Now merges GL actuals (vw_actual_labor_monthly) + plan_labor and locks actual months.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, rolesRate, employees as empLookup } from '../data/lookups.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">Employees (Hours by Month)</h2>
      <div class="flex items-center gap-2">
        <button id="empAddRow" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">+ Add Row</button>
        <button id="empSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
      </div>
    </div>
    <div id="empMsg" class="text-sm text-slate-500 mb-3"></div>
    <div class="overflow-x-auto">
      <table id="empTable" class="min-w-full text-sm border-separate border-spacing-y-[2px]"></table>
    </div>
  </div>
`;

/* ---------------- focus/caret preserve helper ---------------- */
function withCaretPreserved(run) {
  var active = document.activeElement;
  var isCell = !!(active && active.classList && active.classList.contains('hrInp'));
  var rowEl = active && active.closest ? active.closest('tr') : null;
  var rowIdx = rowEl ? rowEl.getAttribute('data-idx') : null;
  var monthKey = active && active.getAttribute ? active.getAttribute('data-k') : null;
  var s = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  var e = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;

  run();

  if (isCell && rowIdx !== null && monthKey) {
    var sel = 'tr[data-idx="' + rowIdx + '"] input.hrInp[data-k="' + monthKey + '"]';
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
  rows: [], // { employee_id, name, role, monthHours:{'YYYY-MM':num}, monthIsActual:{'YYYY-MM':bool} }
  projectFormula: 'TM',
  projectFeePct: 0,
  lastActualYm: null
};

export async function init(rootEl) {
  var pid = getProjectId();
  var msg = $('#empMsg');
  var table = $('#empTable');

  if (!pid) {
    if (msg) msg.textContent = 'Select or create a project to edit employees.';
    if (table) table.innerHTML = '';
    return;
  }

  var mp = $('#monthPicker');
  var mpVal = (mp && mp.value) ? mp.value : new Date().toISOString().slice(0, 7);
  state.year = Number(mpVal.slice(0, 4));
  state.months = monthsForYear(state.year);

  if (msg) msg.textContent = 'Loading…';

  try {
    await loadLookups();

    // Project settings
    var projRes = await client
      .from('projects')
      .select('id, revenue_formula, fee_pct')
      .eq('id', pid)
      .single();
    if (projRes.error) throw projRes.error;
    var proj = projRes.data || {};
    state.projectFormula = proj.revenue_formula || 'TM';
    state.projectFeePct = Number(proj.fee_pct || 0);

    // PLAN labor for the year
    var planRes = await client
      .from('plan_labor')
      .select('employee_id, ym, hours')
      .eq('project_id', pid);
    if (planRes.error) throw planRes.error;
    var plan = (planRes.data || []).filter(function (r) {
      var k = keyVal(r.ym);
      return k && k.slice(0, 4) === String(state.year);
    });

    // ACTUAL labor per employee per month from vw_actual_labor_monthly
    var actRes = await client
      .from('vw_actual_labor_monthly')
      .select('employee_id, ym, hours')
      .eq('project_id', pid)
      .gte('ym', state.year + '-01-01')
      .lte('ym', state.year + '-12-31')
      .order('ym');
    if (actRes.error && actRes.error.code !== 'PGRST204') throw actRes.error;
    var actual = actRes.data || [];

    // Determine last actual month (YYYY-MM) for header band
    var last = null;
    for (var i = 0; i < actual.length; i++) {
      var ak = keyVal(actual[i].ym);
      if (ak && (!last || ak > last)) last = ak;
    }
    state.lastActualYm = last;

    var empById = mapById(empLookup);
    var byEmp = {};

    // helper to ensure row exists
    function ensureRow(empId) {
      if (!byEmp[empId]) {
        var emp = empById[empId] || {};
        byEmp[empId] = {
          employee_id: empId,
          name: emp.full_name || emp.name || '',
          role: emp.role || '',
          monthHours: {},
          monthIsActual: {}
        };
      }
      return byEmp[empId];
    }

    // 1) Seed from ACTUALS (GL-driven)
    for (var a = 0; a < actual.length; a++) {
      var ar = actual[a];
      var ak2 = keyVal(ar.ym);
      if (!ak2 || ak2.slice(0, 4) !== String(state.year)) continue;
      var rowA = ensureRow(ar.employee_id);
      rowA.monthHours[ak2] = Number(ar.hours || 0);
      rowA.monthIsActual[ak2] = true;
    }

    // 2) Overlay PLAN where there is no actual for that emp+month
    for (var j = 0; j < plan.length; j++) {
      var r = plan[j];
      var pk = keyVal(r.ym);
      if (!pk || pk.slice(0, 4) !== String(state.year)) continue;
      var rowP = ensureRow(r.employee_id);
      if (!rowP.monthIsActual[pk]) {
        rowP.monthHours[pk] = Number(r.hours || 0);
      }
    }

    state.rows = Object.values(byEmp);
    if (state.rows.length === 0) state.rows.push(blankRow());

    renderGrid();
    if (msg) msg.textContent = '';
  } catch (err) {
    console.error('Employees init error', err);
    if (table) {
      table.innerHTML = '<tbody><tr><td class="p-3 text-red-600">Error: ' + (err?.message || String(err)) + '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  $('#empAddRow')?.addEventListener('click', () => {
    state.rows.push(blankRow());
    withCaretPreserved(renderGrid);
  });

  $('#empSave')?.addEventListener('click', saveAll);
}

function renderGrid() {
  var table = $('#empTable');
  if (!table) return;

  var months = state.months;
  var monthKeys = months.map(m => m.ym.slice(0, 7));

  var html = '<thead>';

  // Actuals vs Forecast band (uses lastActualYm)
  var last = state.lastActualYm;
  if (last) {
    var actualCount = monthKeys.filter(k => k <= last).length;
    var forecastCount = monthKeys.length - actualCount;

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

  // Main header
  html += '<tr>';
  html += '<th class="p-2 text-left text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 border-b">Employee</th>';
  months.forEach(m => {
    html += `<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">${esc(m.label)}</th>`;
  });
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Hours</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>';
  html += '<th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>';
  html += '</tr></thead><tbody>';

  var empOptions = (empLookup || []).map(e => {
    var nm = e.full_name || e.name || '';
    return `<option value="${esc(e.id)}" data-role="${esc(e.role || '')}" data-name="${esc(nm)}">${esc(nm)}</option>`;
  }).join('');

  // DATA ROWS
  state.rows.forEach((row, idx) => {
    var rate = resolveLoadedRate(row.role);
    var hoursYear = monthKeys.reduce((s, k) => s + Number(row.monthHours[k] || 0), 0);
    var costYear = hoursYear * rate;
    var revYear = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    var profit = revYear - costYear;

    html += `<tr data-idx="${idx}" class="pl-row even:bg-slate-50 hover:bg-slate-100 transition-colors">`;

    html += `<td class="p-2 sticky left-0 bg-white align-top">
      <div class="flex items-center gap-2">
        <select class="empSel border rounded-md px-2 py-1 min-w-56 text-xs">
          <option value="">— Select —</option>${empOptions}
        </select>
        <span class="text-xs text-slate-500 whitespace-nowrap">${esc(row.role || '')}</span>
      </div>
    </td>`;

    monthKeys.forEach(k => {
      var v = row.monthHours[k] !== undefined ? row.monthHours[k] : '';
      var isActual = !!(row.monthIsActual && row.monthIsActual[k]);
      html += `<td class="p-1 text-right">
        <input
          data-k="${k}"
          class="hrInp border rounded-md px-2 py-1 w-20 text-right text-xs ${isActual ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}"
          type="number"
          min="0"
          step="0.1"
          value="${v !== '' ? v : ''}"
          ${isActual ? 'disabled' : ''}
        >
      </td>`;
    });

    html += `<td class="p-2 text-right font-medium">${fmtNum(hoursYear)}</td>`;
    html += `<td class="p-2 text-right font-medium">${fmtUSD0(costYear)}</td>`;
    html += `<td class="p-2 text-right font-medium">${fmtUSD0(revYear)}</td>`;
    html += `<td class="p-2 text-right font-medium ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}">${fmtUSD0(profit)}</td>`;
    html += `<td class="p-2 text-right">
      <button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-red-50 text-red-600">Remove</button>
    </td></tr>`;
  });

  // TOTALS ROW
  var totals = calcTotals(state.rows, monthKeys);
  html += `<tr class="font-bold text-slate-900 bg-slate-100 summary-row">
    <td class="p-2 sticky left-0 bg-slate-100">Totals</td>
    ${monthKeys.map(k => `<td class="p-2 text-right">${fmtNum(totals.hoursByMonth[k])}</td>`).join('')}
    <td class="p-2 text-right">${fmtNum(totals.hoursYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
    <td class="p-2 text-right ${totals.revYear - totals.costYear >= 0 ? 'text-emerald-700' : 'text-red-600'}">
      ${fmtUSD0(totals.revYear - totals.costYear)}
    </td>
    <td class="p-2"></td>
  </tr></tbody>`;

  table.innerHTML = html;

  // Restore employee selections
  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    var i = Number(tr.dataset.idx);
    var sel = tr.querySelector('.empSel');
    if (sel) sel.value = state.rows[i].employee_id || '';
  });

  // Events
  table.querySelectorAll('.empSel').forEach(sel => {
    sel.addEventListener('change', e => {
      var tr = e.target.closest('tr');
      var idx = Number(tr.dataset.idx);
      var opt = e.target.selectedOptions[0];
      state.rows[idx].employee_id = e.target.value || null;
      state.rows[idx].role = opt?.dataset.role || '';
      state.rows[idx].name = opt?.dataset.name || '';
      withCaretPreserved(renderGrid);
    });
  });

  table.querySelectorAll('.hrInp').forEach(inp => {
    inp.addEventListener('change', e => {
      var tr = e.target.closest('tr');
      var idx = Number(tr.dataset.idx);
      var k = e.target.dataset.k;
      var val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0);
      state.rows[idx].monthHours[k] = val;
      withCaretPreserved(renderGrid);
    });
    inp.addEventListener('keydown', e => e.key === 'Enter' && e.target.blur());
  });

  table.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      var idx = Number(btn.closest('tr').dataset.idx);
      state.rows.splice(idx, 1);
      if (!state.rows.length) state.rows.push(blankRow());
      withCaretPreserved(renderGrid);
    });
  });
}

/* ---------------- helpers ---------------- */
function blankRow() {
  return { employee_id: null, name: '', role: '', monthHours: {}, monthIsActual: {} };
}

function monthsForYear(y) {
  return Array.from({length:12}, (_,i) => {
    var d = new Date(Date.UTC(y, i, 1));
    return {
      label: d.toLocaleString('en-US', {month:'short', timeZone:'UTC'}) + '-' + String(y).slice(2),
      ym: d.toISOString().slice(0,10)
    };
  });
}
function mapById(l) { var m={}; (l||[]).forEach(x=>x?.id && (m[x.id]=x)); return m; }
function keyVal(ym) { try { return typeof ym==='string' ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7); } catch(e) {return null;} }
function resolveLoadedRate(r) { var n=Number(rolesRate[r]||0); return isFinite(n)?n:0; }
function computeRevenue(c, f, p) {
  if (!isFinite(c)) return 0;
  c = Number(c);
  return f==='COST_PLUS' ? c * (1 + (Number(p||0)/100)) : c;
}
function calcTotals(rows, keys) {
  var hbm = {}; keys.forEach(k=>hbm[k]=0);
  var hy=0, cy=0, ry=0;
  rows.forEach(r=>{
    var rate = resolveLoadedRate(r.role);
    var yh = keys.reduce((s,k)=>s+Number(r.monthHours[k]||0),0);
    var cost = yh*rate;
    var rev = computeRevenue(cost, state.projectFormula, state.projectFeePct);
    keys.forEach(k=>hbm[k]+=Number(r.monthHours[k]||0));
    hy+=yh; cy+=cost; ry+=rev;
  });
  return {hoursByMonth:hbm, hoursYear:hy, costYear:cy, revYear:ry};
}
function fmtNum(v) { return Number(v||0).toLocaleString('en-US', {maximumFractionDigits:1}); }
function fmtUSD0(v) { return Number(v||0).toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}); }
function esc(s) { return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function saveAll() {
  var msg = $('#empMsg');
  var pid = getProjectId();
  if (!pid) { msg && (msg.textContent='Select a project first.'); return; }
  msg && (msg.textContent='Saving…');

  var monthKeys = state.months.map(m=>m.ym.slice(0,7));
  var inserts = [];
  state.rows.forEach(row=>{
    if (!row.employee_id) return;
    monthKeys.forEach(mk => {
      // Do NOT overwrite actuals: only save plan for non-actual months
      if (row.monthIsActual && row.monthIsActual[mk]) return;
      var hrs = Number(row.monthHours[mk]||0);
      if (hrs) inserts.push({project_id:pid, employee_id:row.employee_id, ym:mk+'-01', hours:hrs});
    });
  });

  try {
    var year = String(state.year);
    await client.from('plan_labor').delete()
      .eq('project_id',pid)
      .gte('ym', year+'-01-01')
      .lte('ym', year+'-12-31');
    if (inserts.length) await client.from('plan_labor').insert(inserts);
    msg && (msg.textContent='Saved.', setTimeout(()=>{ msg.textContent=''; },1200));
  } catch(err) {
    console.error('Save error', err);
    msg && (msg.textContent='Save failed: '+(err?.message||String(err)));
  }
}
