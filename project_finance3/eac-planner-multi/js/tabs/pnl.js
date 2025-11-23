// js/tabs/pnl.js
import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';

let plChartInstance = null;

export const template = /*html*/ `
  <section class="space-y-4">
    <!-- P&L action bar -->
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">P&amp;L</h2>
        <p class="text-xs text-slate-500">
          Monthly revenue, costs, and margin for the selected project.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          id="recomputeEac"
          class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          Recompute EAC
        </button>
        <button
          id="refreshPL"
          class="px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-slate-50"
        >
          Refresh P&amp;L
        </button>
      </div>
    </div>

    <!-- Table + chart card -->
    <div class="bg-white rounded-xl shadow-sm p-4 space-y-4">
      <div id="plWrap" class="overflow-auto border rounded-lg">
        <table class="text-xs md:text-sm min-w-full" id="plTable"></table>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-2 min-h-[220px]">
          <h3 class="text-sm font-semibold mb-2">P&amp;L Trend</h3>
          <div class="h-52">
            <canvas id="plChart"></canvas>
          </div>
        </div>
        <div class="text-xs text-slate-500 space-y-1">
          <p>
            <span class="font-semibold">Tip:</span>
            Use the month picker in the top bar to jump between years.
          </p>
          <p>
            Revenue uses % complete (earned value) on baseline.
          </p>
          <p>
            Costs = Actuals (past) + Plan (future) + Indirects.
          </p>
        </div>
      </div>
    </div>
  </section>
`;

