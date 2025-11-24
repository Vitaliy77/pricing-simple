// js/tabs/visuals.js
// Visual aids: P&L trend line + funding vs planned revenue + cost breakdown pies + benchmark bands.

import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';
import { loadLookups, rolesRate, employees as empLookup, equipmentList, materialsList } from '../data/lookups.js';

let plTrendChart = null;
let fundingPieChart = null;
let costPieChart = null;
let bmBandChart = null;

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

      <!-- MIDDLE: P&L trend -->
      <div>
        <h3 class="text-sm font-semibold mb-2">P&amp;L Trend (selected year)</h3>
        <div class="h-64">
          <canvas id="vizTrendChart"></canvas>
        </div>
      </div>

      <!-- BOTTOM: Benchmark bands -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-sm font-semibold">Benchmark Bands (annual)</h3>
          <p class="text-[0.70rem] text-slate-500">
            Shaded band = P25–P75, ● = P50, ◆ = project.
          </p>
        </div>
        <div class="h-80">
          <canvas id="vizBenchmarkBands"></canvas>
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
    destroyCharts();
    status.textContent = 'Select a project to view visuals.';
    return;
  }

  try {
    status.textContent = 'Loading visuals…';

    const year = Number($('#vizYearSelect')?.value || 2025);
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;

    // Ensure lookups are loaded for benchmark math
    await loadLookups();

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
      .select('contract_value, funded_value, project_type_id')
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

    // --------- Benchmark band chart (annual) ---------
    await renderBenchmarkBands(projectId, proj?.project_type_id, year);

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
  if (bmBandChart) { bmBandChart.destroy(); bmBandChart = null; }
}

/* ------------ Benchmark band chart helpers (adapted from benchmarks.js) ------------ */

async function renderBenchmarkBands(projectId, projectTypeId, year) {
  const ctx = document.getElementById('vizBenchmarkBands');
  if (!ctx || !window.Chart) return;

  if (!projectId || !projectTypeId) {
    if (bmBandChart) {
      bmBandChart.destroy();
      bmBandChart = null;
    }
    return;
  }

  try {
    // Annual project metrics using Actuals/Forecast blend
    const { rev, labor$, subs$, equip$, materials$, odc$, laborHrs } =
      await computeAFMaps(projectId, year);

    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const sum = (m) => months.reduce((s, k) => s + Number(m[k] || 0), 0);

    const revY   = sum(rev);
    const laborY = sum(labor$);
    const subsY  = sum(subs$);
    const equipY = sum(equip$);
    const matsY  = sum(materials$);
    const odcY   = sum(odc$);
    const costY  = laborY + subsY + equipY + matsY + odcY;
    const margin = (revY === 0 && costY === 0)
      ? null
      : (revY ? ((revY - costY) / revY * 100) : (costY ? -100 : 0));

    const hrsY   = sum(laborHrs);
    const revPerHr  = hrsY ? (revY / hrsY) : null;
    const costPerHr = hrsY ? (laborY / hrsY) : null;

    // Benchmarks table for this project type (annual)
    const { data: bmData, error: bmErr } = await client
      .from('benchmarks')
      .select('metric, period, p25, p50, p75, n')
      .eq('project_type_id', projectTypeId)
      .eq('period', 'annual');

    if (bmErr) throw bmErr;

    const bmMap = {};
    (bmData || []).forEach((r) => {
      bmMap[r.metric] = r;
    });

    // Build comparison rows (same metrics as Benchmarks tab; we only chart the % ones)
    const allRows = [
      makeMetricRow('Margin %',           margin, '%', 'margin_pct',          +1, bmMap),
      makeMetricRow('Labor % of Rev',     pct(marginSafe(laborY), marginSafe(revY)), '%', 'labor_pct_rev',       -1, bmMap),
      makeMetricRow('Subs % of Rev',      pct(marginSafe(subsY),  marginSafe(revY)), '%', 'subs_pct_rev',        -1, bmMap),
      makeMetricRow('Equip % of Rev',     pct(marginSafe(equipY), marginSafe(revY)), '%', 'equip_pct_rev',       -1, bmMap),
      makeMetricRow('Materials % of Rev', pct(marginSafe(matsY),  marginSafe(revY)), '%', 'materials_pct_rev',   -1, bmMap),
      makeMetricRow('ODC % of Rev',       pct(marginSafe(odcY),   marginSafe(revY)), '%', 'odc_pct_rev',         -1, bmMap),

      makeMetricRow('Revenue per Labor Hr', revPerHr, '$', 'rev_per_labor_hr',  +1, bmMap),
      makeMetricRow('Labor $ per Labor Hr', costPerHr,'$', 'labor_cost_per_hr', -1, bmMap),

      makeMetricRow('Revenue (Annual)', revY, '$', 'revenue_annual', +1, bmMap),
      makeMetricRow('Cost (Annual)',    costY,'$', 'cost_annual',    -1, bmMap),
      makeMetricRow('Profit (Annual)',  revY - costY,'$', 'profit_annual', +1, bmMap),
    ];

    // For this chart, use only % metrics so the scale stays readable
    const rows = allRows.filter((r) =>
      r &&
      r.unit === '%' &&
      Number.isFinite(r.value) &&
      Number.isFinite(r.p25) &&
      Number.isFinite(r.p50) &&
      Number.isFinite(r.p75)
    );

    if (!rows.length) {
      if (bmBandChart) {
        bmBandChart.destroy();
        bmBandChart = null;
      }
      return;
    }

    const labels = rows.map((r) => r.label);
    const bandData = rows.map((r) => [r.p25, r.p75]);
    const p50Data = rows.map((r) => ({ x: r.p50, y: r.label }));
    const projData = rows.map((r) => ({ x: r.value, y: r.label }));

    if (bmBandChart) {
      bmBandChart.destroy();
    }

    bmBandChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Benchmark band (P25–P75)',
            data: bandData,         // floating bar: [min, max]
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
            borderColor: 'rgba(37, 99, 235, 0.7)',
            borderWidth: 1,
            borderSkipped: false
          },
          {
            type: 'line',
            label: 'P50 (median)',
            data: p50Data,
            showLine: false,
            pointRadius: 4,
            pointBackgroundColor: 'rgba(30, 64, 175, 1)',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5
          },
          {
            type: 'line',
            label: 'Project',
            data: projData,
            showLine: false,
            pointRadius: 4,
            pointStyle: 'diamond',
            pointBackgroundColor: 'rgba(16, 185, 129, 1)',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
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
                const label = ctx.dataset.label || '';
                const raw = ctx.raw;

                if (Array.isArray(raw)) {
                  const [min, max] = raw;
                  return `${label}: ${min.toFixed(1)}% – ${max.toFixed(1)}%`;
                }

                let v = raw;
                if (raw && typeof raw === 'object' && 'x' in raw) {
                  v = raw.x;
                }
                return `${label}: ${Number(v || 0).toFixed(1)}%`;
              }
            }
          },
          datalabels: {
            display: false
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#64748b',
              font: { size: 10 },
              callback(value) {
                return Number(value).toFixed(0) + '%';
              }
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.2)'
            }
          },
          y: {
            ticks: {
              color: '#64748b',
              font: { size: 10 }
            },
            grid: {
              display: false
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Benchmark bands render error', err);
    if (bmBandChart) {
      bmBandChart.destroy();
      bmBandChart = null;
    }
  }
}

