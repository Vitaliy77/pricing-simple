// js/tabs/plan-employees.js
// Employees planning tab: month columns for HOURS; saves to plan_labor.
// Layout aligned with Subs tab; shows Actuals vs Forecast band above headers.

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
      <table id="empTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
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
  rows: [], // { employee_id, name, role, monthHours: { 'YYYY-MM': number } }
  projectFormula: 'TM',
  projectFeePct: 0,
  lastActualYm: null // 'YYYY-MM' for latest labor actuals month (project level)
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

  // Determine year from month picker (or today) – same pattern as other planning tabs
  var mp = $('#monthPicker');
  var mpVal = (mp && mp.value) ? mp.value : new Date().toISOString().slice(0, 7);
  state.year = Number(mpVal.slice(0, 4));
  state.months = monthsForYear(state.year);

  if (msg) msg.textContent = 'Loading…';

  try {
    await loadLookups();

    // Project revenue formula / fee
    var projRes = await client
      .from('projects')
      .select('id, revenue_formula, fee_pct')
      .eq('id', pid)
      .single();
    if (projRes.error) throw projRes.error;
    var proj = projRes.data || {};
    state.projectFormula = proj.revenue_formula || 'TM';
    state.projectFeePct = Number(proj.fee_pct || 0);

    // Existing plan_labor for this project (we'll filter to this year in JS)
    var planRes = await client
      .from('plan_labor')
      .select('employee_id, ym, hours')
      .eq('project_id', pid);
    if (planRes.error) throw planRes.error;
    var plan = (planRes.data || []).filter(function (r) {
      var k = keyVal(r.ym);
      return k && k.slice(0, 4) === String(state.year);
    });

    // Labor actuals monthly (project-level) to determine last actual month
    // NOTE: this is not per-employee; we only use it to draw "Actuals vs Forecast" band.
    var actRes = await client
      .from('labor_actuals_monthly')
      .select('ym, hours')
      .eq('project_id', pid)
      .order('ym');
    if (actRes.error && actRes.error.details && actRes.error.code !== 'PGRST204') {
      // PGRST204 would be "No rows" – that's fine
      throw actRes.error;
    }
    var actData = actRes.data || [];
    var last = null;
    for (var i = 0; i < actData.length; i++) {
      var ak = keyVal(actData[i].ym);
      if (!ak) continue;
      if (!last || ak > last) last = ak;
    }
    state.lastActualYm = last; // might be null if no actuals yet

    // Map employees by id
    var empById = mapById(empLookup);

    // Build per-employee rows
    var byEmp = {};
    for (var j = 0; j < plan.length; j++) {
      var r = plan[j];
      var k2 = keyVal(r.ym);
      if (!k2) continue;

      var emp = empById[r.employee_id] || {};
      if (!byEmp[r.employee_id]) {
        byEmp[r.employee_id] = {
          employee_id: r.employee_id,
          name: emp.full_name || emp.name || '',
          role: emp.role || '',
          monthHours: {}
        };
      }
      byEmp[r.employee_id].monthHours[k2] = Number(r.hours || 0);
    }

    state.rows = Object.values(byEmp);
    if (state.rows.length === 0) state.rows.push(blankRow());

    renderGrid();
    if (msg) msg.textContent = '';
  } catch (err) {
    console.error('Employees init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err && err.message ? err.message : String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
  }

  var addBtn = $('#empAddRow');
  if (addBtn) {
    addBtn.onclick = function () {
      state.rows.push(blankRow());
      withCaretPreserved(function () { renderGrid(); });
    };
  }
  var saveBtn = $('#empSave');
  if (saveBtn) {
    saveBtn.onclick = saveAll;
  }
}

