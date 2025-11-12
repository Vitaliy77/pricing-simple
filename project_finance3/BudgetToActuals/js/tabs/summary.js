import { client } from '../api/supabase.js';
import { $, h } from '../lib/dom.js';

export const template = /*html*/`
  <article>
    <h3>Summary</h3>
    <div class="grid">
      <select id="grant"></select>
      <select id="scenario">
        <option>BUDGET</option><option>F1</option><option>F2</option><option>F3</option><option>F4</option>
      </select>
      <button id="run">Run</button>
    </div>
    <div id="out"></div>
  </article>
`;

export async function init(root){
  const { data: grants } = await client.from('grants').select('id,name,grant_id,start_date,end_date,amount');
  $('#grant',root).innerHTML = '<option value="">— Select Grant —</option>' + grants.map(g=>`<option value="${g.id}">${g.name} (${g.grant_id||''})</option>`).join('');

  $('#run',root).onclick = async ()=>{
    const gid = $('#grant',root).value; const scen = $('#scenario',root).value;
    if (!gid) return;
    const { data: g } = await client.from('grants').select('start_date,end_date,amount').eq('id',gid).single();

    const [bl, bo, act] = await Promise.all([
      client.from('budget_labor').select('hours,hourly_rate').eq('grant_id',gid).eq('scenario',scen),
      client.from('budget_odc').select('amount').eq('grant_id',gid).eq('scenario',scen),
      client.from('actuals_net').select('amount_net, date').eq('grant_id',gid)
    ]);
    const budgetTotal = sum((bl.data||[]).map(r=>(Number(r.hours||0)*Number(r.hourly_rate||0)))) + sum((bo.data||[]).map(r=>Number(r.amount||0)));
    const actualTotal = sum((act.data||[]).map(r=>Number(r.amount_net||0)));

    const today = new Date();
    const totalMonths = monthDiff(new Date(g.start_date), new Date(g.end_date))+1;
    const elapsedMonths = Math.min(totalMonths, monthDiff(new Date(g.start_date), today)+1);

    $('#out',root).innerHTML = `
      <ul>
        <li><strong>Total Budget:</strong> ${fmt(budgetTotal)}</li>
        <li><strong>Total Actual:</strong> ${fmt(actualTotal)}</li>
        <li><strong>Variance:</strong> ${fmt(budgetTotal-actualTotal)}</li>
        <li><strong>Award Amount (contract):</strong> ${fmt(g.amount||0)}</li>
        <li><strong>Time elapsed:</strong> ${elapsedMonths}/${totalMonths} months</li>
      </ul>`;
  };
}

const sum = a => a.reduce((s,x)=>s+(Number(x)||0),0);
const fmt = n => (Number(n)||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
function monthDiff(a,b){ return (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth()); }