export async function init(viewEl) {
  // Wire buttons
  $('#recomputeEac')?.addEventListener('click', recomputeEAC);
  $('#refreshPL')?.addEventListener('click', refreshPL);

  // Initial render
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

  if (!btn || !status) return;
  if (!projectId) {
    status.textContent = 'Select a project first.';
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Recomputing…';
    status.textContent = 'Recomputing EAC…';

    // RPC name/arg must match your SQL function
    const { error } = await client.rpc('recompute_eac', { p_project_id: projectId });
    if (error) throw error;

    await refreshPL();
    status.textContent = 'Done.';
  } catch (err) {
    console.error('recomputeEAC error', err);
    status.textContent = `EAC recompute error: ${err.message || err}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Recompute EAC';
  }
}

async function refreshPL() {
  const status = $('#status');
  const projectId = getProjectId();
  const plTable = $('#plTable');

  if (!plTable || !status) return;

  if (!projectId) {
    plTable.innerHTML =
      '<tbody><tr><td class="p-3 text-slate-500">Select a project to view P&amp;L.</td></tr></tbody>';
    // Clear chart if no project
    if (plChartInstance) {
      plChartInstance.destroy();
      plChartInstance = null;
    }
    return;
  }

  try {
    status.textContent = 'Loading P&L…';

    const ym = $('#monthPicker')?.value || new Date().toISOString().slice(0, 7); // yyyy-mm
    const year = Number(ym.slice(0, 4));
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;

    // Costs
    const { data: costs, error: cErr } = await client
      .from('vw_eac_monthly_pl')
      .select('ym, labor, equip, materials, subs, fringe, overhead, gna, total_cost')
      .eq('project_id', projectId)
      .gte('ym', start)
      .lt('ym', end)
      .order('ym');
    if (cErr) throw cErr;

    // Revenue
    const { data: rev, error: rErr } = await client
      .from('vw_eac_revenue_monthly')
      .select('ym, revenue')
      .eq('project_id', projectId)
      .gte('ym', start)
      .lt('ym', end)
      .order('ym');
    if (rErr) throw rErr;

    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i, 1)));
    const key = (d) => d.toISOString().slice(0, 7);

    const costMap = Object.create(null);
    (costs || []).forEach((r) => {
      costMap[new Date(r.ym).toISOString().slice(0, 7)] = r;
    });

    const revMap = Object.create(null);
    (rev || []).forEach((r) => {
      revMap[new Date(r.ym).toISOString().slice(0, 7)] = Number(r.revenue || 0);
    });

    const rows = [
      ['Revenue', (k) => Number(revMap[k] || 0)],
      ['Labor', (k) => Number(costMap[k]?.labor || 0)],
      ['Sub', (k) => Number(costMap[k]?.subs || 0)],
      ['Equipment', (k) => Number(costMap[k]?.equip || 0)],
      ['Material', (k) => Number(costMap[k]?.materials || 0)],
      ['ODC', (k) => 0], // if you have ODC, replace 0 with proper field
      ['Fringe', (k) => Number(costMap[k]?.fringe || 0)],
      ['Overhead', (k) => Number(costMap[k]?.overhead || 0)],
      ['G&A', (k) => Number(costMap[k]?.gna || 0)],
      ['Total Cost', (k) => Number(costMap[k]?.total_cost || 0)],
      ['Profit', (k) => Number(revMap[k] || 0) - Number(costMap[k]?.total_cost || 0)],
      [
        'Margin %',
        (k) => {
          const R = Number(revMap[k] || 0);
          const C = Number(costMap[k]?.total_cost || 0);
          if (R === 0 && C === 0) return null;
          if (!R && C) return -100;
          if (R) return ((R - C) / R) * 100;
          return 0;
        }
      ]
    ];

    // Build table HTML
    let html = '<thead><tr>';
    html +=
      '<th class="p-2 sticky-col text-xs font-semibold text-slate-500 bg-slate-50 border-b">Line</th>';
    months.forEach((d) => {
      html += `<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">${d.toLocaleString(
        'en-US',
        { month: 'short', timeZone: 'UTC' }
      )}</th>`;
    });
    html +=
      '<th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Total</th></tr></thead><tbody>';

    rows.forEach(([label, fn]) => {
      const isSummary = label === 'Total Cost' || label === 'Profit' || label === 'Margin %';
      const isProfit = label === 'Profit';
      const isMargin = label === 'Margin %';

      const rowClassParts = ['pl-row'];
      if (isSummary) rowClassParts.push('summary-row');
      if (isProfit) rowClassParts.push('profit-row');
      if (isMargin) rowClassParts.push('margin-row');

      html += `<tr class="${rowClassParts.join(' ')}">`;
      html += `<td class="p-2 font-medium sticky-col text-xs md:text-sm">${label}</td>`;

      let yearTotal = 0;

      months.forEach((d) => {
        const k = key(d);
        const val = fn(k);

        if (isMargin) {
          if (val == null) {
            html += '<td class="p-2 text-right text-slate-400">—</td>';
          } else {
            const n = Number(val);
            let cls = 'p-2 text-right font-medium';
            if (n > 0.05) cls += ' text-emerald-600';
            else if (n < -0.05) cls += ' text-rose-600';
            else cls += ' text-slate-500';
            html += `<td class="${cls}">${n.toFixed(1)}%</td>`;
          }
        } else {
          const n = Number(val || 0);
          yearTotal += n;

          let cls = 'p-2 text-right tabular-nums';
          if (isProfit) {
            if (n > 0.5) cls += ' text-emerald-700 font-semibold';
            else if (n < -0.5) cls += ' text-rose-700 font-semibold';
            else cls += ' text-slate-600 font-medium';
          }

          html += `<td class="${cls}">${fmtUSD0(n)}</td>`;
        }
      });

      // Year total column
      if (isMargin) {
        const Rtot = months.reduce((s, d) => s + Number(revMap[key(d)] || 0), 0);
        const Ctot = months.reduce((s, d) => s + Number(costMap[key(d)]?.total_cost || 0), 0);
        const mtot =
          Rtot === 0 && Ctot === 0
            ? null
            : Rtot
            ? ((Rtot - Ctot) / Rtot) * 100
            : Ctot
            ? -100
            : 0;

        if (mtot == null) {
          html += '<td class="p-2 text-right text-slate-400 font-semibold">—</td>';
        } else {
          const n = Number(mtot);
          let cls = 'p-2 text-right font-semibold';
          if (n > 0.05) cls += ' text-emerald-700';
          else if (n < -0.05) cls += ' text-rose-700';
          else cls += ' text-slate-600';
          html += `<td class="${cls}">${n.toFixed(1)}%</td>`;
        }
      } else {
        let cls = 'p-2 text-right font-semibold tabular-nums';
        if (isProfit) {
          if (yearTotal > 0.5) cls += ' text-emerald-700';
          else if (yearTotal < -0.5) cls += ' text-rose-700';
        }
        html += `<td class="${cls}">${fmtUSD0(yearTotal)}</td>`;
      }

      html += '</tr>';
    });

    html += '</tbody>';
    plTable.innerHTML = html;

    // --- Build chart datasets ---
    const labels = months.map((d) =>
      d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    );

    const revenueSeries = months.map((d) => {
      const k = key(d);
      return Number(revMap[k] || 0);
    });

    const costSeries = months.map((d) => {
      const k = key(d);
      return Number(costMap[k]?.total_cost || 0);
    });

    const profitSeries = months.map((d, i) => revenueSeries[i] - costSeries[i]);

    const ctx = document.getElementById('plChart');
    if (ctx && window.Chart) {
      if (plChartInstance) {
        plChartInstance.destroy();
      }

      plChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Revenue',
              data: revenueSeries,
              borderWidth: 2,
              tension: 0.3
            },
            {
              label: 'Total Cost',
              data: costSeries,
              borderWidth: 2,
              tension: 0.3
            },
            {
              label: 'Profit',
              data: profitSeries,
              borderWidth: 2,
              borderDash: [4, 4],
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12
              }
            },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const v = ctx.parsed.y || 0;
                  return `${ctx.dataset.label}: ${v.toLocaleString('en-US', {
                    maximumFractionDigits: 0
                  })}`;
                }
              }
            }
          },
          scales: {
            y: {
              ticks: {
                callback(value) {
                  return value.toLocaleString('en-US', {
                    maximumFractionDigits: 0
                  });
                }
              }
            }
          }
        }
      });
    }

    status.textContent = '';
  } catch (err) {
    console.error('P&L render error', err);
    plTable.innerHTML = `<tbody><tr><td class="p-3 text-red-600">P&L error: ${
      err.message || err
    }</td></tr></tbody>`;
    if (status) {
      status.textContent = `P&L error: ${err.message || err}`;
    }
  }
}