// Safe helpers to avoid infinities in pct calc
function marginSafe(v) {
  return Number.isFinite(v) ? v : 0;
}

function pct(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole)) return null;
  if (part === 0 && whole === 0) return null;
  return whole ? (part / whole * 100) : (part ? (part > 0 ? +Infinity : -Infinity) : 0);
}

function makeMetricRow(label, value, unit, metricKey, betterDir, bmMap) {
  const bm = bmMap[metricKey];
  if (!bm) return { label, value, unit, p25: NaN, p50: NaN, p75: NaN, n: null };

  const p50 = Number(bm?.p50 ?? NaN);
  const p25 = Number(bm?.p25 ?? NaN);
  const p75 = Number(bm?.p75 ?? NaN);
  const n   = Number.isFinite(Number(bm?.n)) ? Number(bm?.n) : null;

  // We keep only numeric parts needed for chart; delta is not used here
  return { label, value, unit, p25, p50, p75, n, betterDir };
}

/* ---------------- AF computation (Actuals when present; else Forecast) ---------------- */

async function computeAFMaps(projectId, year) {
  const fc = await computeForecastFromPlans(projectId, year);
  const act = await fetchActualsMonthly(projectId, year);

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const useActual = {};
  months.forEach((mm) => {
    const any = (act.rev[mm] || 0) || (act.labor$[mm] || 0) || (act.subs$[mm] || 0) ||
                (act.equip$[mm] || 0) || (act.materials$[mm] || 0) || (act.odc$[mm] || 0);
    useActual[mm] = Number(any) !== 0;
  });

  const pick = (aMap, fMap) =>
    Object.fromEntries(months.map((mm) => [mm, useActual[mm] ? (aMap[mm] || 0) : (fMap[mm] || 0)]));

  return {
    rev:        pick(act.rev,        fc.rev),
    labor$:     pick(act.labor$,     fc.labor$),
    subs$:      pick(act.subs$,      fc.subs$),
    equip$:     pick(act.equip$,     fc.equip$),
    materials$: pick(act.materials$, fc.materials$),
    odc$:       pick(act.odc$,       fc.odc$),
    laborHrs:   fc.laborHrs
  };
}