/* ---------------- Rendering & helpers ---------------- */
function renderGrid() {
  var table = $('#empTable');
  if (!table) return;

  var months = state.months;
  var monthKeys = months.map(function (m) { return m.ym.slice(0, 7); });

  var html = '';

  // THEAD start
  html += '<thead>';

  // Optional top band: "Actuals" vs "Forecast" based on lastActualYm
  var last = state.lastActualYm; // 'YYYY-MM' or null
  if (last) {
    var actualCount = 0;
    for (var i = 0; i < monthKeys.length; i++) {
      if (monthKeys[i] <= last) actualCount++;
    }
    var forecastCount = monthKeys.length - actualCount;

    html += '<tr>';
    // Sticky empty cell above Employee column
    html += '<th class="p-1 text-xs text-slate-500 sticky left-0 bg-white"></th>';

    if (actualCount > 0) {
      html +=
        '<th colspan="' + actualCount + '" ' +
        'class="p-1 text-xs font-semibold text-emerald-700 text-center ' +
        'bg-emerald-50 border-b border-emerald-200">' +
        'Actuals' +
        '</th>';
    }
    if (forecastCount > 0) {
      html +=
        '<th colspan="' + forecastCount + '" ' +
        'class="p-1 text-xs font-semibold text-sky-700 text-center ' +
        'bg-sky-50 border-b border-sky-200">' +
        'Forecast' +
        '</th>';
    }

    // Totals band
    html +=
      '<th colspan="4" ' +
      'class="p-1 text-xs font-semibold text-slate-600 text-center bg-slate-50 border-b">' +
      'Totals' +
      '</th>';

    // Empty cell over delete column
    html += '<th class="p-1 bg-slate-50 border-b"></th>';
    html += '</tr>';
  }

  // Main header row
  html += '<tr>';
  html += '<th class="p-2 text-left text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 border-b">Employee</th>';
  monthKeys.forEach(function (_k, idx) {
    var m = months[idx];
    html +=
      '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">' +
      esc(m.label) +
      '</th>';
  });
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Hours</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>';
  html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>';
  html += '<th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>';
  html += '</tr>';

  html += '</thead><tbody>';

  // Employee dropdown options
  var empOptions = (empLookup || [])
    .map(function (e) {
      var nm = e.full_name || e.name || '';
      return (
        '<option value="' + esc(e.id) + '" ' +
        'data-role="' + esc(e.role || '') + '" ' +
        'data-name="' + esc(nm) + '">' +
        esc(nm) +
        '</option>'
      );
    })
    .join('');

  // Data rows
  state.rows.forEach(function (row, idx) {
    var rate = resolveLoadedRate(row.role);
    var hoursYear = monthKeys.reduce(function (s, k) { return s + Number(row.monthHours[k] || 0); }, 0);
    var costYear = hoursYear * rate;
    var revYear = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    var profit = revYear - costYear;

    html += '<tr data-idx="' + idx + '" class="pl-row">';

    // Sticky Employee cell: dropdown + small role under it
    html +=
      '<td class="p-2 sticky left-0 bg-white align-top">' +
      '<select class="empSel border rounded-md px-2 py-1 min-w-56 text-xs">' +
      '<option value="">— Select —</option>' +
      empOptions +
      '</select>' +
      '<div class="text-xs text-slate-500 mt-0.5">' + esc(row.role || '') + '</div>' +
      '</td>';

    // Month inputs (hours)
    monthKeys.forEach(function (k) {
      var v = (row.monthHours[k] !== undefined && row.monthHours[k] !== null) ? row.monthHours[k] : '';
      html +=
        '<td class="p-1 text-right">' +
        '<input data-k="' + k + '" ' +
        'class="hrInp border rounded-md px-2 py-1 w-20 text-right text-xs" ' +
        'type="number" min="0" step="0.1" ' +
        'value="' + (v !== '' ? String(v) : '') + '">' +
        '</td>';
    });

    // Totals
    html += '<td class="p-2 text-right">' + fmtNum(hoursYear) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(costYear) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(revYear) + '</td>';
    html += '<td class="p-2 text-right">' + fmtUSD0(profit) + '</td>';

    // Remove button
    html +=
      '<td class="p-2 text-right">' +
      '<button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-slate-50">✕</button>' +
      '</td>';

    html += '</tr>';
  });

  // Footer totals
  var totals = calcTotals(state.rows, monthKeys);
  html +=
    '<tr class="font-semibold summary-row">' +
    '<td class="p-2 sticky left-0 bg-white">Totals</td>' +
    monthKeys
      .map(function (k) {
        return '<td class="p-2 text-right">' + fmtNum(totals.hoursByMonth[k]) + '</td>';
      })
      .join('') +
    '<td class="p-2 text-right">' + fmtNum(totals.hoursYear) + '</td>' +
    '<td class="p-2 text-right">' + fmtUSD0(totals.costYear) + '</td>' +
    '<td class="p-2 text-right">' + fmtUSD0(totals.revYear) + '</td>' +
    '<td class="p-2 text-right">' + fmtUSD0(totals.revYear - totals.costYear) + '</td>' +
    '<td class="p-2"></td>' +
    '</tr>';

  html += '</tbody>';
  table.innerHTML = html;

  // Restore selected employees
  table.querySelectorAll('tr[data-idx]').forEach(function (tr) {
    var i = Number(tr.getAttribute('data-idx'));
    var sel = tr.querySelector('.empSel');
    if (sel) sel.value = state.rows[i].employee_id || '';
  });

  // Wire events
  table.querySelectorAll('.empSel').forEach(function (sel) {
    sel.addEventListener('change', function (e) {
      var tr = e.target.closest && e.target.closest('tr');
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      if (idx < 0) return;
      var opt = e.target.selectedOptions && e.target.selectedOptions[0];
      var role = opt && opt.getAttribute('data-role') ? opt.getAttribute('data-role') : '';
      var name = opt && opt.getAttribute('data-name') ? opt.getAttribute('data-name') : '';
      state.rows[idx].employee_id = e.target.value || null;
      state.rows[idx].role = role;
      state.rows[idx].name = name;
      withCaretPreserved(function () { renderGrid(); });
    });
  });

  table.querySelectorAll('.hrInp').forEach(function (inp) {
    inp.addEventListener('change', function (e) {
      var tr = e.target.closest && e.target.closest('tr');
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      if (idx < 0) return;
      var k = e.target.getAttribute('data-k');
      var n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
      state.rows[idx].monthHours[k] = (e.target.value === '') ? '' : (isFinite(n) ? n : 0);
      withCaretPreserved(function () { renderGrid(); });
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
    });
  });

  table.querySelectorAll('.rowDel').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest && btn.closest('tr');
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      if (idx >= 0) {
        state.rows.splice(idx, 1);
        if (state.rows.length === 0) state.rows.push(blankRow());
        withCaretPreserved(function () { renderGrid(); });
      }
    });
  });
}

