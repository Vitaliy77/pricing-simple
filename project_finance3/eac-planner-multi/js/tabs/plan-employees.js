// js/tabs/plan-employees.js
// Employees planning tab: month columns for hours; saves to plan_labor.

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

// keep focus/caret when re-rendering
function withCaretPreserved(run) {
  const active = document.activeElement;
  const isCell = active?.classList?.contains('hrInp');
  const rowIdx = active?.closest?.('tr')?.dataset?.idx;
  const monthKey = active?.dataset?.k;
  const s = active?.selectionStart, e = active?.selectionEnd;

  run();

  if (isCell && rowIdx != null && monthKey) {
    const el = document.querySelector(`tr[data-idx="${rowIdx}"] input.hrInp[data-k="${monthKey}"]`);
    if (el) {
      el.focus();
      if (s != null && e != null) {
        try { el.setSelectionRange(s, e); } catch {}
      }
    }
  }
}

let state = {
  year: new Date().getUTCFullYear(),
  months: [],
  rows: [],
  projectFormula: 'TM',
  projectFeePct: 0
};

export async function init(rootEl) {
  const pid = getProjectId();
  const msg = $('#empMsg');
  const table = $('#empTable');

  if (!pid) {
    msg.textContent = 'Select or create a project to edit employees.';
    table.innerHTML = '';
    return;
  }

  state.year = Number(($('#monthPicker')?.value || new Date().toISOString().slice(0,7)).slice(0,4));
  state.months = monthsForYear(state.year);

  msg.textContent = 'Loading…';
  try {
    await loadLookups();

    const proj = await fetchProject(pid);
    state.projectFormula = proj?.revenue_formula || 'TM';
    state.projectFeePct = Number(proj?.fee_pct || 0);

    const plan = await fetchPlanLabor(pid, state.year);
    const empById = mapById(empLookup);
    const byEmp = {};
    for (const r of plan) {
      const k = keyVal(r.ym);
      if (!k) continue;
      const emp = empById[r.employee_id] || {};
      if (!byEmp[r.employee_id]) {
        byEmp[r.employee_id] = {
          employee_id: r.employee_id,
          name: emp.full_name ?? emp.name ?? '',
          role: emp.role ?? '',
          monthHours: {}
        };
      }
      byEmp[r.employee_id].monthHours[k] = Number(r.hours || 0);
    }
    state.rows = Object.values(byEmp);
    if (state.rows.length === 0) state.rows.push(blankRow());

    renderGrid();
    msg.textContent = '';
  } catch (err) {
    console.error('Employees init error', err);
    table.innerHTML = `<tbody><tr><td class="p-3 text-red-600">Error: ${err?.message || err}</td></tr></tbody>`;
    msg.textContent = '';
  }

  $('#empAddRow').onclick = () => {
    state.rows.push(blankRow());
    withCaretPreserved(() => renderGrid());
  };
  $('#empSave').onclick = saveAll;
}

