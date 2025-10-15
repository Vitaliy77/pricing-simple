import { $, fmtUSD0 } from './state.js';

export function renderPL(container, months, costMap, revMap){
  let html = '<thead><tr><th class="p-2 bg-white"></th>';
  months.forEach(d => html += `<th class="p-2 text-right bg-white">${d.toLocaleString('en-US',{month:'short', timeZone:'UTC'})}</th>`);
  html += '<th class="p-2 text-right bg-white">Total</th></tr></thead><tbody>';

  const rows = [
    ['Revenue',      (k) => Number(revMap[k] || 0)],
    ['Labor',        (k) => Number(costMap[k]?.labor || 0)],
    ['Equip',        (k) => Number(costMap[k]?.equip || 0)],
    ['Materials',    (k) => Number(costMap[k]?.materials || 0)],
    ['Subs',         (k) => Number(costMap[k]?.subs || 0)],
    ['Fringe',       (k) => Number(costMap[k]?.fringe || 0)],
    ['Overhead',     (k) => Number(costMap[k]?.overhead || 0)],
    ['G&A',          (k) => Number(costMap[k]?.gna || 0)],
    ['Total Cost',   (k) => Number(costMap[k]?.total_cost || 0)],
    ['Profit',       (k) => Number(revMap[k] || 0) - Number(costMap[k]?.total_cost || 0)],
    ['Margin %',     (k) => {
      const R = Number(revMap[k] || 0), C = Number(costMap[k]?.total_cost || 0);
      return (R===0 && C===0) ? null : (R ? ((R-C)/R*100) : (C? -100 : 0));
    }],
  ];

  const key = (d) => d.toISOString().slice(0,7);

  rows.forEach(([label, fn]) => {
    html += `<tr><td class="p-2 font-medium bg-white">${label}</td>`;
    let total = 0;
    months.forEach(d => {
      const k = key(d);
      const val = fn(k);
      if (label === 'Margin %') {
        html += `<td class="p-2 text-right">${val==null ? '—' : `${Math.round(val).toLocaleString('en-US')}%`}</td>`;
      } else {
        total += Number(val||0);
        html += `<td class="p-2 text-right">${fmtUSD0(val||0)}</td>`;
      }
    });
    if (label === 'Margin %') {
      const Rtot = months.reduce((s,d)=> s + Number(revMap[key(d)]||0), 0);
      const Ctot = months.reduce((s,d)=> s + Number(costMap[key(d)]?.total_cost||0), 0);
      const mtot = (Rtot===0 && Ctot===0) ? null : (Rtot ? ((Rtot-Ctot)/Rtot*100) : (Ctot? -100 : 0));
      html += `<td class="p-2 text-right font-semibold">${mtot==null ? '—' : ${"`${Math.round(mtot).toLocaleString('en-US')}%`"}}</td>`;
    } else {
      html += `<td class="p-2 text-right font-semibold">${fmtUSD0(total)}</td>`;
    }
    html += '</tr>';
  });

  html += '</tbody>';
  container.innerHTML = html;
}
