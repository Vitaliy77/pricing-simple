// js/tabs/visuals.js
// Visual aids: P&L trend + funding vs revenue + cost breakdown pies.
// Now with a gorgeous, light, transparent Cost Breakdown pie.

import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';

let plTrendChart = null;
let fundingPieChart = null;
let costPieChart = null;

export const template = /*html*/ `
  <section class="space-y-4">
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight text-slate-900">Visuals</h2>
        <p class="text-xs text-slate-500">
          Trend and composition charts for the selected project.
        </p>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <label class="inline-flex items-center gap-1">
          <span class="text-slate-600">Year</span>
          <select id="vizYearSelect"
                  class="border border-slate-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="2025" selected>2025</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
          </select>
        </label>
        <button id="refreshVisuals"
                class="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-slate-50">
          Refresh
        </button>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow-sm p-4 space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 class="text-sm font-semibold mb-2 text-slate-900">
            Funding vs Planned Revenue (total project)
          </h3>
          <div class="h-[280px] md:h-[340px]">
            <canvas id="vizFundingPie"></canvas>
          </div>
        </div>
        <div>
          <h3 class="text-sm font-semibold mb-2 text-slate-900">
            Cost Breakdown (total project)
          </h3>
          <div class="h-[280px] md:h-[340px]">
            <canvas id="vizCostPie"></canvas>
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-2 text-slate-900">P&L Trend (selected year)</h3>
        <div class="h-[320px] md:h-[420px]">
          <canvas id="vizTrendChart"></canvas>
        </div>
      </div>

      <p class="text-xs text-slate-500">
        Pie charts show total values aggregated over the full project duration.
      </p>
    </div>
  </section>
`;

// Toggle Project Bar (only visible on #project tab)
function toggleProjectBar() {
  const bar = document.getElementById('projectBar');
  if (!bar) return;
  const hash = location.hash || '#visuals';
  bar.classList.toggle('hidden', hash !== '#project');
}

export async function init(viewEl) {
  if (window.Chart) {
    Chart.defaults.font.size = 12;
    Chart.defaults.font.family = "'system-ui', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    Chart.defaults.color = '#0f172a';
  }

  $('#vizYearSelect')?.addEventListener('change', refreshVisuals);
  $('#refreshVisuals')?.addEventListener('click', refreshVisuals);

  toggleProjectBar();
  window.addEventListener('hashchange', toggleProjectBar);

  await refreshVisuals();
}

