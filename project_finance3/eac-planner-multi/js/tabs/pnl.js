// js/tabs/pnl.js
// P&L tab: Actuals vs Forecast by month (with year total)

import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';
import { loadLookups, rolesRate, employees as empLookup, equipmentList, materialsList } from '../data/lookups.js';


export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">P&L (Actuals • Forecast • Total)</h2>
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

    async function computeForecastFromPlans(projectId, year) {
    // Pull project revenue policy
    const { data: proj, error: pErr } = await client
      .from('projects')
      .select('revenue_formula, fee_pct')
      .eq('id', projectId)
      .single();
    if (pErr) throw pErr;
    const formula = proj?.revenue_formula || 'TM';
    const feePct = Number(proj?.fee_pct || 0);
  
    // Fetch all plan rows for the project (we’ll filter by year client-side)
    const [lab, subs, eqp, mats, odc] = await Promise.all([
      client.from('plan_labor').select('employee_id, ym, hours').eq('project_id', projectId),
      client.from('plan_subs').select('ym, cost').eq('project_id', projectId),
      client.from('plan_equipment').select('equipment_type, ym, hours').eq('project_id', projectId),
      client.from('plan_materials').select('sku, ym, qty').eq('project_id', projectId),
      client.from('plan_odc').select('odc_type, ym, cost').eq('project_id', projectId),
    ]);
  
    // Turn errors into empty sets (tolerant)
    const planLabor = (lab.error ? [] : (lab.data || [])).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
    const planSubs  = (subs.error ? [] : (subs.data||[])).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
    const planEqp   = (eqp.error ? [] : (eqp.data || [])).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
    const planMat   = (mats.error? [] : (mats.data||[])).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
    const planODC   = (odc.error ? [] : (odc.data || [])).filter(r => keyVal(r.ym)?.slice(0,4) === String(year));
  
    // Build lookups we need for costs
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
  
    // Init maps for the 12 months
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);
    const costFcMap = Object.fromEntries(months.map(mm => [mm, 0]));
    const revFcMap  = Object.fromEntries(months.map(mm => [mm, 0]));
  
    // Accumulate COSTS
    // 1) Labor cost = hours * loaded_rate(role)
    planLabor.forEach(r => {
      const mm = keyVal(r.ym);
      if (!mm) return;
      const emp = empById[r.employee_id] || {};
      const rate = Number(rolesRate[emp.role || ''] || 0);
      const hours = Number(r.hours || 0);
      costFcMap[mm] = (costFcMap[mm] || 0) + hours * rate;
    });
  
    // 2) Subs cost = r.cost
    planSubs.forEach(r => {
      const mm = keyVal(r.ym);
      if (!mm) return;
      costFcMap[mm] = (costFcMap[mm] || 0) + Number(r.cost || 0);
    });
  
    // 3) Equipment cost = hours * equipment rate
    planEqp.forEach(r => {
      const mm = keyVal(r.ym);
      if (!mm) return;
      const meta = eqMeta[r.equipment_type] || { rate: 0 };
      costFcMap[mm] = (costFcMap[mm] || 0) + Number(r.hours || 0) * Number(meta.rate || 0);
    });
  
    // 4) Materials cost = qty * unit_cost * (1 + waste_pct)
    planMat.forEach(r => {
      const mm = keyVal(r.ym);
      if (!mm) return;
      const m = matMeta[r.sku] || { unit_cost: 0, waste_pct: 0 };
      const unitLoaded = Number(m.unit_cost || 0) * (1 + Number(m.waste_pct || 0));
      costFcMap[mm] = (costFcMap[mm] || 0) + Number(r.qty || 0) * unitLoaded;
    });
  
    // 5) ODC cost = r.cost
    planODC.forEach(r => {
      const mm = keyVal(r.ym);
      if (!mm) return;
      costFcMap[mm] = (costFcMap[mm] || 0) + Number(r.cost || 0);
    });
  
    // Compute REVENUE from cost using project formula
    months.forEach(mm => {
      const C = Number(costFcMap[mm] || 0);
      let R = C;
      if (formula === 'COST_PLUS') R = C * (1 + (Number(feePct || 0) / 100));
      // TM / FP placeholder: equals cost (until bill rates or rev rec are modeled)
      revFcMap[mm] = R;
    });
  
    return { costFcMap, revFcMap };
  }

  
  btn.onclick = () => renderPL(pid, year);
  await loadLookups();     // ← add this line
  await renderPL(pid, year);
}

