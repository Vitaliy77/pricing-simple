// js/tabs/pnl.js
import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';

// Chart.js instance — destroy old one on refresh
let plChartInstance = null;

export const template = /*html*/ `
  <section class="space-y-6">
    <!-- Action bar -->
    <div class="bg-white rounded-xl shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold tracking-tight">P&L</h2>
        <p class="text-sm text-slate-500 mt-1">
          Monthly revenue, costs, and margin for the selected project
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button id="recomputeEac"
          class="px-4 py-2.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition">
          Recompute EAC
        </button>
        <button id="refreshPL"
          class="px-4 py-2.5 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50 transition">
          Refresh P&L
        </button>
      </div>
    </div>

    <!-- Table + Chart -->
    <div class="bg-white rounded-xl shadow-sm p-5 space-y-8">
      <!-- P&L Table -->
      <div class="overflow-x-auto border rounded-lg">
        <table class="min-w-full text-sm" id="plTable"></table>
      </div>

      <!-- Chart + Tip -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2">
          <h3 class="text-lg font-semibold mb-4 text-slate-800">P&L Trend</h3>
          <div class="h-80">
            <canvas id="plChart"></canvas>
          </div>
        </div>
        <div class="text-sm text-slate-600 space-y-3 bg-slate-50 p-5 rounded-lg">
          <p class="font-medium text-slate-700">How this works:</p>
          <ul class="space-y-2 text-xs leading-relaxed">
            <li>• Revenue = Earned Value (% complete × baseline)</li>
            <li>• Costs = Actuals (past) + Plan (future) + Indirects</li>
            <li>• Profit = Revenue − Total Cost</li>
            <li>• Use the month picker above to change year</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
`;

export async function init(viewEl) {
  $('#recomputeEac')?.addEventListener('click', recomputeEAC);
  $('#refreshPL')?.addEventListener('click', refreshPL);
  await refreshPL();
}