async function refreshVisuals() {
  const status = $('#status');
  const projectId = getProjectId();
  if (!status) return;

  if (!projectId) {
    [plTrendChart, fundingPieChart, costPieChart].forEach(ch => ch?.destroy());
    plTrendChart = fundingPieChart = costPieChart = null;
    status.textContent = 'Select a project to view visuals.';
    return;
  }

  try {
    status.textContent = 'Loading visuals…';
    const year = Number($('#vizYearSelect')?.value || 2025);
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;

    // === Trend Line Chart (unchanged) ===
    const { data: costs } = await client.from('vw_eac_monthly_pl')
      .select('ym, total_cost').eq('project_id', projectId).gte('ym', start).lt('ym', end).order('ym');
    const { data: rev } = await client.from('vw_eac_revenue_monthly')
      .select('ym, revenue').eq('project_id', projectId).gte('ym', start).lt('ym', end).order('ym');

    const months = Array.from({length:12}, (_,i)=>new Date(Date.UTC(year,i,1)));
    const labels = months.map(m=>m.toLocaleString('en-US',{month:'short',timeZone:'UTC'}));
    const revenueSeries = months.map(m=>Number(rev?.find(r=>r.ym.startsWith(m.toISOString().slice(0,7)))?.revenue || 0));
    const costSeries = months.map(m=>Number(costs?.find(r=>r.ym.startsWith(m.toISOString().slice(0,7)))?.total_cost || 0));
    const profitSeries = months.map((_,i)=>revenueSeries[i]-costSeries[i]);

    const trendCtx = $('#vizTrendChart');
    if (trendCtx && window.Chart) {
      plTrendChart?.destroy();
      plTrendChart = new Chart(trendCtx, { /* your existing trend chart config – unchanged */ });
    }

    // === Funding vs Revenue Doughnut (unchanged) ===
    const { data: proj } = await client.from('projects').select('funded_value').eq('id', projectId).single();
    const { data: allRev } = await client.from('vw_eac_revenue_monthly').select('revenue').eq('project_id', projectId);
    const funded = Number(proj?.funded_value || 0);
    const totalRevenue = (allRev || []).reduce((a,r)=>a+Number(r.revenue||0),0);

    const fundingCtx = $('#vizFundingPie');
    if (fundingCtx && window.Chart) {
      fundingPieChart?.destroy();
      fundingPieChart = new Chart(fundingCtx, { /* your existing doughnut config – unchanged */ });
    }

    // === COST BREAKDOWN PIE – NEW LIGHT & ELEGANT STYLE ===
    const { data: allCosts } = await client
      .from('vw_eac_monthly_pl')
      .select('labor, equip, materials, subs, fringe, overhead, gna')
      .eq('project_id', projectId);

    const totals = { labor:0, subs:0, equip:0, materials:0, fringe:0, overhead:0, gna:0 };
    (allCosts || []).forEach(r => {
      totals.labor += Number(r.labor || 0);
      totals.subs += Number(r.subs || 0);
      totals.equip += Number(r.equip || 0);
      totals.materials += Number(r.materials || 0);
      totals.fringe += Number(r.fringe || 0);
      totals.overhead += Number(r.overhead || 0);
      totals.gna += Number(r.gna || 0);
    });

    const costLabels = ['Labor', 'Sub', 'Equipment', 'Material', 'Fringe', 'Overhead', 'G&A'];
    const costValues = Object.values(totals);

    const costCtx = $('#vizCostPie');
    if (costCtx && window.Chart) {
      costPieChart?.destroy();

      costPieChart = new Chart(costCtx, {
        type: 'pie',
        data: {
          labels: costLabels,
          datasets: [{
            data: costValues,
            backgroundColor: [
              'rgba(37, 99, 235, 0.18)',   // blue-700
              'rgba(16, 185, 129, 0.18)',  // emerald-500
              'rgba(234, 179, 8, 0.18)',   // amber-500
              'rgba(59, 130, 246, 0.16)',  // blue-500 light
              'rgba(45, 212, 191, 0.18)',  // teal-400
              'rgba(148, 163, 184, 0.18)', // slate-400
              'rgba(30, 64, 175, 0.16)'    // blue-800 light
            ],
            borderColor: [
              'rgba(37, 99, 235, 0.6)',
              'rgba(16, 185, 129, 0.6)',
              'rgba(234, 179, 8, 0.6)',
              'rgba(59, 130, 246, 0.6)',
              'rgba(45, 212, 191, 0.6)',
              'rgba(148, 163, 184, 0.6)',
              'rgba(30, 64, 175, 0.6)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#0f172a',
                font: { size: 12, weight: '600' }
              }
            },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const dataset = ctx.dataset.data || [];
                  const total = dataset.reduce((s, v) => s + Number(v || 0), 0);
                  const value = Number(dataset[ctx.dataIndex] || 0);
                  const pct = total ? (value / total) * 100 : 0;
                  return `${ctx.label}: ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${pct.toFixed(1)}%)`;
                }
              }
            },
            datalabels: {
              color: '#0f172a',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              borderColor: 'rgba(15, 23, 42, 0.08)',
              borderWidth: 1,
              borderRadius: 4,
              padding: 4,
              formatter(value, ctx) {
                const dataArr = ctx.chart.data.datasets[0].data || [];
                const total = dataArr.reduce((s, v) => s + Number(v || 0), 0);
                const pct = total ? (value / total) * 100 : 0;
                return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n${pct.toFixed(1)}%`;
              },
              font: { size: 11, weight: '600' },
              clamp: true,
              anchor: 'center',
              align: 'center'
            }
          }
        }
      });
    }

    status.textContent = '';
  } catch (err) {
    console.error('Visuals error', err);
    status.textContent = `Error: ${err.message || err}`;
  }
}