async function renderPL(projectId, year) {
  const msg = $('#pnlMsg');
  const table = $('#pnlTable');
  msg.textContent = 'Loading P&L…';

  try {
    // Compute Forecast from plan tables (no views)
    const { costFcMap, revFcMap } = await computeForecastFromPlans(projectId, year);

    // Fetch Actuals — if table doesn’t exist, we’ll just treat as zero
    let actAll = [];
    try {
      const res = await client
        .from('actuals_monthly')
        .select('ym, category, amount, project_id')
        .eq('project_id', projectId);
      if (res.error) throw res.error;
      actAll = res.data || [];
    } catch (e) {
      // ok: missing actuals table or permissions — show zeros
      console.warn('actuals_monthly fetch skipped:', e?.message || e);
      actAll = [];
    }

    // Filter to chosen year (works for date or text ym)
    const inYear = (row) => {
      if (!row?.ym) return false;
      try {
        const y = (typeof row.ym === 'string') ? row.ym.slice(0,4) : new Date(row.ym).getUTCFullYear().toString();
        return y === String(year);
      } catch { return false; }
    };
    const costFc = (costFcAll || []).filter(inYear);
    const revFc  = (revFcAll  || []).filter(inYear);
    const act    = (actAll    || []).filter(inYear);

    // Index by YYYY-MM
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i, 1)));
    const key = d => d.toISOString().slice(0, 7);
    const monthKeys = months.map(key);

    // Actuals maps
    const revActMap = {};   // category = 'revenue'
    const costActMap = {};  // categories = labor, subs, equipment, materials, odc (+ anything not revenue)
    act.forEach(r => {
      const k = keyVal(r.ym);
      const amt = Number(r.amount || 0);
      if (!k) return;
      if (String(r.category).toLowerCase() === 'revenue') {
        revActMap[k] = (revActMap[k] || 0) + amt;
      } else {
        costActMap[k] = (costActMap[k] || 0) + amt;
      }
    });

    // Build rows
    const rows = [
      { label: 'Revenue — Actual',    getter: k => safeNum(revActMap[k]) },
      { label: 'Revenue — Forecast',  getter: k => safeNum(revFcMap[k])  },
      { label: 'Revenue — Total',     getter: k => safeNum(revActMap[k]) + safeNum(revFcMap[k]) },

      { label: 'Cost — Actual',       getter: k => safeNum(costActMap[k]) },
      { label: 'Cost — Forecast',     getter: k => safeNum(costFcMap[k])  },
      { label: 'Cost — Total',        getter: k => safeNum(costActMap[k]) + safeNum(costFcMap[k]) },

      { label: 'Profit (Rev−Cost)',   getter: k => (safeNum(revActMap[k]) + safeNum(revFcMap[k])) - (safeNum(costActMap[k]) + safeNum(costFcMap[k])) },
      { label: 'Margin %',            getter: k => {
          const R = safeNum(revActMap[k]) + safeNum(revFcMap[k]);
          const C = safeNum(costActMap[k]) + safeNum(costFcMap[k]);
          if (R === 0 && C === 0) return null;
          return R ? ((R - C) / R * 100) : (C ? -100 : 0);
        },
        isPercent: true
      },
    ];

    // Render table
    let html = '<thead><tr>';
    html += '<th class="p-2 text-left sticky left-0 bg-white">Category</th>';
    monthKeys.forEach((k, i) => {
      html += `<th class="p-2 text-right">${months[i].toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}</th>`;
    });
    html += '<th class="p-2 text-right">Year Total</th></tr></thead><tbody>';

    rows.forEach(row => {
      html += `<tr>`;
      html += `<td class="p-2 font-medium sticky left-0 bg-white">${row.label}</td>`;
      let yearTotal = 0;
      monthKeys.forEach(k => {
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
        const Rtot = monthKeys.reduce((s, m) => s + (safeNum(revActMap[m]) + safeNum(revFcMap[m])), 0);
        const Ctot = monthKeys.reduce((s, m) => s + (safeNum(costActMap[m]) + safeNum(costFcMap[m])), 0);
        const mtot = (Rtot===0 && Ctot===0) ? null : (Rtot ? ((Rtot-Ctot)/Rtot*100) : (Ctot? -100 : 0));
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

// ---------- helpers ----------
function keyVal(ym) {
  try {
    return (typeof ym === 'string') ? ym.slice(0,7) : new Date(ym).toISOString().slice(0,7);
  } catch { return null; }
}
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Use fmtUSD0 from dom.js if present; otherwise provide a tiny fallback
function fmtUSD0(v) {
  try {
    // If dom.js exported it, use that one
    const maybe = (/** @type {any} */($)).__fmtUSD0;
    if (typeof maybe === 'function') return maybe(v);
  } catch {}
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
