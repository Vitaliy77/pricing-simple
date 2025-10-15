import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { $, fmtUSD0 } from '../lib/dom.js';

export async function refreshPL() {
  if (!getProjectId()) throw new Error('Select a project first.');
  try {
    const ymVal = $('#monthPicker').value || new Date().toISOString().slice(0, 7);
    const year = Number(ymVal.slice(0, 4));
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;

    // Costs
    const { data: costs, error: cErr } = await client
      .from('vw_eac_monthly_pl')
      .select('ym, labor, equip, materials, subs, fringe, overhead, gna, total_cost')
      .eq('project_id', getProjectId())
      .gte('ym', start)
      .lt('ym', end)
      .order('ym');
    if (cErr) throw cErr;

    // Revenue
    const { data: rev, error: rErr } = await client
      .from('vw_eac_revenue_monthly')
      .select('ym, revenue')
      .eq('project_id', getProjectId())
      .gte('ym', start)
      .lt('ym', end)
      .order('ym');
    if (rErr) throw rErr;

    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i, 1)));
    const key = d => d.toISOString().slice(0, 7);

    const costMap = {};
    (costs || []).forEach(r => { costMap[new Date(r.ym).toISOString().slice(0, 7)] = r; });
    const revMap = {};
    (rev || []).forEach(r => { revMap[new Date(r.ym).toISOString().slice(0, 7)] = r.revenue || 0; });

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
        const Rtot = months.reduce((s,d)=> s + Number(revMap[key(d)]||0), 0);
        const Ctot = months.reduce((s,d)=> s + Number(costMap[key(d)]?.total_cost||0), 0);
        const mtot = (Rtot===0 && Ctot===0) ? null : (Rtot ? ((Rtot-Ctot)/Rtot*100) : (Ctot? -100 : 0));
        html += `<td class="p-2 text-right font-semibold">${mtot==null ? '—' : `${mtot.toFixed(1)}%`}</td>`;
      } else {
        html += `<td class="p-2 text-right font-semibold">${fmtUSD0(total)}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody>';
    document.getElementById('plTable').innerHTML = html;
  } catch (err) {
    console.error('P&L error', err);
    $('#plTable').className = 'min-w-full text-sm';
    $('#plTable').innerHTML = `<tbody><tr><td class="p-3 text-red-600">P&L error: ${err.message || err}</td></tr></tbody>`;
  }
}
