// js/tabs/pnl.js
// P&L – FINAL: Fully wired to vw_eac_monthly_pl_v5 (revenue + costs in one row)
// One query. One map. Zero bugs. Trust the DB.
import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';

export const template = /*html*/ `
  <section class="space-y-4">
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">P&L</h2>
        <p class="text-xs text-slate-500">
          Prior years, two planning years by month, and outer years for the selected project.
        </p>
      </div>
      <div class="flex items-center gap-3 text-xs">
        <label class="inline-flex items-center gap-1">
          <span class="text-slate-600">View</span>
          <select id="plYearSelect"
                  class="border border-slate-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="2025" selected>2025–2026</option>
            <option value="2024">2024–2025</option>
            <option value="2023">2023–2024</option>
          </select>
        </label>
        <button id="recomputeEac"
                class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700">
          Recompute EAC
        </button>
        <button id="refreshPL"
                class="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-slate-50">
          Refresh P&L
        </button>
      </div>
    </div>
    <div class="bg-white rounded-xl shadow-sm p-4">
      <div id="plWrap" class="overflow-auto border rounded-lg">
        <table class="text-xs md:text-sm min-w-full" id="plTable"></table>
      </div>
      <p class="mt-2 text-xs text-slate-500">
        Revenue uses % complete (earned value) on baseline.<br>
        Costs = Actuals (past) + Plan (future) + ODC.
      </p>
    </div>
  </section>
`;

export async function init() {
  $('#recomputeEac')?.addEventListener('click', recomputeEAC);
  $('#refreshPL')?.addEventListener('click', refreshPL);
  $('#plYearSelect')?.addEventListener('change', refreshPL);
  await refreshPL();
}