async function computeForecastFromPlans(projectId, year) {
  const { data: proj, error: pErr } = await client
    .from('projects')
    .select('revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (pErr) throw pErr;

  const formula = proj?.revenue_formula || 'TM';
  const feePct = Number(proj?.fee_pct || 0);

  const [lab, subs, eqp, mats, odc] = await Promise.all([
    client.from('plan_labor').select('employee_id, ym, hours').eq('project_id', projectId),
    client.from('plan_subs').select('ym, cost').eq('project_id', projectId),
    client.from('plan_equipment').select('equipment_type, ym, hours').eq('project_id', projectId),
    client.from('plan_materials').select('sku, ym, qty').eq('project_id', projectId),
    client.from('plan_odc').select('odc_type, ym, cost').eq('project_id', projectId)
  ]);

  const inYear = (r) =>
    (r?.ym &&
      (typeof r.ym === 'string'
        ? r.ym.slice(0, 4)
        : new Date(r.ym).getUTCFullYear().toString()) === String(year));

  const planLabor = (lab.error ? [] : (lab.data || [])).filter(inYear);
  const planSubs  = (subs.error ? [] : (subs.data || [])).filter(inYear);
  const planEqp   = (eqp.error ? [] : (eqp.data || [])).filter(inYear);
  const planMat   = (mats.error ? [] : (mats.data || [])).filter(inYear);
  const planODC   = (odc.error ? [] : (odc.data || [])).filter(inYear);

  const empById = {};
  (empLookup || []).forEach((e) => {
    if (e?.id) empById[e.id] = e;
  });

  const eqMeta = {};
  (equipmentList || []).forEach((e) => {
    const t = e.equip_type ?? e.name;
    if (t) eqMeta[t] = { rate: Number(e.rate || 0) };
  });

  const matMeta = {};
  (materialsList || []).forEach((m) => {
    if (m?.sku) {
      matMeta[m.sku] = {
        unit_cost: Number(m.unit_cost || 0),
        waste_pct: Number(m.waste_pct || 0)
      };
    }
  });

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const m = () => Object.fromEntries(months.map((mm) => [mm, 0]));
  const labor$ = m(), subs$ = m(), equip$ = m(), materials$ = m(), odc$ = m(), laborHrs = m();

  const k = (ym) =>
    (typeof ym === 'string') ? ym.slice(0, 7) : new Date(ym).toISOString().slice(0, 7);

  // Labor
  planLabor.forEach((r) => {
    const mm = k(r.ym);
    if (!mm) return;
    const emp = empById[r.employee_id] || {};
    const rate = Number(rolesRate[emp.role || ''] || 0);
    const hrs  = Number(r.hours || 0);
    laborHrs[mm] += hrs;
    labor$[mm]   += hrs * rate;
  });

  // Subs
  planSubs.forEach((r) => {
    const mm = k(r.ym);
    if (mm) subs$[mm] += Number(r.cost || 0);
  });

  // Equipment
  planEqp.forEach((r) => {
    const mm = k(r.ym);
    if (!mm) return;
    const meta = eqMeta[r.equipment_type] || { rate: 0 };
    equip$[mm] += Number(r.hours || 0) * Number(meta.rate || 0);
  });

  // Materials
  planMat.forEach((r) => {
    const mm = k(r.ym);
    if (!mm) return;
    const meta = matMeta[r.sku] || { unit_cost: 0, waste_pct: 0 };
    const loaded = Number(meta.unit_cost || 0) * (1 + Number(meta.waste_pct || 0));
    materials$[mm] += Number(r.qty || 0) * loaded;
  });

  // ODC
  planODC.forEach((r) => {
    const mm = k(r.ym);
    if (mm) odc$[mm] += Number(r.cost || 0);
  });

  // Revenue from cost (COST_PLUS applies fee)
  const rev = m();
  months.forEach((mm) => {
    const C = labor$[mm] + subs$[mm] + equip$[mm] + materials$[mm] + odc$[mm];
    rev[mm] = (formula === 'COST_PLUS') ? C * (1 + (feePct / 100)) : C;
  });

  return { rev, labor$, subs$, equip$, materials$, odc$, laborHrs };
}

async function fetchActualsMonthly(projectId, year) {
  let rows = [];
  try {
    const res = await client
      .from('actuals_monthly')
      .select('ym, category, amount')
      .eq('project_id', projectId);
    if (res.error) throw res.error;
    rows = res.data || [];
  } catch {
    rows = [];
  }

  const inYear = (r) =>
    (r?.ym &&
      (typeof r.ym === 'string'
        ? r.ym.slice(0, 4)
        : new Date(r.ym).getUTCFullYear().toString()) === String(year));

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const m = () => Object.fromEntries(months.map((mm) => [mm, 0]));
  const maps = { rev: m(), labor$: m(), subs$: m(), equip$: m(), materials$: m(), odc$: m() };

  rows.filter(inYear).forEach((r) => {
    const mm =
      (typeof r.ym === 'string') ? r.ym.slice(0, 7) : new Date(r.ym).toISOString().slice(0, 7);
    const v = Number(r.amount || 0);
    const c = String(r.category || '').toLowerCase();
    if      (c === 'revenue')                            maps.rev[mm]        += v;
    else if (c === 'labor')                              maps.labor$[mm]     += v;
    else if (c === 'subs' || c === 'subcontractors' || c === 'sub') maps.subs$[mm] += v;
    else if (c === 'equipment')                          maps.equip$[mm]     += v;
    else if (c === 'materials' || c === 'material')      maps.materials$[mm] += v;
    else if (c === 'odc' || c === 'other' || c === 'other direct cost') maps.odc$[mm] += v;
    else                                                 maps.odc$[mm]       += v;
  });

  return maps;
}
