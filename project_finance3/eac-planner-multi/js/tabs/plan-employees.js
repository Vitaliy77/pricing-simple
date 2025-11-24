// js/tabs/plan-employees.js
// Employees planning tab: month columns for hours; saves to plan_labor.
// Now supports Actual vs Plan using vw_actual_labor_monthly.

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, rolesRate, employees as empLookup } from '../data/lookups.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-3">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold">Employees (Hours by Month)</h2>
        <p id="empLegend" class="text-xs text-slate-500">
          Loading actual vs plan info…
        </p>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-xs text-slate-600">
          <span class="uppercase tracking-wide">Year</span>
          <select
            id="empYearSelect"
            class="border border-slate-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            ${Array.from({ length: 11 }, (_, i) => {
              const y = 2024 + i;
              const selected = y === 2025 ? 'selected' : '';
              return `<option value="${y}" ${selected}>${y}</option>`;
            }).join('')}
          </select>
        </label>
        <button id="empAddRow" class="px-3 py-1.5 rounded-md border text-xs hover:bg-slate-50">+ Add Row</button>
        <button id="empSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700">Save</button>
      </div>
    </div>

    <div id="empMsg" class="text-sm text-slate-500 mb-2"></div>

    <div class="overflow-x-auto">
      <table id="empTable" class="min-w-full text-xs border-separate border-spacing-y-[2px]"></table>
    </div>
  </div>