function fmtUSD0(x) {
  return Number(x || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

async function recomputeEAC() {
  const btn = $('#recomputeEac');
  const status = $('#status');
  const projectId = getProjectId();
  if (!projectId) { status.textContent = 'Select a project first.'; return; }

  try {
    btn.disabled = true; btn.textContent = 'Recomputing…';
    status.textContent = 'Recomputing EAC…';
    const { error } = await client.rpc('recompute_eac', { p_project_id: projectId });
    if (error) throw error;
    await refreshPL();
    status.textContent = 'EAC recomputed successfully.';
  } catch (err) {
    console.error('recomputeEAC error', err);
    status.textContent = `Error: ${err.message || err}`;
  } finally {
    btn.disabled = false; btn.textContent = 'Recompute EAC';
  }
}

async function refreshPL() {
  const status = $('#status');
  const projectId = getProjectId();
  const plTable = $('#plTable');

  if (!projectId) {
    plTable.innerHTML = `<tbody><tr><td class="p-8 text-center text-slate-500">Select a project to view P&L.</td></tr></tbody>`;
    return;
  }

  try {
    status.textContent = 'Loading P&L…';

    const ym = $('#monthPicker')?.value || new Date().toISOString().slice(0,7);
    const year = Number(ym.slice(0,4));
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;

    const [{ data: costs }, { data: rev }] = await Promise.all([
      client.from('vw_eac_monthly_pl')
        .select('ym,labor,equip,materials,subs,fringe,overhead,gna,total_cost')
        .eq('project_id', projectId)
        .gte('ym', start)
        .lt('ym', end)
        .order('ym'),
      client.from('vw_eac_revenue_monthly')
        .select('ym,revenue')
        .eq('project_id', projectId)
        .gte('ym', start)
 nudo.lt('ym', end)
        .order('ym')
    ]);

    if (!costs) throw new Error("No cost data");
    if (!rev) throw new Error("No revenue data");

    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i, 1)));
    const key = d => d.toISOString().slice(0,7);

    const costMap = Object.fromEntries((costs || []).map(r => [new Date(r.ym).toISOString().slice(0,7), r]));
    const revMap = Object.fromEntries((rev || []).map(r => [new Date(r.ym).toISOString().slice(0,7), Number(r.revenue || 0)]));

    // Build table
    const rows = [
      ['Revenue',      k => Number(revMap[k] || 0)],
      ['Labor',        k => Number(costMap[k]?.labor || 0)],
      ['Subcontractors', k => Number(costMap[k]?.subs || 0)],
      ['Equipment',    k => Number(costMap[k]?.equip || 0)],
      ['Materials',    k => Number(costMap[k]?.materials || 0)],
      ['Fringe',       k => Number(costMap[k]?.fringe || 0)],
      ['Overhead',     k => Number(costMap[k]?.overhead || 0)],
      ['G&A',          k => Number(costMap[k]?.gna || 0)],
      ['Total Cost',   k => Number(costMap[k]?.total_cost || 0)],
      ['Profit',       k => Number(revMap[k] || 0) - Number(costMap[k]?.total_cost || 0)],
      ['Margin %',     k => {
        const r = Number(revMap[k] || 0);
        const c = Number(costMap[k]?.total_cost || 0);
        return r + c === 0 ? null : (r - c) / r * 100;
      }],
    ];

    let html = `<thead class="bg-slate-50"><tr>
      <th class="p-3 text-left font-semibold sticky left-0 bg-slate-50 z-10">Category</th>
      ${months.map(m => `<th class="p-3 text-right font-medium">${m.toLocaleString('en-US', { month: 'short' })}</th>`).join('')}
      <th class="p-3 text-right font-semibold bg-slate-100">Year Total</th>
    </tr></thead><tbody>`;

    rows.forEach(([label, fn]) => {
      let yearTotal = 0;
      html += `<tr class="${label.includes('Cost') || label === 'Profit' || label === 'Margin %' ? 'font-medium' : ''}">
        <td class="p-3 sticky left-0 bg-white z-10 font-medium">${label}</td>`;
      months.forEach(m => {
        const k = key(m);
        const val = fn(k);
        if (label === 'Margin %') {
          html += `<td class="p-3 text-right">${val === null ? '—' : val.toFixed(1) + '%'}</td>`;
        } else {
          yearTotal += Number(val || 0);
          html += `<td class="p-3 text-right">${fmtUSD0(val)}</td>`;
        }
      });
      if (label === 'Margin %') {
        const totalRev = months.reduce((s, m) => s + Number(revMap[key(m)] || 0), 0);
        const totalCost = months.reduce((s, m) => s + Number(costMap[key(m)]?.total_cost || 0), 0);
        const margin = totalRev + totalCost === 0 ? null : (totalRev - totalCost) / totalRev * 100;
        html += `<td class="p-3 text-right font-bold bg-slate-50">${margin === null ? '—' : margin.toFixed(1) + '%'}</td>`;
      } else {
        html += `<td class="p-3 text-right font-bold bg-slate-50">${fmtUSD0(yearTotal)}</td>`;
      }
      html += `</tr>`;
    });

    html += `</tbody>`;
    plTable.innerHTML = html;

    // ——— CHART ———
    const labels = months.map(d => d.toLocaleString('en-US', { month: 'short' }));

    const revenueSeries = months.map(d => Number(revMap[key(d)] || 0));
    const costSeries = months.map(d => Number(costMap[key(d)]?.total_cost || 0));
    const profitSeries = months.map((_, i) => revenueSeries[i] - costSeries[i]);

    const ctx = $('#plChart');
    if (ctx) {
      if (plChartInstance) plChartInstance.destroy();

      plChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Revenue',
              data: revenueSeries,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderWidth: 3,
              tension: 0.3,
              fill: true
            },
            {
              label: 'Total Cost',
              data: costSeries,
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderWidth: 3,
              tension: 0.3,
              fill: true
            },
            {
              label: 'Profit',
              data: profitSeries,
              borderColor: '#3b82f6',
              borderWidth: 3,
              borderDash: [8, 4],
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { padding: 20, font: { size: 13 } } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const v = ctx.parsed.y;
                  return `${ctx.dataset.label}: $${Math.round(v).toLocaleString()}`;
                }
              }
            }
          },
          scales: {
            y: {
              ticks: { callback: v => '$' + Math.round(v / 1000) + 'k' },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            x: { grid: { display: false } }
          }
        }
      });
    }

    status.textContent = '';
  } catch (err) {
    console.error('P&L error:', err);
    plTable.innerHTML = `<tbody><tr><td class="p-8 text-center text-red-600">Error loading P&L: ${err.message}</td></tr></tbody>`;
    status.textContent = 'Failed to load P&L';
  }
}
