// js/tabs/pnl.js
// P&L tab: Actuals vs Forecast by month (with year total)

import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';

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

  btn.onclick = () => renderPL(pid, year);

  await renderPL(pid, year);
}

async function renderPL(projectId, year) {
  const msg = $('#pnlMsg');
  const table = $('#pnlTable');
  msg.textContent = 'Loading P&L…';

  try {
    // Fetch Forecast — tolerant queries, no server-side date filters
    const { data: costFcAll, error: costFcErr } = await client
      .from('vw_eac_monthly_pl')
      .select('ym, total_cost, project_id')
      .eq('project_id', projectId)
      .order('ym');

    const { data: revFcAll, error: revFcErr } = await client
      .from('vw_eac_revenue_monthly')
      .select('ym, revenue, project_id')
      .eq('project_id', projectId)
      .order('ym');

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

    // Forecast maps
    const costFcMap = {};
    costFc.forEach(r => {
      const k = keyVal(r.ym);
      costFcMap[k] = Number(r.total_cost || 0);
    });

    const revFcMap = {};
    revFc.forEach(r => {
      const k = keyVal(r.ym);
      revFcMap[k] = Number(r.revenue || 0);
    });

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