function fmtUSD0(x) {
  return Number(x || 0).toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

async function recomputeEAC() {
  const btn = $('#recomputeEac');
  const status = $('#status');
  const projectId = getProjectId();
  if (!btn || !status || !projectId) return;
  try {
    btn.disabled = true;
    btn.textContent = 'Recomputing…';
    status.textContent = 'Recomputing EAC…';
    const { error } = await client.rpc('recompute_eac', { p_project_id: projectId });
    if (error) throw error;
    await refreshPL();
    status.textContent = 'EAC recomputed.';
  } catch (err) {
    console.error('recomputeEAC error', err);
    status.textContent = `Error: ${err.message || err}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Recompute EAC';
  }
}

const key = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 7);
  try { return d.toISOString().slice(0, 7); } catch { return ''; }
};

async function refreshPL() {
  const status = $('#status');
  const projectId = getProjectId();
  const plTable = $('#plTable');
  if (!plTable || !status) return;

  if (!projectId) {
    plTable.innerHTML = '<tbody><tr><td class="p-3 text-slate-500">Select a project to view P&L.</td></tr></tbody>';
    return;
  }

  try {
    status.textContent = 'Loading P&L…';
    const baseYear = Number($('#plYearSelect')?.value || 2025);
    const year1 = baseYear;
    const year2 = baseYear + 1;
    const year1Months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year1, i, 1)));
    const year2Months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year2, i, 1)));
    const year1Start = new Date(Date.UTC(year1, 0, 1));
    const year3Start = new Date(Date.UTC(year2 + 1, 0, 1));

    // ONE QUERY — v5 has everything (revenue + all costs)
    const { data: rows, error: plErr } = await client
      .from('vw_eac_monthly_pl_v5')
      .select('ym, revenue, labor, subs, equip, materials, odc, total_cost')
      .eq('project_id', projectId)
      .gte('ym', '1900-01-01')
      .lt('ym', '2100-01-01')
      .order('ym');

    if (plErr) throw plErr;

    // Single unified map — revenue and costs live together
    const plMap = Object.create(null);

    (rows || []).forEach(r => {
      const k = key(r.ym);
      if (!k) return;

      plMap[k] = {
        revenue:    Number(r.revenue ?? 0),
        labor:      Number(r.labor ?? 0),
        subs:       Number(r.subs ?? 0),
        equip:      Number(r.equip ?? 0),
        materials:  Number(r.materials ?? 0),
        odc:        Number(r.odc ?? 0),
        total_cost: Number(r.total_cost ?? 0),
      };
    });

    // Safe accessors — never crash
    const get = (k, field) => plMap[k]?.[field] ?? 0;
    const getRev = (k) => get(k, 'revenue');
    const getCost = (k, field) => get(k, field);

    const keyFromDate = d => key(d);
    const allKeys = Object.keys(plMap).sort();

    const rowsDef = [
      ['Revenue',    k => getRev(k)],
      ['Labor',      k => getCost(k, 'labor')],
      ['Sub',        k => getCost(k, 'subs')],
      ['Equipment',  k => getCost(k, 'equip')],
      ['Material',   k => getCost(k, 'materials')],
      ['ODC',        k => getCost(k, 'odc')],
      ['Total Cost', k => getCost(k, 'total_cost')],
      ['Profit',     k => getRev(k) - getCost(k, 'total_cost')],
      ['Margin %',   k => {
        const R = getRev(k);
        const C = getCost(k, 'total_cost');
        if (R === 0 && C === 0) return null;
        if (!R && C) return -100;
        return R ? ((R - C) / R) * 100 : 0;
      }],
    ];

    const calcMargin = (rev, cost) => {
      if (rev === 0 && cost === 0) return null;
      if (!rev && cost) return -100;
      return rev ? ((rev - cost) / rev) * 100 : 0;
    };

    // Render table
    let html = '<thead><tr>';
    html += '<th class="p-2 sticky-col text-xs font-semibold text-slate-500 bg-slate-50 border-b">Line</th>';
    html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Prior Years</th>';
    year1Months.forEach(d => {
      html += `<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">
        ${d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
      </th>`;
    });
    year2Months.forEach(d => {
      html += `<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">
        ${d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
      </th>`;
    });
    html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Outer Years</th>';
    html += '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Total</th>';
    html += '</tr></thead><tbody>';

    rowsDef.forEach(([label, fn]) => {
      const isProfit = label === 'Profit';
      const isMargin = label === 'Margin %';

      html += `<tr class="${isProfit ? 'font-bold' : isMargin ? 'font-medium' : ''}">`;
      html += `<td class="p-2 font-medium sticky-col text-xs md:text-sm">${label}</td>`;

      if (!isMargin) {
        const y1 = year1Months.map(d => fn(keyFromDate(d)));
        const y2 = year2Months.map(d => fn(keyFromDate(d)));

        let prior = 0, outer = 0;
        allKeys.forEach(k => {
          const v = fn(k);
          const date = new Date(k + '-01T00:00:00Z');
          if (date < year1Start) prior += v;
          else if (date >= year3Start) outer += v;
        });

        const total = prior + y1.reduce((a,b) => a + b, 0) + y2.reduce((a,b) => a + b, 0) + outer;

        html += `<td class="p-2 text-right tabular-nums">${fmtUSD0(prior)}</td>`;
        [...y1, ...y2].forEach(n => {
          const cls = isProfit
            ? n > 0 ? 'text-emerald-700 font-bold' : n < 0 ? 'text-rose-700 font-bold' : 'text-slate-600'
            : '';
          html += `<td class="p-2 text-right tabular-nums ${cls}">${fmtUSD0(n)}</td>`;
        });
        html += `<td class="p-2 text-right tabular-nums">${fmtUSD0(outer)}</td>`;
        html += `<td class="p-2 text-right font-bold tabular-nums ${isProfit && total > 0 ? 'text-emerald-700' : isProfit && total < 0 ? 'text-rose-700' : ''}">${fmtUSD0(total)}</td>`;
      } else {
        let priorRev = 0, priorCost = 0, outerRev = 0, outerCost = 0;
        const y1Rev = year1Months.map(d => getRev(keyFromDate(d)));
        const y1Cost = year1Months.map(d => getCost(keyFromDate(d), 'total_cost'));
        const y2Rev = year2Months.map(d => getRev(keyFromDate(d)));
        const y2Cost = year2Months.map(d => getCost(keyFromDate(d), 'total_cost'));

        allKeys.forEach(k => {
          const date = new Date(k + '-01T00:00:00Z');
          const r = getRev(k);
          const c = getCost(k, 'total_cost');
          if (date < year1Start) { priorRev += r; priorCost += c; }
          else if (date >= year3Start) { outerRev += r; outerCost += c; }
        });

        const render = v => v == null
          ? '<td class="p-2 text-right text-slate-400">—</td>'
          : `<td class="p-2 text-right font-medium ${v > 5 ? 'text-emerald-600' : v < -5 ? 'text-rose-600' : ''}">${v.toFixed(1)}%</td>`;

        html += render(calcMargin(priorRev, priorCost));
        y1Rev.forEach((_, i) => html += render(calcMargin(y1Rev[i], y1Cost[i])));
        y2Rev.forEach((_, i) => html += render(calcMargin(y2Rev[i], y2Cost[i])));
        html += render(calcMargin(outerRev, outerCost));
        html += render(calcMargin(
          priorRev + y1Rev.reduce((a,b)=>a+b,0) + y2Rev.reduce((a,b)=>a+b,0) + outerRev,
          priorCost + y1Cost.reduce((a,b)=>a+b,0) + y2Cost.reduce((a,b)=>a+b,0) + outerCost
        ));
      }
      html += '</tr>';
    });

    html += '</tbody>';
    plTable.innerHTML = html;
    status.textContent = '';
  } catch (err) {
    console.error('P&L render error', err);
    plTable.innerHTML = `<tbody><tr><td class="p-3 text-red-600">Error: ${err.message || err}</td></tr></tbody>`;
    status.textContent = `P&L error: ${err.message || err}`;
  }
}