/* ---------------- small helpers ---------------- */
function blankRow() {
  return { employee_id: null, name: '', role: '', monthHours: {} };
}

function monthsForYear(year) {
  return Array.from({ length: 12 }, function (_, i) {
    var d = new Date(Date.UTC(year, i, 1));
    var mm = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); // Jan, Feb…
    var yy = String(year).slice(2); // 25
    return {
      label: mm + '-' + yy,            // e.g., Jan-25
      ym: d.toISOString().slice(0, 10) // YYYY-MM-01
    };
  });
}

function mapById(list) {
  var m = {};
  (list || []).forEach(function (x) {
    if (x && x.id) m[x.id] = x;
  });
  return m;
}

function keyVal(ym) {
  try {
    if (typeof ym === 'string') return ym.slice(0, 7);
    return new Date(ym).toISOString().slice(0, 7);
  } catch (_) {
    return null;
  }
}

function resolveLoadedRate(role) {
  var r = Number(rolesRate[role] || 0);
  return isFinite(r) ? r : 0;
}

function computeRevenue(cost, formula, feePct) {
  if (!isFinite(Number(cost))) return 0;
  var c = Number(cost);
  switch (formula) {
    case 'COST_PLUS': return c * (1 + (Number(feePct || 0) / 100));
    case 'TM':        return c;
    case 'FP':        return c;
    default:          return c;
  }
}

function calcTotals(rows, monthKeys) {
  var hoursByMonth = {};
  monthKeys.forEach(function (k) { hoursByMonth[k] = 0; });

  var hoursYear = 0, costYear = 0, revYear = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rate = resolveLoadedRate(row.role);
    var hYear = monthKeys.reduce(function (s, k) { return s + Number(row.monthHours[k] || 0); }, 0);
    var cost = hYear * rate;
    var rev = computeRevenue(cost, state.projectFormula, state.projectFeePct);

    monthKeys.forEach(function (k) {
      hoursByMonth[k] += Number(row.monthHours[k] || 0);
    });
    hoursYear += hYear;
    costYear += cost;
    revYear += rev;
  }

  return { hoursByMonth: hoursByMonth, hoursYear: hoursYear, costYear: costYear, revYear: revYear };
}

function fmtNum(v) {
  var n = Number(v || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
function fmtUSD0(v) {
  var n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function esc(s) {
  var str = (s == null ? '' : String(s));
  return str.replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
  });
}

/* ---------------- persistence ---------------- */
async function saveAll() {
  var msg = $('#empMsg');
  var pid = getProjectId();
  if (!pid) {
    if (msg) msg.textContent = 'Select a project first.';
    return;
  }
  if (msg) msg.textContent = 'Saving…';

  var months = state.months.map(function (m) { return m.ym.slice(0, 7); });
  var inserts = [];

  for (var i = 0; i < state.rows.length; i++) {
    var row = state.rows[i];
    if (!row.employee_id) continue;
    for (var j = 0; j < months.length; j++) {
      var mk = months[j];
      var hrs = Number(row.monthHours[mk] || 0);
      if (!hrs) continue;
      inserts.push({
        project_id: pid,
        employee_id: row.employee_id,
        ym: mk + '-01',
        hours: hrs
      });
    }
  }

  try {
    var yearPrefix = String(state.year) + '-';
    var delRes = await client
      .from('plan_labor')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delRes.error) throw delRes.error;

    if (inserts.length) {
      var insRes = await client.from('plan_labor').insert(inserts);
      if (insRes.error) throw insRes.error;
    }

    if (msg) {
      msg.textContent = 'Saved.';
      setTimeout(function () { msg.textContent = ''; }, 1200);
    }
  } catch (err) {
    console.error('Employees save error', err);
    if (msg) {
      msg.textContent =
        'Save failed: ' + (err && (err.details || err.message) ? (err.details || err.message) : String(err));
    }
  }
}
