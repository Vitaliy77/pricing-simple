import { client } from '../api/supabase.js';
import { $, h } from '../lib/dom.js';

export const template = /*html*/`
  <article>
    <h3>Budget vs Actual</h3>
    <div class="grid">
      <select id="grant"></select>
      <select id="scenario">
        <option>BUDGET</option><option>F1</option><option>F2</option><option>F3</option><option>F4</option>
      </select>
      <button id="run">Run</button>
    </div>
    <div id="out" class="scroll-x"></div>
  </article>
`;

export async function init(root){
  const { data: grants } = await client.from('grants').select('id,name,grant_id,start_date,end_date');
  $('#grant',root).innerHTML = '<option value="">— Select Grant —</option>' + grants.map(g=>`<option value="${g.id}">${g.name} (${g.grant_id||''})</option>`).join('');

  $('#run',root).onclick = async ()=>{
    const gid = $('#grant',root).value; const scen = $('#scenario',root).value;
    if (!gid) return;
    const { data: g } = await client.from('grants').select('start_date,end_date').eq('id',gid).single();

    // Budget labor $ = sum(hours*rate); ODC $ = sum(amount)
    const [bl, bo, act] = await Promise.all([
      client.from('budget_labor').select('ym,hours,hourly_rate').eq('grant_id',gid).eq('scenario',scen),
      client.from('budget_odc').select('ym,amount').eq('grant_id',gid).eq('scenario',scen),
      client.from('actuals_net').select('date,amount_net,grant_code,grant_id').or(`grant_id.eq.${gid},and(grant_id.is.null)`)
    ]);

    const months = monthsBetween(g.start_date, g.end_date);
    const byMonth = Object.fromEntries(months.map(m=>[m,{budget:0,actual:0}]));

    for (const r of (bl.data||[])) byMonth[r.ym].budget += Number(r.hours||0)*Number(r.hourly_rate||0);
    for (const r of (bo.data||[])) byMonth[r.ym].budget += Number(r.amount||0);
    for (const a of (act.data||[])) {
      const ym = firstOfMonth(a.date);
      if (byMonth[ym]) byMonth[ym].actual += Number(a.amount_net||0);
    }

    // build MTD/YTD/ITD for current month
    const now = new Date(), curYM = firstOfMonth(now.toISOString().slice(0,10));
    let mtdB=0,mtdA=0,ytdB=0,ytdA=0,itdB=0,itdA=0;
    for (const m of months){
      const v = byMonth[m]; if (!v) continue;
      itdB += v.budget; itdA += v.actual;
      if (m.slice(0,4) === String(now.getFullYear())) { ytdB += v.budget; ytdA += v.actual; }
      if (m === curYM) { mtdB += v.budget; mtdA += v.actual; }
    }

    const tbl = h(`<table><thead><tr><th>Metric</th><th>Budget</th><th>Actual</th><th>Variance</th></tr></thead><tbody></tbody></table>`);
    const rows = [
      ['MTD', mtdB, mtdA],
      ['YTD', ytdB, ytdA],
      ['ITD', itdB, itdA],
    ];
    for (const [k,b,a] of rows){
      const tr = h(`<tr><td>${k}</td><td>${fmt(b)}</td><td>${fmt(a)}</td><td>${fmt(b-a)}</td></tr>`);
      tbl.tBodies[0].appendChild(tr);
    }
    $('#out',root).innerHTML=''; $('#out',root).appendChild(tbl);
  };
}

const fmt = n => (Number(n)||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
const firstOfMonth = (d)=> { const x=new Date(d); x.setDate(1); return x.toISOString().slice(0,10); };
function monthsBetween(s, e){ const out=[]; let d=new Date(s); const end=new Date(e); d.setDate(1); end.setDate(1);
  while(d<=end){ out.push(d.toISOString().slice(0,10)); d.setMonth(d.getMonth()+1); } return out; }
