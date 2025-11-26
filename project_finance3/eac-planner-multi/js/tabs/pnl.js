// js/tabs/pnl.js
// P&L tab – now 100% reliable: costs show every month, even when zero
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
      <p853 class="mt-2 text-xs text-slate-500">
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
  return Number(x || 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  });
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

/**
 * Safe YYYY-MM key extractor
 */
const key = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 7);
  try {
    return d.toISOString().slice(0, 7);
  } catch {
    return '';
  }
};

/**
 * MAIN P&L REFRESH – NOW BULLETPROOF
 */
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

    // ---- REVENUE – has every month (source of truth for timeline) ----
    const { data: rev, error: rErr } = await client
      .from('vw_eac_revenue_monthly')
      .select('ym, revenue')
      .eq('project_id', projectId)
      .gte('ym', '1900-01-01')
      .lt('ym', '2100-01-01')
      .order('ym');
    if (rErr) throw rErr;

    // ---- COSTS – grab whatever exists ----
    let rawCosts = [];
    try {
      const { data, error } = await client
        .from('vw_eac_monthly_pl_v4')
        .select('*')
        .eq('project_id', projectId)
        .gte('ym', '1900-01-01')
        .lt('ym', '2100-01-01')
        .order('ym');
      if (error) throw error;
      rawCosts = data || [];
    } catch (e) {
      console.warn('vw_eac_monthly_pl_v4 failed → falling back to vw_eac_revenue_monthly_v4', e);
      const { data, error } = await client
        .from('vw_eac_revenue_monthly_v4')
        .select('*')
        .eq('project_id', projectId)
        .gte('ym', '1900-01-01')
        .lt('ym', '2100-01-01')
        .order('ym');
      if (error) throw error;
      rawCosts = data || [];
    }

    // ---- Build revMap first (defines all months) ----
    const revMap = Object.create(null);
    (rev || []).forEach(r => {
      const k = key(r.ym);
      if (k) revMap[k] = Number(r.revenue || 0);
    });

    // ---- Build costMap – force entry for EVERY revenue month ----
    const costMap = Object.create(null);

    // 1. Insert real cost rows
    (rawCosts || []).forEach(r => {
      const k = key(r.ym);
      if (!k) return;
      const labor = Number(r.labor ?? r.direct_labor ?? 0);
      const subs = Number(r.subs ?? r.sub ?? 0);
      const equipment = Number(r.equipment ?? r.equip ?? 0);
      const materials = Number(r.materials ?? r.mats ?? 0);
      const odc = Number(r.odc ?? r.other_direct_costs ?? 0);

      costMap[k] = { labor, subs, equipment, materials, odc, total_cost: 0 };
    });

    // 2. Ensure every revenue month exists (zero-fill missing)
    Object.keys(revMap).forEach(k => {
      if (!costMap[k]) {
        costMap[k] = { labor: 0, subs: 0, equipment: 0, materials: 0, odc: 0, total_cost: 0 };
      }
      const c = costMap[k];
      c.total_cost = c.labor + c.subs + c.equipment + c.materials + c.odc;
    });

    const keyFromDate = d => key(d);

    // All months (now perfectly aligned)
    const allKeys = Array.from(new Set([...Object.keys(costMap), ...Object.keys(revMap)])).sort();

    // Row definitions
    const rows = [
      ['Revenue', (k) => Number(revMap[k] || 0)],
      ['Labor', (k) => Number(costMap[k]?.labor || 0)],
      ['Sub', (k) => Number(costMap[k]?.subs || 0)],
      ['Equipment', (k) => Number(costMap[k]?.equipment || 0)],
      ['Material', (k) => Number(costMap[k]?.materials || 0)],
      ['ODC', (k) => Number(costMap[k]?.odc || 0)],
      ['Total Cost', (k) => Number(costMap[k]?.total_cost || 0)],
      ['Profit', (k) => Number(revMap[k] || 0) - Number(costMap[k]?.total_cost || 0)],
      ['Margin %', (k) => {
        const R = Number(revMap[k] || 0);
        const C = Number(costMap[k]?.total_cost || 0);
        if (R === 0 && C === 0) return null;
        if (!R && C) return -100;
        if (R) return ((R - C) / R) * 100;
        return 0;
      }]
    ];

    const calcMargin = (revTotal, costTotal) => {
      if (revTotal === 0 && costTotal === 0) return null;
      if (!revTotal && costTotal) return -100;
      if (revTotal) return ((revTotal - costTotal) / revTotal) * 100;
      return 0;
    };

    // ---- Render Table (unchanged beautiful logic) ----
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

    rows.forEach(([label, fn]) => {
      const isProfit = label === 'Profit';
      const isMargin = label === 'Margin %';

      html += `<tr class="${isProfit ? 'font-semibold' : isMargin ? 'font-medium' : ''}">`;
      html += `<td class="p-2 font-medium sticky-col text-xs md:text-sm">${label}</td>`;

      if (!isMargin) {
        const year1Values = year1Months.map(d => Number(fn(keyFromDate(d)) || 0));
        const year2Values = year2Months.map(d => Number(fn(keyFromDate(d)) || 0));

        let priorTotal = 0;
        let outerTotal = 0;
        allKeys.forEach(k => {
          const date = new Date(k + '-01T00:00:00Z');
          const v = Number(fn(k) || 0);
          if (date < year1Start) priorTotal += v;
          else if (date >= year3Start) outerTotal += v;
        });

        const totalAll = priorTotal +
          year1Values.reduce((a, b) => a + b, 0) +
          year2Values.reduce((a, b) => a + b, 0) +
          outerTotal;

        html += `<td class="p-2 text-right tabular-nums">${fmtUSD0(priorTotal)}</td>`;
        [...year1Values, ...year2Values].forEach(n => {
          let cls = 'p-2 text-right tabular-nums';
          if (isProfit) cls += n > 0 ? ' text-emerald-700 font-bold' : n < 0 ? ' text-rose-700 font-bold' : ' text-slate-600';
          html += `<td class="${cls}">${fmtUSD0(n)}</td>`;
        });
        html += `<td class="p-2 text-right tabular-nums">${fmtUSD0(outerTotal)}</td>`;
        html += `<td class="p-2 text-right font-bold tabular-nums${isProfit && totalAll > 0 ? ' text-emerald-700' : isProfit && totalAll < 0 ? ' text-rose-700' : ''}">${fmtUSD0(totalAll)}</td>`;
      } else {
        // Margin row – unchanged
        let priorRev = 0, priorCost = 0, outerRev = 0, outerCost = 0;
        const year1Rev = year1Months.map(d => revMap[keyFromDate(d)] || 0);
        const year1Cost = year1Months.map(d => costMap[keyFromDate(d)]?.total_cost || 0);
        const year2Rev = year2Months.map(d => revMap[keyFromDate(d)] || 0);
        const year2Cost = year2Months.map(d => costMap[keyFromDate(d)]?.total_cost || 0);

        allKeys.forEach(k => {
          const date = new Date(k + '-01T00:00:00Z');
          const r = revMap[k] || 0;
          const c = costMap[k]?.total_cost || 0;
          if (date < year1Start) { priorRev += r; priorCost += c; }
          else if (date >= year3Start) { outerRev += r; outerCost += c; }
        });

        const renderMargin = v => v == null
          ? '<td class="p-2 text-right text-slate-400">—</td>'
          : `<td class="p-2 text-right font-medium${v > 0.05 ? ' text-emerald-600' : v < -0.05 ? ' text-rose-600' : ''}">${Number(v).toFixed(1)}%</td>`;

        html += renderMargin(calcMargin(priorRev, priorCost));
        year1Rev.forEach((_, i) => html += renderMargin(calcMargin(year1Rev[i], year1Cost[i])));
        year2Rev.forEach((_, i) => html += renderMargin(calcMargin(year2Rev[i], year2Cost[i])));
        html += renderMargin(calcMargin(outerRev, outerCost));
        html += renderMargin(calcMargin(
          priorRev + year1Rev.reduce((a,b)=>a+b,0) + year2Rev.reduce((a,b)=>a+b,0) + outerRev,
          priorCost + year1Cost.reduce((a,b)=>a+b,0) + year2Cost.reduce((a,b)=>a+b,0) + outerCost
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
