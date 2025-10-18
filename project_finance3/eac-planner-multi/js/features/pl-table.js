// js/features/pl-table.js
import { client } from '../api/supabase.js';
import { $, fmtUSD0 } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';

export async function refreshPL() {
  try {
    if (!getProjectId()) { $('#plTable').innerHTML = '<tbody><tr><td class="p-3">Select a project.</td></tr></tbody>'; return; }

    const ymVal = $('#monthPicker').value || new Date().toISOString().slice(0, 7);
    const year = Number(ymVal.slice(0, 4));

    // ---- Costs (no server-side date filter; filter by year in JS)
    const { data: costsAll, error: cErr } = await client
      .from('vw_eac_monthly_pl')
      .select('ym, labor, equip, materials, subs, fringe, overhead, gna, total_cost, project_id')
      .eq('project_id', getProjectId())
      .order('ym');
    if (cErr) throw cErr;

    // ---- Revenue (no server-side date filter; filter by year in JS)
    const { data: revAll, error: rErr } = await client
      .from('vw_eac_revenue_monthly')
      .select('ym, revenue, project_id')
      .eq('project_id', getProjectId())
      .order('ym');
    if (rErr) throw rErr;

    // Normalize and filter to the chosen year (works for date or text ym)
    const inYear = (row) => {
      if (!row?.ym) return false;
      try {
        const y = (typeof row.ym === 'string') ? row.ym.slice(0,4) : new Date(row.ym).getUTCFullYear().toString();
        return y === String(year);
      } catch { return false; }
    };

    const costs = (costsAll || []).filter(inYear);
    const rev = (revAll || []).filter(inYear);

    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i, 1)));
    const key = d => d.toISOString().slice(0, 7);

    const costMap = {};
    (costs || []).forEach(r => {
      const k = (typeof r.ym === 'string') ? r.ym.slice(0,7) : new Date(r.ym).toISOString().slice(0,7);
      costMap[k] = r;
    });
    const revMap = {};
    (rev || []).forEach(r => {
      const k = (typeof r.ym === 'string') ? r.ym.slice(0,7) : new Date(r.ym).toISOString().slice(0,7);
      revMap[k] = Number(r.revenue || 0);
    });

    const rows = [
      ['Revenue', k => Number(revMap[k] || 0)],
      ['Labor', k => Number(costMap[k]?.labor || 0)],
      ['Equip', k => Number(costMap[k]?.equip || 0)],
      ['Materials', k => Number(costMap[k]?.materials || 0)],
      ['Subs', k => Number(costMap[k]?.subs || 0)],
      ['Fringe', k => Number(costMap[k]?.fringe || 0)],
      ['Overhead', k => Number(costMap[k]?.overhead || 0)],
      ['G&A', k => Number(costMap[k]?.gna || 0)],
      ['Total Cost', k => Number(costMap[k]?.total_cost || 0)],
      ['Profit', k => Number(revMap[k] || 0) - Number(costMap[k]?.total_cost || 0)],
      ['Margin %', k => {
        const R = Number(revMap[k] || 0), C = Number(costMap[k]?.total_cost || 0);
        return (R === 0 && C === 0) ? null : (R ? ((R - C) / R * 100) : (C ? -100 : 0));
      }],
    ];

    let html = '<thead><tr>';
    html += '<th class="p-2 sticky-col"></th>';
    months.forEach(d => {
      html += `<th class="p-2 text-right">${d.toLocaleString('en-US',{month:'short', timeZone:'UTC'})}</th>`;
    });
    html += '<th class="p-2 text-right">Total</th></tr></thead><tbody>';

    rows.forEach(([label, fn]) => {
      html += `<tr><td class="p-2 font-medium sticky-col">${label}</td>`;
      let total = 0;
      months.forEach(d => {
        const k = key(d);
        const val = fn(k);
        if (label === 'Margin %') {
          html += `<td class="p-2 text-right">${val==null ? '—' : `${val.toFixed(1)}%`}</td>`;
        } else {
          total += Number(val || 0);
          html += `<td class="p-2 text-right">${fmtUSD0(val || 0)}</td>`;
        }
      });
      if (label === 'Margin %') {
        const keys = months.map(key);
        const Rtot = keys.reduce((s,k)=> s + Number(revMap[k]||0), 0);
        const Ctot = keys.reduce((s,k)=> s + Number(costMap[k]?.total_cost||0), 0);
        const mtot = (Rtot===0 && Ctot===0) ? null : (Rtot ? ((Rtot-Ctot)/Rtot*100) : (Ctot? -100 : 0));
        html += `<td class="p-2 text-right font-semibold">${mtot==null ? '—' : `${mtot.toFixed(1)}%`}</td>`;
      } else {
        html += `<td class="p-2 text-right font-semibold">${fmtUSD0(total)}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody>';
    $('#plTable').innerHTML = html;

  } catch (err) {
    console.error('P&L error', err);
    $('#plTable').className = 'min-w-full text-sm';
    $('#plTable').innerHTML = `<tbody><tr><td class="p-3 text-red-600">P&L error: ${err.message || err}</td></tr></tbody>`;
  }
}