`;

// keep focus/caret when re-rendering
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
  actualByEmpMonth: {},  // { employee_id -> { 'YYYY-MM' -> hours } }
  actualCutoffKey: null, // 'YYYY-MM'
  actualCutoffIdx: -1    // index in monthKeys
};

export async function init(rootEl) {
  var pid = getProjectId();
  var msg = $('#empMsg');
  var table = $('#empTable');

  if (!pid) {
    if (msg) msg.textContent = 'Select or create a project to edit employees.';
    if (table) table.innerHTML = '';
    var legend = $('#empLegend');
    if (legend) legend.textContent = 'No project selected.';
    return;
  }

  var yrSel = $('#empYearSelect');
  if (yrSel && yrSel.value) {
    state.year = Number(yrSel.value);
  } else {
    state.year = new Date().getUTCFullYear();
  }
  state.months = monthsForYear(state.year);

  await loadDataAndRender(pid);

  // Wire year change
  if (yrSel) {
    yrSel.onchange = function () {
      state.year = Number(yrSel.value || new Date().getUTCFullYear());
      state.months = monthsForYear(state.year);
      loadDataAndRender(pid);
    };
  }

  // Wire buttons
  var addBtn = $('#empAddRow');
  if (addBtn) {
    addBtn.onclick = function () {
      state.rows.push(blankRow());
      withCaretPreserved(function () { renderGrid(); });
    };
  }

  var saveBtn = $('#empSave');
  if (saveBtn) saveBtn.onclick = saveAll;
}

async function loadDataAndRender(pid) {
  var msg = $('#empMsg');
  var table = $('#empTable');
  if (!pid || !table) return;

  state.months = monthsForYear(state.year);

  if (msg) msg.textContent = 'Loading…';
  var legend = $('#empLegend');
  if (legend) legend.textContent = 'Loading actual vs plan info…';

  try {
    await loadLookups();

    // project formula/fee
    var proj = await fetchProject(pid);
    state.projectFormula = proj && proj.revenue_formula ? proj.revenue_formula : 'TM';
    state.projectFeePct  = Number(proj && proj.fee_pct ? proj.fee_pct : 0);

    // plan for this year
    var plan = await fetchPlanLabor(pid, state.year);
    var empById = mapById(empLookup);
    var byEmp = {};
    for (var i = 0; i < plan.length; i++) {
      var r = plan[i];
      var k = keyVal(r.ym);
      if (!k) continue;
      var emp = empById[r.employee_id] || {};
      if (!byEmp[r.employee_id]) {
        byEmp[r.employee_id] = {
          employee_id: r.employee_id,
          name: emp.full_name ? emp.full_name : (emp.name || ''),
          role: emp.role || '',
          monthHours: {}
        };
      }
      byEmp[r.employee_id].monthHours[k] = Number(r.hours || 0);
    }
    state.rows = Object.values(byEmp);
    if (state.rows.length === 0) state.rows.push(blankRow());

    // actuals for this year
    var actualInfo = await fetchActualLabor(pid, state.year);
    state.actualByEmpMonth = actualInfo.byEmpMonth;
    state.actualCutoffKey  = actualInfo.lastYmKey;
    state.actualCutoffIdx  = -1;

    var monthKeys = state.months.map(function (m) { return m.ym.slice(0, 7); });
    if (state.actualCutoffKey) {
      state.actualCutoffIdx = monthKeys.indexOf(state.actualCutoffKey);
    }

    // ensure any employees with actuals but no plan row are visible
    for (var empId in state.actualByEmpMonth) {
      if (!Object.prototype.hasOwnProperty.call(state.actualByEmpMonth, empId)) continue;
      if (!empId) continue;
      var exists = state.rows.some(function (r) { return r.employee_id === empId; });
      if (!exists) {
        var emp2 = empById[empId] || {};
        state.rows.push({
          employee_id: empId,
          name: emp2.full_name ? emp2.full_name : (emp2.name || ''),
          role: emp2.role || '',
          monthHours: {}
        });
      }
    }

    renderGrid();
    if (msg) msg.textContent = '';

    // Legend text
    if (legend) {
      if (state.actualCutoffIdx >= 0) {
        var cutoffLabel = state.months[state.actualCutoffIdx].label;
        legend.textContent =
          'Grey columns: Actuals through ' + cutoffLabel + '. Blue columns: Plan months.';
      } else {
        legend.textContent = 'All months are Plan (no labor actuals for this year).';
      }
    }
  } catch (err) {
    console.error('Employees init error', err);
    if (table) {
      table.innerHTML =
        '<tbody><tr><td class="p-3 text-red-600">Error: ' +
        (err && err.message ? err.message : String(err)) +
        '</td></tr></tbody>';
    }
    if (msg) msg.textContent = '';
    if (legend) legend.textContent = 'Error loading actual vs plan.';
  }
}

// ---------------------
// Rendering & helpers
// ---------------------
function renderGrid() {
  var table = $('#empTable');
  if (!table) return;

  var months = state.months;
  var monthKeys = months.map(function (m) { return m.ym.slice(0, 7); });

  var html = '<thead><tr>';

  // One sticky column for Employee + Role
  html += ''
    + '<th class="p-1 sticky-col text-left text-xs font-semibold text-slate-600 bg-slate-50 border-b">'
    +   'Employee / Role'
    + '</th>';

  // Month headers: Jan-25, with different color for Actual vs Plan
  for (var i = 0; i < months.length; i++) {
    var m = months[i];
    var isActualCol = (state.actualCutoffIdx >= 0 && i <= state.actualCutoffIdx);
    var thClass = 'p-1 text-right text-[11px] font-semibold border-b ';
    if (isActualCol) {
      thClass += 'bg-slate-100 text-slate-700';
    } else {
      thClass += 'bg-blue-50 text-blue-700';
    }
    html += '<th class="' + thClass + '">' + m.label + '</th>';
  }

  html += ''
    + '<th class="p-1 text-right text-[11px] font-semibold text-slate-500 bg-slate-50 border-b">Year Hours</th>'
    + '<th class="p-1 text-right text-[11px] font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>'
    + '<th class="p-1 text-right text-[11px] font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>'
    + '<th class="p-1 text-right text-[11px] font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>'
    + '<th class="p-1 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>';

  html += '</tr></thead><tbody>';

  var empOptions = (empLookup || [])
    .map(function (e) {
      return ''
        + '<option value="' + e.id + '"'
        + ' data-role="' + esc(e.role || '') + '"'
        + ' data-name="' + esc(e.full_name || e.name || '') + '">'
        + esc(e.full_name || e.name || '')
        + '</option>';
    })
    .join('');

  for (var idx = 0; idx < state.rows.length; idx++) {
    var row = state.rows[idx];
    var rate = resolveLoadedRate(row.role);
    var hoursYear = monthKeys.reduce(function (s, k) {
      return s + Number(row.monthHours[k] || 0);
    }, 0);
    var costYear  = hoursYear * rate;
    var revYear   = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    var profit    = revYear - costYear;

    html += '<tr data-idx="' + idx + '" class="pl-row">';

    // Sticky Employee + Role cell (same line)
    html += ''
      + '<td class="p-[3px] sticky-col bg-white align-top">'
      +   '<div class="flex items-center gap-2">'
      +     '<select class="empSel border rounded-md px-2 py-1 min-w-48 text-xs">'
      +       '<option value="">— Select —</option>'
      +       empOptions
      +     '</select>'
      +     '<input'
      +       ' class="roleInp border rounded-md px-2 py-1 w-40 bg-slate-50 text-xs"'
      +       ' value="' + esc(row.role || '') + '"'
      +       ' disabled'
      +     '>'
      +   '</div>'
      + '</td>';

    var actForEmp = row.employee_id ? (state.actualByEmpMonth[row.employee_id] || {}) : {};
    var hasActualCutoff = (state.actualCutoffIdx >= 0);

    for (var j = 0; j < monthKeys.length; j++) {
      var mk = monthKeys[j];
      var isActualCell = hasActualCutoff && (j <= state.actualCutoffIdx);
      var val;
      var disabledAttr = '';
      var cellClass = 'hrInp border rounded-md px-2 py-[3px] w-20 text-right text-xs';

      if (isActualCell) {
        // actual hours; if missing, treat as 0 actual
        val = actForEmp && Object.prototype.hasOwnProperty.call(actForEmp, mk)
          ? actForEmp[mk]
          : 0;
        disabledAttr = ' disabled';
        cellClass += ' bg-slate-50 text-slate-500 cursor-not-allowed';
      } else {
        // plan value
        var pv = row.monthHours[mk];
        val = (pv !== undefined && pv !== null) ? pv : '';
      }

      html += ''
        + '<td class="p-[2px] text-right">'
        +   '<input'
        +     ' data-k="' + mk + '"'
        +     ' class="' + cellClass + '"'
        +     ' type="number" min="0" step="0.1"'
        +     ' value="' + (val !== '' ? String(val) : '') + '"'
        +     disabledAttr
        +   '>'
        + '</td>';
    }

    html += '<td class="p-1 text-right">' + fmtNum(hoursYear) + '</td>';
    html += '<td class="p-1 text-right">' + fmtUSD0(costYear)  + '</td>';
    html += '<td class="p-1 text-right">' + fmtUSD0(revYear)   + '</td>';
    html += '<td class="p-1 text-right">' + fmtUSD0(profit)    + '</td>';
    html += ''
      + '<td class="p-1 text-right">'
      +   '<button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-slate-50">✕</button>'
      + '</td>';

    html += '</tr>';
  }

  var totals = calcTotals(state.rows, monthKeys);
  html += ''
    + '<tr class="font-semibold summary-row">'
    +   '<td class="p-1 sticky-col bg-white">Totals</td>'
    +   monthKeys.map(function (k) {
          return '<td class="p-1 text-right">' + fmtNum(totals.hoursByMonth[k]) + '</td>';
        }).join('')
    +   '<td class="p-1 text-right">' + fmtNum(totals.hoursYear) + '</td>'
    +   '<td class="p-1 text-right">' + fmtUSD0(totals.costYear) + '</td>'
    +   '<td class="p-1 text-right">' + fmtUSD0(totals.revYear)  + '</td>'
    +   '<td class="p-1 text-right">' + fmtUSD0(totals.revYear - totals.costYear) + '</td>'
    +   '<td class="p-1"></td>'
    + '</tr>';

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
      var tr = e.target.closest ? e.target.closest('tr') : null;
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      var opt = (e.target.selectedOptions && e.target.selectedOptions[0]) ? e.target.selectedOptions[0] : null;
      var role = opt && opt.getAttribute('data-role') ? opt.getAttribute('data-role') : '';
      var name = opt && opt.getAttribute('data-name') ? opt.getAttribute('data-name') : '';
      if (idx >= 0) {
        state.rows[idx].employee_id = e.target.value || null;
        state.rows[idx].role = role;
        state.rows[idx].name = name;
        withCaretPreserved(function () { renderGrid(); });
      }
    });
  });

  table.querySelectorAll('.hrInp').forEach(function (inp) {
    // Only allow editing if not disabled (Plan cells)
    if (!inp.disabled) {
      inp.addEventListener('change', function (e) {
        var tr = e.target.closest ? e.target.closest('tr') : null;
        var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
        var k = e.target.getAttribute('data-k');
        var raw = e.target.value;
        var n = (raw === '') ? '' : Math.max(0, Number(raw));
        if (!Number.isFinite(n) && raw !== '') n = 0;
        if (idx >= 0 && k) {
          state.rows[idx].monthHours[k] = (raw === '') ? '' : n;
          withCaretPreserved(function () { renderGrid(); });
        }
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      });
    }
  });

  table.querySelectorAll('.rowDel').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest ? btn.closest('tr') : null;
      var idx = tr ? Number(tr.getAttribute('data-idx')) : -1;
      if (idx >= 0) {
        state.rows.splice(idx, 1);
        if (state.rows.length === 0) state.rows.push(blankRow());
        withCaretPreserved(function () { renderGrid(); });
      }
    });
  });
}

function blankRow() {
  return { employee_id: null, name: '', role: '', monthHours: {} };
}

function monthsForYear(year) {
  return Array.from({ length: 12 }, function (_, i) {
    var d = new Date(Date.UTC(year, i, 1));
    var monthLabel = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    var yy = String(year).slice(-2);
    return {
      label: monthLabel + '-' + yy,  // e.g., Jan-25
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
  return Number.isFinite(r) ? r : 0;
}

function computeRevenue(cost, formula, feePct) {
  if (!Number.isFinite(Number(cost))) return 0;
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
    var hYear = monthKeys.reduce(function (s, k) {
      return s + Number(row.monthHours[k] || 0);
    }, 0);
    var cost  = hYear * rate;
    var rev   = computeRevenue(cost, state.projectFormula, state.projectFeePct);

    monthKeys.forEach(function (k) {
      hoursByMonth[k] += Number(row.monthHours[k] || 0);
    });
    hoursYear += hYear;
    costYear  += cost;
    revYear   += rev;
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
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

// ------------- persistence + data fetch -------------

async function fetchProject(projectId) {
  var res = await client
    .from('projects')
    .select('id, revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (res.error) throw res.error;
  return res.data;
}

async function fetchPlanLabor(projectId, year) {
  var res = await client
    .from('plan_labor')
    .select('employee_id, ym, hours')
    .eq('project_id', projectId);
  if (res.error) throw res.error;
  var data = res.data || [];
  return data.filter(function (r) {
    var kv = keyVal(r.ym);
    return kv && kv.slice(0, 4) === String(year);
  });
}

async function fetchActualLabor(projectId, year) {
  var yearStart = String(year) + '-01-01';
  var yearEnd   = String(year + 1) + '-01-01';

  var res = await client
    .from('vw_actual_labor_monthly')
    .select('project_id, employee_id, ym, hours')
    .eq('project_id', projectId)
    .gte('ym', yearStart)
    .lt('ym', yearEnd);
  if (res.error) {
    console.warn('fetchActualLabor error:', res.error.message || res.error);
    return { byEmpMonth: {}, lastYmKey: null };
  }
  var rows = res.data || [];
  var byEmpMonth = {};
  var lastYmKey = null;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r.employee_id) continue; // skip null employee for now
    var k = keyVal(r.ym);
    if (!k) continue;

    if (!byEmpMonth[r.employee_id]) byEmpMonth[r.employee_id] = {};
    byEmpMonth[r.employee_id][k] = Number(r.hours || 0);

    if (!lastYmKey || k > lastYmKey) lastYmKey = k;
  }

  return { byEmpMonth: byEmpMonth, lastYmKey: lastYmKey };
}

async function saveAll() {
  var msg = $('#empMsg');
  var pid = getProjectId();
  if (!pid) { if (msg) msg.textContent = 'Select a project first.'; return; }
  if (msg) msg.textContent = 'Saving…';

  var months = state.months.map(function (m) { return m.ym.slice(0, 7); });

  var inserts = [];
  for (var i = 0; i < state.rows.length; i++) {
    var row = state.rows[i];
    if (!row.employee_id) continue;

    for (var j = 0; j < months.length; j++) {
      // Only save Plan months (after actual cutoff)
      if (state.actualCutoffIdx >= 0 && j <= state.actualCutoffIdx) continue;

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
      var insRes = await client
        .from('plan_labor')
        .insert(inserts);
      if (insRes.error) throw insRes.error;
    }

    if (msg) msg.textContent = 'Saved.';
    setTimeout(function () { if (msg) msg.textContent = ''; }, 1200);
  } catch (err) {
    console.error('Employees save error', err);
    if (msg) {
      msg.textContent = 'Save failed: ' + (err && err.message ? err.message : String(err));
    }
  }
}