function renderGrid() {
  const table = $('#empTable');
  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0,7));

  let html = '<thead><tr>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Employee</th>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Role</th>';
  months.forEach(m => html += `<th class="p-2 text-right">${m.label}</th>`);
  html += `
    <th class="p-2 text-right">Year Hours</th>
    <th class="p-2 text-right">Year Cost</th>
    <th class="p-2 text-right">Year Revenue</th>
    <th class="p-2 text-right">Profit</th>
    <th class="p-2"></th>
  `;
  html += '</tr></thead><tbody>';

  const empOptions = empLookup
    .map(e => `<option value="${e.id}" data-role="${esc(e.role ?? '')}" data-name="${esc(e.full_name ?? e.name ?? '')}">${esc(e.full_name ?? e.name ?? '')}</option>`)
    .join('');

  state.rows.forEach((row, idx) => {
    const rate = resolveLoadedRate(row.role);
    const hoursYear = monthKeys.reduce((s, k) => s + Number(row.monthHours[k] || 0), 0);
    const costYear  = hoursYear * rate;
    const revYear   = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    const profit    = revYear - costYear;

    html += `<tr data-idx="${idx}">`;

    html += `<td class="p-2 sticky left-0 bg-white">
      <select class="empSel border rounded-md p-1 min-w-56">
        <option value="">— Select —</option>
        ${empOptions}
      </select>
    </td>`;

    html += `<td class="p-2 sticky left-0 bg-white">
      <input class="roleInp border rounded-md p-1 w-40 bg-slate-50" value="${esc(row.role || '')}" disabled>
    </td>`;

    monthKeys.forEach(k => {
      const v = row.monthHours[k] ?? '';
      html += `<td class="p-1 text-right">
        <input data-k="${k}" class="hrInp border rounded-md p-1 w-20 text-right" type="number" min="0" step="0.1" value="${v !== '' ? String(v) : ''}">
      </td>`;
    });

    html += `<td class="p-2 text-right">${fmtNum(hoursYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(costYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(revYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(profit)}</td>`;
    html += `<td class="p-2 text-right">
      <button class="rowDel px-2 py-1 rounded-md border hover:bg-slate-50">✕</button>
    </td>`;

    html += '</tr>';
  });

  const totals = calcTotals(state.rows, monthKeys);
  html += `<tr class="font-semibold">
    <td class="p-2 sticky left-0 bg-white">Totals</td>
    <td class="p-2 sticky left-0 bg-white"></td>
    ${monthKeys.map(k => `<td class="p-2 text-right">${fmtNum(totals.hoursByMonth[k])}</td>`).join('')}
    <td class="p-2 text-right">${fmtNum(totals.hoursYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
    <td class="p-2 text-right">${fmtUSD0(totals.revYear - totals.costYear)}</td>
    <td class="p-2"></td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;

  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = Number(tr.dataset.idx);
    const sel = tr.querySelector('.empSel');
    if (sel) sel.value = state.rows[i].employee_id || '';
  });

  table.querySelectorAll('.empSel').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      const opt = e.target.selectedOptions[0];
      const role = opt?.dataset?.role || '';
      const name = opt?.dataset?.name || '';
      state.rows[idx].employee_id = e.target.value || null;
      state.rows[idx].role = role;
      state.rows[idx].name = name;
      withCaretPreserved(() => renderGrid());
    });
  });

  table.querySelectorAll('.hrInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      const k = e.target.dataset.k;
      const n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
      state.rows[idx].monthHours[k] = n === '' ? '' : (Number.isFinite(n) ? n : 0);
      withCaretPreserved(() => renderGrid());
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });

  table.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const idx = Number(tr.dataset.idx);
      state.rows.splice(idx, 1);
      if (state.rows.length === 0) state.rows.push(blankRow());
      withCaretPreserved(() => renderGrid());
    });
  });
}

function blankRow() {
  return { employee_id: null, name: '', role: '', monthHours: {} };
}

function monthsForYear(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, i, 1));
    return {
      label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      ym: d.toISOString().slice(0,10)
    };
  });
}

function mapById(list) {
  const m = {};
  (list || []).forEach(x => { if (x?.id) m[x.id] = x; });
  return m;
}

function keyVal(ym) {
  try { return (typeof ym === 'string') ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7); }
  catch { return null; }
}

function resolveLoadedRate(role) {
  const r = Number(rolesRate[role] || 0);
  return Number.isFinite(r) ? r : 0;
}

function computeRevenue(cost, formula, feePct) {
  if (!Number.isFinite(cost)) return 0;
  switch (formula) {
    case 'COST_PLUS': return cost * (1 + (Number(feePct || 0) / 100));
    case 'TM':        return cost;
    case 'FP':        return cost;
    default:          return cost;
  }
}

function calcTotals(rows, monthKeys) {
  const hoursByMonth = {};
  monthKeys.forEach(k => hoursByMonth[k] = 0);
  let hoursYear = 0, costYear = 0, revYear = 0;

  for (const row of rows) {
    const rate = resolveLoadedRate(row.role);
    const hYear = monthKeys.reduce((s,k)=> s + Number(row.monthHours[k] || 0), 0);
    const cost  = hYear * rate;
    const rev   = computeRevenue(cost, state.projectFormula, state.projectFeePct);

    monthKeys.forEach(k => { hoursByMonth[k] += Number(row.monthHours[k] || 0); });
    hoursYear += hYear;
    costYear  += cost;
    revYear   += rev;
  }
  return { hoursByMonth, hoursYear, costYear, revYear };
}

function fmtNum(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
function fmtUSD0(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ------------- persistence -------------
async function fetchProject(projectId) {
  const { data, error } = await client
    .from('projects')
    .select('id, revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchPlanLabor(projectId, year) {
  const { data, error } = await client
    .from('plan_labor')
    .select('employee_id, ym, hours')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data || []).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
}

async function saveAll() {
  const msg = $('#empMsg');
  const pid = getProjectId();
  if (!pid) { msg.textContent = 'Select a project first.'; return; }
  msg.textContent = 'Saving…';

  const months = state.months.map(m => m.ym.slice(0,7));
  const inserts = [];
  for (const row of state.rows) {
    if (!row.employee_id) continue;
    for (const mk of months) {
      const hrs = Number(row.monthHours[mk] || 0);
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
    const yearPrefix = String(state.year) + '-';
    const { error: delErr } = await client
      .from('plan_labor')
      .delete()
      .eq('project_id', pid)
      .gte('ym', yearPrefix + '01-01')
      .lte('ym', yearPrefix + '12-31');
    if (delErr) throw delErr;

    if (inserts.length) {
      const { error: insErr } = await client
        .from('plan_labor')
        .insert(inserts);
      if (insErr) throw insErr;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1200);
  } catch (err) {
    console.error('Employees save error', err);
    msg.textContent = `Save failed: ${err?.message || err}`;
  }
}
