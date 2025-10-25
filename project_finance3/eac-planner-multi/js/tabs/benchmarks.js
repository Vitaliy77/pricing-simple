// js/tabs/benchmarks.js
// Benchmarks tab: compares this project's Actual/Forecast metrics vs benchmark P50 (and P25/P75 when present)

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { loadLookups, rolesRate, employees as empLookup, equipmentList, materialsList } from '../data/lookups.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">Benchmarks</h2>
      <button id="bmRefresh" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">Refresh</button>
    </div>

    <div id="bmMsg" class="text-sm text-slate-500 mb-3"></div>

    <div class="bg-slate-50 rounded-lg p-3 text-xs mb-4">
      <div class="flex flex-wrap gap-4">
        <div><span class="inline-block w-3 h-3 bg-green-600 align-middle mr-2"></span>Actuals</div>
        <div><span class="inline-block w-3 h-3 bg-blue-600 align-middle mr-2"></span>Forecast</div>
      </div>
      <div class="mt-2 text-slate-600">
        Per month the app uses <strong>Actuals</strong> when present; otherwise it uses <strong>Forecast</strong>.
        Annual metrics aggregate those blended monthly values.
      </div>
    </div>

    <div class="overflow-x-auto">
      <table id="bmTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>
  </div>
`;

export async function init(rootEl) {
  const pid = getProjectId();
  const msg = $('#bmMsg');
  const btn = $('#bmRefresh');
  const yearStr = ($('#monthPicker')?.value || new Date().toISOString().slice(0,7)).slice(0,4);
  const year = Number(yearStr);

  if (!pid) {
    msg.textContent = 'Select or create a project first.';
    $('#bmTable').innerHTML = '';
    return;
  }

  btn.onclick = () => render(pid, year);

  await loadLookups(); // for rates/catalogs used in forecast computation
  await render(pid, year);
}

async function render(projectId, year) {
  const msg = $('#bmMsg');
  const table = $('#bmTable');
  msg.textContent = 'Computing…';

  try {
    // 1) Project meta (to identify project_type_id)
    const { data: proj, error: pErr } = await client
      .from('projects')
      .select('id, name, project_type_id')
      .eq('id', projectId)
      .single();
    if (pErr) throw pErr;

    // 2) Build AF maps (Actuals when present, else Forecast from plans)
    const { rev, labor$, subs$, equip$, materials$, odc$, laborHrs } =
      await computeAFMaps(projectId, year);

    // 3) Aggregate annual values
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);
    const sum = m => months.reduce((s,k)=> s + Number(m[k] || 0), 0);

    const revY   = sum(rev);
    const laborY = sum(labor$);
    const subsY  = sum(subs$);
    const equipY = sum(equip$);
    const matsY  = sum(materials$);
    const odcY   = sum(odc$);
    const costY  = laborY + subsY + equipY + matsY + odcY;
    const profY  = revY - costY;
    const margin = (revY === 0 && costY === 0) ? null : (revY ? ((revY - costY) / revY * 100) : (costY ? -100 : 0));

    const hrsY   = sum(laborHrs);
    const revPerHr  = hrsY ? (revY / hrsY) : null;
    const costPerHr = hrsY ? (laborY / hrsY) : null;

    // 4) Fetch benchmarks for this project type (annual)
    let bm = [];
    if (proj?.project_type_id) {
      const { data, error } = await client
        .from('benchmarks')
        .select('metric, period, p25, p50, p75, n')
        .eq('project_type_id', proj.project_type_id)
        .eq('period', 'annual');
      if (error) throw error;
      bm = data || [];
    }

    // helper to read benchmark P-values
    const bmMap = {};
    bm.forEach(r => bmMap[r.metric] = r);

    // 5) Compose the comparison rows
    const rows = [
      // label, value, unit, metric key, “better when” (+1 higher is better / -1 lower is better)
      rowDelta('Margin %',     margin, '%',               'margin_pct',          +1, bmMap),
      rowDelta('Labor % of Rev', pct(laborY, revY), '%', 'labor_pct_rev',       -1, bmMap),
      rowDelta('Subs % of Rev',  pct(subsY,  revY), '%', 'subs_pct_rev',        -1, bmMap),
      rowDelta('Equip % of Rev', pct(equipY, revY), '%', 'equip_pct_rev',       -1, bmMap),
      rowDelta('Materials % of Rev', pct(matsY, revY), '%','materials_pct_rev', -1, bmMap),
      rowDelta('ODC % of Rev',  pct(odcY,   revY), '%',  'odc_pct_rev',         -1, bmMap),

      rowDelta('Revenue per Labor Hr',  revPerHr,  '$', 'rev_per_labor_hr',     +1, bmMap),
      rowDelta('Labor $ per Labor Hr',  costPerHr, '$', 'labor_cost_per_hr',    -1, bmMap),

      // show absolute dollars too (optional)
      rowDelta('Revenue (Annual)', revY, '$', 'revenue_annual', +1, bmMap),
      rowDelta('Cost (Annual)',    costY,'$', 'cost_annual',    -1, bmMap),
      rowDelta('Profit (Annual)',  profY,'$', 'profit_annual',  +1, bmMap),
    ];

    // 6) Render
    let html = '<thead>';
    html += `
      <tr>
        <th class="p-2 text-left sticky left-0 bg-white">Metric</th>
        <th class="p-2 text-right">Project</th>
        <th class="p-2 text-right">P50</th>
        <th class="p-2 text-right">Δ vs P50</th>
        <th class="p-2 text-right">Band (P25–P75)</th>
        <th class="p-2 text-right">N</th>
      </tr>`;
    html += '</thead><tbody>';

    rows.forEach(r => {
      html += `<tr>
        <td class="p-2 sticky left-0 bg-white">${r.label}</td>
        <td class="p-2 text-right">${fmtVal(r.value, r.unit)}</td>
        <td class="p-2 text-right">${fmtVal(r.p50, r.unit)}</td>
        <td class="p-2 text-right ${r.deltaClass}">${r.deltaText}</td>
        <td class="p-2 text-right">${r.bandText}</td>
        <td class="p-2 text-right">${r.n ?? '—'}</td>
      </tr>`;
    });

    html += '</tbody>';
    table.innerHTML = html;
    msg.textContent = proj?.project_type_id ? '' : 'Tip: set a Project Type to enable benchmarks.';
  } catch (err) {
    console.error('Benchmarks error', err);
    table.innerHTML = `<tbody><tr><td class="p-3 text-red-600">Benchmarks error: ${err?.message || err}</td></tr></tbody>`;
    msg.textContent = '';
  }
}

/* ---------------- AF computation (Actuals when present; else Forecast) ---------------- */

async function computeAFMaps(projectId, year) {
  // Forecast (from plans)
  const fc = await computeForecastFromPlans(projectId, year);

  // Actuals (tolerant; may be empty)
  const act = await fetchActualsMonthly(projectId, year);

  // AF selector (per month)
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);
  const useActual = {};
  months.forEach(mm => {
    const any = (act.rev[mm]||0) || (act.labor$[mm]||0) || (act.subs$[mm]||0) ||
                (act.equip$[mm]||0) || (act.materials$[mm]||0) || (act.odc$[mm]||0);
    useActual[mm] = Number(any) !== 0;
  });

  // Build AF maps
  const pick = (aMap, fMap) => Object.fromEntries(months.map(mm => [mm, useActual[mm] ? (aMap[mm]||0) : (fMap[mm]||0)]));

  return {
    rev:        pick(act.rev,        fc.rev),
    labor$:     pick(act.labor$,     fc.labor$),
    subs$:      pick(act.subs$,      fc.subs$),
    equip$:     pick(act.equip$,     fc.equip$),
    materials$: pick(act.materials$, fc.materials$),
    odc$:       pick(act.odc$,       fc.odc$),

    // Hours: we typically don’t have actual hours; use plan hours (fc.laborHrs)
    laborHrs:   fc.laborHrs
  };
}

async function computeForecastFromPlans(projectId, year) {
  // Project revenue policy
  const { data: proj, error: pErr } = await client
    .from('projects')
    .select('revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (pErr) throw pErr;
  const formula = proj?.revenue_formula || 'TM';
  const feePct = Number(proj?.fee_pct || 0);

  // Fetch plan tables (tolerant)
  const [lab, subs, eqp, mats, odc] = await Promise.all([
    client.from('plan_labor').select('employee_id, ym, hours').eq('project_id', projectId),
    client.from('plan_subs').select('ym, cost').eq('project_id', projectId),
    client.from('plan_equipment').select('equipment_type, ym, hours').eq('project_id', projectId),
    client.from('plan_materials').select('sku, ym, qty').eq('project_id', projectId),
    client.from('plan_odc').select('odc_type, ym, cost').eq('project_id', projectId),
  ]);

  const inYear = r => (r?.ym && (typeof r.ym === 'string' ? r.ym.slice(0,4) : new Date(r.ym).getUTCFullYear().toString()) === String(year));
  const planLabor = (lab.error ? [] : (lab.data || [])).filter(inYear);
  const planSubs  = (subs.error ? [] : (subs.data||[])).filter(inYear);
  const planEqp   = (eqp.error ? [] : (eqp.data || [])).filter(inYear);
  const planMat   = (mats.error? [] : (mats.data||[])).filter(inYear);
  const planODC   = (odc.error ? [] : (odc.data || [])).filter(inYear);

  // Lookups for cost math
  const empById = {}; (empLookup || []).forEach(e => { if (e?.id) empById[e.id] = e; });
  const eqMeta = {}; (equipmentList || []).forEach(e => { const t = e.equip_type ?? e.name; if (t) eqMeta[t] = { rate: Number(e.rate||0) }; });
  const matMeta = {}; (materialsList || []).forEach(m => { if (m?.sku) matMeta[m.sku] = { unit_cost: Number(m.unit_cost||0), waste_pct: Number(m.waste_pct||0) }; });

  // Init monthly maps
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);
  const m = () => Object.fromEntries(months.map(mm => [mm, 0]));
  const labor$ = m(), subs$ = m(), equip$ = m(), materials$ = m(), odc$ = m(), laborHrs = m();

  const k = ym => (typeof ym === 'string') ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7);

  // Labor
  planLabor.forEach(r => {
    const mm = k(r.ym); if (!mm) return;
    const emp = empById[r.employee_id] || {};
    const rate = Number(rolesRate[emp.role || ''] || 0);
    const hrs  = Number(r.hours || 0);
    laborHrs[mm] += hrs;
    labor$[mm]   += hrs * rate;
  });

  // Subs
  planSubs.forEach(r => { const mm = k(r.ym); if (mm) subs$[mm] += Number(r.cost || 0); });

  // Equipment
  planEqp.forEach(r => {
    const mm = k(r.ym); if (!mm) return;
    const meta = eqMeta[r.equipment_type] || { rate: 0 };
    equip$[mm] += Number(r.hours || 0) * Number(meta.rate || 0);
  });

  // Materials
  planMat.forEach(r => {
    const mm = k(r.ym); if (!mm) return;
    const meta = matMeta[r.sku] || { unit_cost: 0, waste_pct: 0 };
    const loaded = Number(meta.unit_cost || 0) * (1 + Number(meta.waste_pct || 0));
    materials$[mm] += Number(r.qty || 0) * loaded;
  });

  // ODC
  planODC.forEach(r => { const mm = k(r.ym); if (mm) odc$[mm] += Number(r.cost || 0); });

  // Revenue from cost (COST_PLUS applies fee)
  const rev = m();
  months.forEach(mm => {
    const C = labor$[mm] + subs$[mm] + equip$[mm] + materials$[mm] + odc$[mm];
    rev[mm] = (formula === 'COST_PLUS') ? C * (1 + (feePct / 100)) : C; // TM/FP placeholder
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
  } catch { rows = []; }

  const inYear = r => (r?.ym && (typeof r.ym === 'string' ? r.ym.slice(0,4) : new Date(r.ym).getUTCFullYear().toString()) === String(year));
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);
  const m = () => Object.fromEntries(months.map(mm => [mm, 0]));
  const maps = { rev: m(), labor$: m(), subs$: m(), equip$: m(), materials$: m(), odc$: m() };

  rows.filter(inYear).forEach(r => {
    const mm = (typeof r.ym === 'string') ? r.ym.slice(0,7) : new Date(r.ym).toISOString().slice(0,7);
    const v = Number(r.amount || 0);
    const c = String(r.category || '').toLowerCase();
    if      (c === 'revenue')         maps.rev[mm]        += v;
    else if (c === 'labor')           maps.labor$[mm]     += v;
    else if (c === 'subs' || c==='subcontractors'||c==='sub') maps.subs$[mm] += v;
    else if (c === 'equipment')       maps.equip$[mm]     += v;
    else if (c === 'materials'||c==='material') maps.materials$[mm] += v;
    else if (c === 'odc'||c==='other'||c==='other direct cost') maps.odc$[mm] += v;
    else maps.odc$[mm] += v;
  });
  return maps;
}

/* ---------------- small helpers ---------------- */

function pct(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole)) return null;
  if (part === 0 && whole === 0) return null;
  return whole ? (part / whole * 100) : (part ? (part > 0 ? +Infinity : -Infinity) : 0);
}

function rowDelta(label, value, unit, metricKey, betterDir, bmMap) {
  const bm = bmMap[metricKey];
  const p50 = Number(bm?.p50 ?? NaN);
  const p25 = Number(bm?.p25 ?? NaN);
  const p75 = Number(bm?.p75 ?? NaN);
  const n   = Number.isFinite(Number(bm?.n)) ? Number(bm?.n) : null;

  let deltaText = '—', deltaClass = '';
  if (Number.isFinite(value) && Number.isFinite(p50) && p50 !== 0) {
    const deltaPct = ((value - p50) / Math.abs(p50)) * 100;
    const dirGood  = (betterDir === +1) ? (deltaPct >= 0) : (deltaPct <= 0);
    deltaText  = (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1) + '%';
    deltaClass = dirGood ? 'text-emerald-600' : 'text-rose-600';
  }

  const bandText = (Number.isFinite(p25) && Number.isFinite(p75))
    ? `${fmtVal(p25, unit)} → ${fmtVal(p75, unit)}`
    : '—';

  return { label, value, unit, p50, deltaText, deltaClass, bandText, n };
}

function fmtVal(v, unit) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (unit === '%') return v.toFixed(1) + '%';
  if (unit === '$') return fmtUSD0(v);
  return String(v);
}

function fmtUSD0(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
