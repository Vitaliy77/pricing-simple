// js/tabs/visuals.js
// Visual aids: P&L trend line + funding vs planned revenue + cost breakdown pies.

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
        <h2 class="text-lg font-semibold tracking-tight">Visuals</h2>
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
        <button
          id="refreshVisuals"
          class="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-slate-50">
          Refresh
        </button>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow-sm p-4 space-y-6">
      <!-- TOP: pies -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 class="text-sm font-semibold mb-2">Funding vs Planned Revenue (total project)</h3>
          <div class="h-80">
            <canvas id="vizFundingPie"></canvas>
          </div>
        </div>
        <div>
          <h3 class="text-sm font-semibold mb-2">Cost Breakdown (total project)</h3>
          <div class="h-80">
            <canvas id="vizCostPie"></canvas>
          </div>
        </div>
      </div>

      <!-- BOTTOM: P&L trend -->
      <div>
        <h3 class="text-sm font-semibold mb-2">P&amp;L Trend (selected year)</h3>
        <div class="h-64">
          <canvas id="vizTrendChart"></canvas>
        </div>
      </div>

      <p class="text-xs text-slate-500">
        Pie charts show total values aggregated over the full project duration.
      </p>
    </div>
  </section>
`;

export async function init(viewEl) {
  const yearSel = $('#vizYearSelect');
  const btn = $('#refreshVisuals');

  if (yearSel) {
    yearSel.addEventListener('change', refreshVisuals);
  }
  if (btn) {
    btn.addEventListener('click', refreshVisuals);
  }

  await refreshVisuals();
}

async function refreshVisuals() {
  const status = $('#status');
  const projectId = getProjectId();

  if (!status) return;

  if (!projectId) {
    // clear any existing charts
    destroyCharts();
    status.textContent = 'Select a project to view visuals.';
    return;
  }

  try {
    status.textContent = 'Loading visuals…';

    const year = Number($('#vizYearSelect')?.value || 2025);
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;

    // --------- Year-by-month data for trend chart ---------
    const { data: costs, error: cErr } = await client
      .from('vw_eac_monthly_pl')
      .select('ym, labor, equip, materials, subs, fringe, overhead, gna, total_cost')
      .eq('project_id', projectId)
      .gte('ym', start)
      .lt('ym', end)
      .order('ym');

    if (cErr) throw cErr;

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
      const k = new Date(r.ym).toISOString().slice(0, 7);
      costMap[k] = r;
    });

    const revMap = Object.create(null);
    (rev || []).forEach((r) => {
      const k = new Date(r.ym).toISOString().slice(0, 7);
      revMap[k] = Number(r.revenue || 0);
    });

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

    // --------- Trend chart ---------
    const trendCtx = document.getElementById('vizTrendChart');
    if (trendCtx && window.Chart) {
      if (plTrendChart) {
        plTrendChart.destroy();
      }

      plTrendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Revenue',
              data: revenueSeries,
              borderWidth: 2,
              tension: 0.35,
              pointRadius: 2.5,
              borderColor: 'rgba(37, 99, 235, 0.8)', // blue
              backgroundColor: 'rgba(37, 99, 235, 0.08)'
            },
            {
              label: 'Total Cost',
              data: costSeries,
              borderWidth: 2,
              tension: 0.35,
              pointRadius: 2.5,
              borderColor: 'rgba(16, 185, 129, 0.8)', // emerald
              backgroundColor: 'rgba(16, 185, 129, 0.08)'
            },
            {
              label: 'Profit',
              data: profitSeries,
              borderWidth: 2,
              borderDash: [4, 4],
              tension: 0.35,
              pointRadius: 2.5,
              borderColor: 'rgba(148, 163, 184, 0.9)', // slate
              backgroundColor: 'rgba(148, 163, 184, 0.05)'
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
                color: '#0f172a',
                font: {
                  size: 11,
                  weight: '600'
                },
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
            },
            datalabels: {
              color: '#0f172a',
              anchor: 'end',
              align: 'top',
              offset: 6,
              clip: false,
              formatter(value) {
                if (!value) return '';
                return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
              },
              font: {
                size: 9,
                weight: '600'
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#64748b',
                font: { size: 10 }
              },
              grid: {
                display: false
              }
            },
            y: {
              ticks: {
                color: '#64748b',
                font: { size: 10 },
                callback(value) {
                  return value.toLocaleString('en-US', {
                    maximumFractionDigits: 0
                  });
                }
              },
              grid: {
                color: 'rgba(148, 163, 184, 0.2)'
              }
            }
          }
        }
      });
    }

    // --------- Pies (full project totals) ---------
    const { data: proj, error: pErr } = await client
      .from('projects')
      .select('contract_value, funded_value')
      .eq('id', projectId)
      .single();

    if (pErr) throw pErr;

    const { data: allRev, error: allRevErr } = await client
      .from('vw_eac_revenue_monthly')
      .select('revenue')
      .eq('project_id', projectId);

    if (allRevErr) throw allRevErr;

    const { data: allCosts, error: allCostsErr } = await client
      .from('vw_eac_monthly_pl')
      .select('labor, equip, materials, subs, fringe, overhead, gna')
      .eq('project_id', projectId);

    if (allCostsErr) throw allCostsErr;

    const funded = Number(proj?.funded_value || 0);
    const totalRevenue = (allRev || []).reduce((sum, r) => sum + Number(r.revenue || 0), 0);

    // --------- Funding vs Planned Revenue doughnut ---------
    const fundingCtx = document.getElementById('vizFundingPie');
    if (fundingCtx && window.Chart) {
      const values = [funded, totalRevenue];
      const labelsPie = ['Funded Value', 'Planned Revenue'];

      if (fundingPieChart) {
        fundingPieChart.destroy();
      }

      fundingPieChart = new Chart(fundingCtx, {
        type: 'doughnut',
        data: {
          labels: labelsPie,
          datasets: [
            {
              data: values,
              backgroundColor: [
                'rgba(37, 99, 235, 0.20)',  // light blue
                'rgba(16, 185, 129, 0.20)'  // light emerald
              ],
              borderColor: [
                'rgba(37, 99, 235, 0.7)',
                'rgba(16, 185, 129, 0.7)'
              ],
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '55%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#0f172a',
                font: { size: 11, weight: '600' }
              }
            },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const dataset = ctx.dataset.data || [];
                  const total = dataset.reduce((s, v) => s + Number(v || 0), 0);
                  const value = Number(dataset[ctx.dataIndex] || 0);
                  const pct = total ? (value / total) * 100 : 0;
                  return `${ctx.label}: ${value.toLocaleString('en-US', {
                    maximumFractionDigits: 0
                  })} (${pct.toFixed(1)}%)`;
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
                return `${value.toLocaleString('en-US', {
                  maximumFractionDigits: 0
                })}\n${pct.toFixed(1)}%`;
              },
              font: {
                size: 10,
                weight: '600'
              },
              clamp: true,
              anchor: 'center',
              align: 'center'
            }
          }
        }
      });
    }

    // --------- Cost breakdown pie ---------
    const totals = {
      labor: 0,
      subs: 0,
      equip: 0,
      materials: 0,
      fringe: 0,
      overhead: 0,
      gna: 0
    };

    (allCosts || []).forEach((r) => {
      totals.labor += Number(r.labor || 0);
      totals.subs += Number(r.subs || 0);
      totals.equip += Number(r.equip || 0);
      totals.materials += Number(r.materials || 0);
      totals.fringe += Number(r.fringe || 0);
      totals.overhead += Number(r.overhead || 0);
      totals.gna += Number(r.gna || 0);
    });

    const costLabels = ['Labor', 'Sub', 'Equipment', 'Material', 'Fringe', 'Overhead', 'G&A'];
    const costValues = [
      totals.labor,
      totals.subs,
      totals.equip,
      totals.materials,
      totals.fringe,
      totals.overhead,
      totals.gna
    ];

    const costCtx = document.getElementById('vizCostPie');
    if (costCtx && window.Chart) {
      if (costPieChart) {
        costPieChart.destroy();
      }

      costPieChart = new Chart(costCtx, {
        type: 'pie',
        data: {
          labels: costLabels,
          datasets: [
            {
              data: costValues,
              backgroundColor: [
                'rgba(37, 99, 235, 0.18)',   // blue
                'rgba(16, 185, 129, 0.18)',  // emerald
                'rgba(234, 179, 8, 0.18)',   // amber
                'rgba(59, 130, 246, 0.16)',  // light blue
                'rgba(45, 212, 191, 0.18)',  // teal
                'rgba(148, 163, 184, 0.18)', // slate
                'rgba(30, 64, 175, 0.16)'    // deep blue, very light
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
                color: '#0f172a',
                font: { size: 11, weight: '600' }
              }
            },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const dataset = ctx.dataset.data || [];
                  const total = dataset.reduce((s, v) => s + Number(v || 0), 0);
                  const value = Number(dataset[ctx.dataIndex] || 0);
                  const pct = total ? (value / total) * 100 : 0;
                  return `${ctx.label}: ${value.toLocaleString('en-US', {
                    maximumFractionDigits: 0
                  })} (${pct.toFixed(1)}%)`;
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
                return `${value.toLocaleString('en-US', {
                  maximumFractionDigits: 0
                })}\n${pct.toFixed(1)}%`;
              },
              font: {
                size: 10,
                weight: '600'
              },
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
    console.error('Visuals render error', err);
    const statusEl = $('#status');
    if (statusEl) {
      statusEl.textContent = `Visuals error: ${err.message || err}`;
    }
  }
}

function destroyCharts() {
  if (plTrendChart) { plTrendChart.destroy(); plTrendChart = null; }
  if (fundingPieChart) { fundingPieChart.destroy(); fundingPieChart = null; }
  if (costPieChart) { costPieChart.destroy(); costPieChart = null; }
}
