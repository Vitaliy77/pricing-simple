// js/tabs/pnl.js
// P&L tab: Single line per category; cell shows Actual if present, else Forecast.
// Top header band shows contiguous "Actuals" vs "Forecast" month groups.

import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';
import { loadLookups, rolesRate, employees as empLookup, equipmentList, materialsList } from '../data/lookups.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">P&L</h2>
      <button id="pnlRefresh" class="px-3 py-1.5 rounded-md border hover:bg-slate-50">Refresh</button>
    </div>
    <div id="pnlMsg" class="text-sm text-slate-500 mb-3"></div>
    <div class="overflow-x-auto">
      <table id="pnlTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>
  </div>
`;

export async function init(rootEl) {
  const pid = getProjectId();
  const msg = $('#pnlMsg');
  const btn = $('#pnlRefresh');

  if (!pid) {
    msg.textContent = 'Select or create a project to view P&L.';
    $('#pnlTable').innerHTML = '';
    return;
  }

  const yearStr = ($('#monthPicker')?.value || new Date().toISOString().slice(0,7)).slice(0,4);
  const year = Number(yearStr);

  btn.onclick = () => renderPL(pid, year);

  await loadLookups();      // for rates/catalogs used in forecast
  await renderPL(pid, year);
}

async function renderPL(projectId, year) {
  const msg = $('#pnlMsg');
  const table = $('#pnlTable');
  msg.textContent = 'Loading P&L…';

  try {
    // ---- Compute Forecast (from plans)
    const fc = await computeForecastFromPlans(projectId, year); // maps by YYYY-MM

    // ---- Actuals (tolerant)
    const act = await fetchActualsMonthly(projectId, year); // category maps

    // Months & keys
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i, 1)));
    const mKey   = d => d.toISOString().slice(0,7); // YYYY-MM
    const mKeys  = months.map(mKey);

    // Determine A/F per month (if any actual exists in that month)
    const isActual = {};
    mKeys.forEach(k => {
      const any =
        safeNum(act.rev[k])       ||
        safeNum(act.labor[k])     ||
        safeNum(act.subs[k])      ||
        safeNum(act.equip[k])     ||
        safeNum(act.materials[k]) ||
        safeNum(act.odc[k]);
      isActual[k] = any > 0;
    });

    // Build header band groups
    const bands = compressBands(mKeys, (k) => isActual[k] ? 'Actuals' : 'Forecast');

    // Build rows (choose actual if present, else forecast)
    const rows = [
      { label: 'Revenue',   getter: k => pickAF(act.rev[k],   fc.rev[k]) },
      { label: 'Labor',     getter: k => pickAF(act.labor[k], fc.labor[k]) },
      { label: 'Sub',       getter: k => pickAF(act.subs[k],  fc.subs[k]) },
      { label: 'Equipment', getter: k => pickAF(act.equip[k], fc.equip[k]) },
      { label: 'Material',  getter: k => pickAF(act.materials[k], fc.materials[k]) },
      { label: 'ODC',       getter: k => pickAF(act.odc[k],   fc.odc[k]) },
      { label: 'Profit',    getter: k => {
          const rev = pickAF(act.rev[k], fc.rev[k]);
          const cost = pickAF(act.labor[k], fc.labor[k]) +
                       pickAF(act.subs[k], fc.subs[k]) +
                       pickAF(act.equip[k], fc.equip[k]) +
                       pickAF(act.materials[k], fc.materials[k]) +
                       pickAF(act.odc[k], fc.odc[k]);
          return rev - cost;
        }},
      { label: 'Margin %',  getter: k => {
          const rev = pickAF(act.rev[k], fc.rev[k]);
          const cost = pickAF(act.labor[k], fc.labor[k]) +
                       pickAF(act.subs[k], fc.subs[k]) +
                       pickAF(act.equip[k], fc.equip[k]) +
                       pickAF(act.materials[k], fc.materials[k]) +
                       pickAF(act.odc[k], fc.odc[k]);
          if (rev === 0 && cost === 0) return null;
          return rev ? ((rev - cost) / rev * 100) : (cost ? -100 : 0);
        }, isPercent: true },
    ];

    // Render table with header band
    let html = '<thead>';

    // Band row
    html += '<tr>';
    html += `<th class="p-2 text-left sticky left-0 bg-white"></th>`; // empty corner
    bands.forEach(b => {
      html += `<th class="p-2 text-center text-xs uppercase tracking-wide bg-slate-50 border rounded ${b.label==='Actuals' ? 'text-green-700' : 'text-blue-700'}" colspan="${b.span}">${b.label}</th>`;
    });
    html += `<th class="p-2 text-right"></th>`; // year total column header (blank)
    html += '</tr>';

    // Month names row
    html += '<tr>';
    html += '<th class="p-2 text-left sticky left-0 bg-white">Category</th>';
    mKeys.forEach((k,i) => {
      html += `<th class="p-2 text-right">${months[i].toLocaleString('en-US',{month:'short', timeZone:'UTC'})}</th>`;
    });
    html += '<th class="p-2 text-right">Year Total</th>';
    html += '</tr>';

    html += '</thead><tbody>';

    rows.forEach(row => {
      html += `<tr>`;
      html += `<td class="p-2 font-medium sticky left-0 bg-white">${row.label}</td>`;
      let yearTotal = 0;

      mKeys.forEach(k => {
        const v = row.getter(k);
        if (row.isPercent) {
          html += `<td class="p-2 text-right">${v==null ? '—' : v.toFixed(1) + '%'}</td>`;
        } else {
          yearTotal += Number(v || 0);
          html += `<td class="p-2 text-right">${fmtUSD0(v || 0)}</td>`;
        }
      });

      if (row.isPercent) {
        // Compute full-year margin
        const yRev = sumBy(mKeys, kk => pickAF(act.rev[kk], fc.rev[kk]));
        const yCost = sumBy(mKeys, kk =>
          pickAF(act.labor[kk], fc.labor[kk]) +
          pickAF(act.subs[kk], fc.subs[kk]) +
          pickAF(act.equip[kk], fc.equip[kk]) +
          pickAF(act.materials[kk], fc.materials[kk]) +
          pickAF(act.odc[kk], fc.odc[kk])
        );
        const mtot = (yRev===0 && yCost===0) ? null : (yRev ? ((yRev - yCost)/yRev*100) : (yCost? -100 : 0));
        html += `<td class="p-2 text-right font-semibold">${mtot==null ? '—' : mtot.toFixed(1) + '%'}</td>`;
      } else {
        html += `<td class="p-2 text-right font-semibold">${fmtUSD0(yearTotal)}</td>`;
      }

      html += `</tr>`;
    });

    html += '</tbody>';
    table.innerHTML = html;
    msg.textContent = '';
  } catch (err) {
    console.error('P&L error', err);
    table.innerHTML = `<tbody><tr><td class="p-3 text-red-600">P&L error: ${err?.message || err}</td></tr></tbody>`;
    msg.textContent = '';
  }
}

/* ---------------- Forecast & Actuals ---------------- */

async function computeForecastFromPlans(projectId, year) {
  // project revenue policy
  const { data: proj, error: pErr } = await client
    .from('projects')
    .select('revenue_formula, fee_pct')
    .eq('id', projectId)
    .single();
  if (pErr) throw pErr;
  const formula = proj?.revenue_formula || 'TM';
  const feePct = Number(proj?.fee_pct || 0);

  // load plans (tolerant)
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

  // lookups
  const empById = {};
  (empLookup || []).forEach(e => { if (e?.id) empById[e.id] = e; });

  const eqMeta = {};
  (equipmentList || []).forEach(e => {
    const t = e.equip_type ?? e.name;
    if (t) eqMeta[t] = { rate: Number(e.rate||0), unit: e.rate_unit || 'hour' };
  });

  const matMeta = {};
  (materialsList || []).forEach(m => {
    if (m?.sku) matMeta[m.sku] = {
      unit_cost: Number(m.unit_cost || 0),
      waste_pct: Number(m.waste_pct || 0)
    };
  });

  // month maps
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);
  const emptyMap = () => Object.fromEntries(months.map(mm => [mm, 0]));
  const labor = emptyMap(), subsM = emptyMap(), equip = emptyMap(), materials = emptyMap(), odcM = emptyMap();

  const kOf = ym => (typeof ym === 'string') ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7);

  // labor cost
  planLabor.forEach(r => {
    const mm = kOf(r.ym); if (!mm) return;
    const emp = empById[r.employee_id] || {};
    const rate = Number(rolesRate[emp.role || ''] || 0);
    labor[mm] += Number(r.hours || 0) * rate;
  });

  // subs cost
  planSubs.forEach(r => {
    const mm = kOf(r.ym); if (!mm) return;
    subsM[mm] += Number(r.cost || 0);
  });

  // equipment cost
  planEqp.forEach(r => {
    const mm = kOf(r.ym); if (!mm) return;
    const meta = eqMeta[r.equipment_type] || { rate: 0 };
    equip[mm] += Number(r.hours || 0) * Number(meta.rate || 0);
  });

  // materials cost
  planMat.forEach(r => {
    const mm = kOf(r.ym); if (!mm) return;
    const m = matMeta[r.sku] || { unit_cost: 0, waste_pct: 0 };
    const unitLoaded = Number(m.unit_cost || 0) * (1 + Number(m.waste_pct || 0));
    materials[mm] += Number(r.qty || 0) * unitLoaded;
  });

  // odc cost
  planODC.forEach(r => {
    const mm = kOf(r.ym); if (!mm) return;
    odcM[mm] += Number(r.cost || 0);
  });

  // revenue from cost (one map)
  const rev = emptyMap();
  months.forEach(mm => {
    const C = labor[mm] + subsM[mm] + equip[mm] + materials[mm] + odcM[mm];
    rev[mm] = (formula === 'COST_PLUS') ? C * (1 + (Number(proj?.fee_pct || 0) / 100)) : C; // TM/FP placeholder
  });

  return {
    rev,
    labor,
    subs: subsM,
    equip,
    materials,
    odc: odcM
  };
}

async function fetchActualsMonthly(projectId, year) {
  // tolerant (table may not exist)
  let rows = [];
  try {
    const res = await client
      .from('actuals_monthly')
      .select('ym, category, amount')
      .eq('project_id', projectId);
    if (res.error) throw res.error;
    rows = (res.data || []);
  } catch (e) {
    console.warn('actuals_monthly fetch skipped:', e?.message || e);
    rows = [];
  }
  const inYear = r => (r?.ym && (typeof r.ym === 'string' ? r.ym.slice(0,4) : new Date(r.ym).getUTCFullYear().toString()) === String(year));

  const byMonth = (cats) => new Proxy({}, {
    get: (obj, k) => (k in obj ? obj[k] : 0),
    set: (obj, k, v) => (obj[k] = v, true)
  });

  const maps = {
    rev:       byMonth(),
    labor:     byMonth(),
    subs:      byMonth(),
    equip:     byMonth(),
    materials: byMonth(),
    odc:       byMonth()
  };

  rows.filter(inYear).forEach(r => {
    const k = keyOf(r.ym); if (!k) return;
    const c = String(r.category || '').toLowerCase();
    const v = Number(r.amount || 0);
    if (c === 'revenue') maps.rev[k]       = (maps.rev[k] || 0) + v;
    else if (c === 'labor') maps.labor[k]  = (maps.labor[k] || 0) + v;
    else if (c === 'subs' || c === 'subcontractors' || c === 'sub') maps.subs[k] = (maps.subs[k] || 0) + v;
    else if (c === 'equipment') maps.equip[k]   = (maps.equip[k] || 0) + v;
    else if (c === 'materials' || c === 'material') maps.materials[k] = (maps.materials[k] || 0) + v;
    else if (c === 'odc' || c === 'other' || c === 'other direct cost') maps.odc[k] = (maps.odc[k] || 0) + v;
    else {
      // treat any other category as cost bucket (fold into ODC if you want)
      maps.odc[k] = (maps.odc[k] || 0) + v;
    }
  });

  return maps;
}

/* ---------------- helpers ---------------- */

function pickAF(actual, forecast) {
  const a = Number(actual || 0);
  const f = Number(forecast || 0);
  // If there is any actual value for the month, prefer it; else forecast.
  return a !== 0 ? a : f;
}

function compressBands(keys, labelFn) {
  const out = [];
  let cur = null;
  keys.forEach((k, idx) => {
    const lbl = labelFn(k);
    if (!cur) cur = { label: lbl, span: 1 };
    else if (cur.label === lbl) cur.span += 1;
    else { out.push(cur); cur = { label: lbl, span: 1 }; }
    if (idx === keys.length - 1 && cur) out.push(cur);
  });
  return out;
}

function sumBy(arr, fn) {
  return arr.reduce((s, x) => s + Number(fn(x) || 0), 0);
}

function keyOf(ym) {
  try { return (typeof ym === 'string') ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7); }
  catch { return null; }
}
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtUSD0(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
