import { client } from '../api/supabase.js';
import { $, $$, h } from '../lib/dom.js';

const CATS = ['Travel','Licenses','Computers','Software','Office Supplies','Training','Consultants','Marketing','Events','Insurance'];
const SCENARIOS = ['BUDGET','F1','F2','F3','F4'];

export const template = /*html*/`
  <article>
    <h3>Budget Builder</h3>
    <div class="grid">
      <select id="grant"></select>
      <select id="scenario"></select>
      <button id="claim">Claim</button>
      <button id="save">Save</button>
      <small id="msg"></small>
    </div>

    <details open>
      <summary>Labor</summary>
      <button id="addLabor" class="secondary">+ Add Employee</button>
      <div id="laborWrap" class="scroll-x"></div>
    </details>

    <details open>
      <summary>Other Direct Costs</summary>
      <button id="addODC" class="secondary">+ Add Row</button>
      <div id="odcWrap" class="scroll-x"></div>
    </details>
  </article>
`;

let state = { months:[], grant:null, scenario:'BUDGET', employees:[], labor:[], odc:[] };

export async function init(root) {
  const msg = (t,e=false)=> { $('#msg',root).textContent=t; $('#msg',root).style.color=e?'#b00':'inherit'; };

  // dropdowns
  const { data: grants } = await client.from('grants').select('id,name,grant_id,start_date,end_date').order('name');
  $('#grant',root).innerHTML = '<option value="">— Select Grant —</option>' + grants.map(g=>`<option value="${g.id}">${g.name} (${g.grant_id||''})</option>`).join('');

  $('#scenario',root).innerHTML = SCENARIOS.map(s=>`<option value="${s}">${s}</option>`).join('');

  const { data: employees } = await client.from('employees').select('id,name,level,labor_category,hourly_rate,is_active').eq('is_active',true).order('name');
  state.employees = employees || [];

  // events
  $('#grant',root).onchange = async (e)=> {
    state.grant = grants.find(g=>g.id===e.target.value) || null;
    if (!state.grant) return;
    state.months = monthsBetween(state.grant.start_date, state.grant.end_date);
    await loadExisting(); renderLabor(root); renderODC(root);
  };
  $('#scenario',root).onchange = (e)=> { state.scenario = e.target.value; };

  $('#claim',root).onclick = async ()=>{
    if (!state.grant) return msg('Pick a grant', true);
    const { error } = await client.rpc('claim_grant', { p_grant: state.grant.id });
    msg(error ? error.message : 'Grant claimed (or already yours).');
  };

  $('#addLabor',root).onclick = ()=> { state.labor.push(blankLabor()); renderLabor(root); };
  $('#addODC',root).onclick   = ()=> { state.odc.push(blankODC()); renderODC(root); };

  $('#save',root).onclick = async () => {
    if (!state.grant) return msg('Pick a grant', true);
    const laborRows = materializeLabor();
    const odcRows   = materializeODC();
    const { error } = await client.rpc('save_budget', {
      p_grant: state.grant.id, p_scenario: state.scenario,
      p_labor: laborRows, p_odc: odcRows
    });
    msg(error ? error.message : 'Saved.');
  };
}

function monthsBetween(s, e) {
  const out=[]; let d=new Date(s); const end=new Date(e); d.setDate(1); end.setDate(1);
  while(d<=end){ out.push(d.toISOString().slice(0,10)); d.setMonth(d.getMonth()+1); }
  return out;
}

function blankLabor(){
  const emp = null;
  const months = Object.fromEntries(state.months.map(m=>[m,null]));
  return { employee_id:null, employee_name:'', labor_category:'', hourly_rate:null, months };
}
function blankODC(){
  const months = Object.fromEntries(state.months.map(m=>[m,null]));
  return { category:CATS[0], description:'', months };
}

async function loadExisting(){
  // pull existing and pivot back to UI model for current scenario
  const [lab, odc] = await Promise.all([
    client.from('budget_labor').select('employee_id,employee_name,labor_category,hourly_rate,ym,hours').eq('grant_id', state.grant.id).eq('scenario', state.scenario),
    client.from('budget_odc').select('category,description,ym,amount').eq('grant_id', state.grant.id).eq('scenario', state.scenario)
  ]);
  // labor
  const key = r => `${r.employee_id||''}|${r.employee_name||''}|${r.labor_category||''}|${r.hourly_rate||''}`;
  const map = new Map();
  for(const r of (lab.data||[])){
    const k=key(r); if(!map.has(k)) map.set(k, blankLabor());
    const row = map.get(k);
    row.employee_id = r.employee_id || null;
    row.employee_name = r.employee_name || '';
    row.labor_category = r.labor_category || '';
    row.hourly_rate = r.hourly_rate || null;
    row.months[r.ym] = r.hours ?? null;
  }
  state.labor = [...map.values()];
  // odc
  const m2 = new Map();
  for(const r of (odc.data||[])){
    const k = `${r.category}|${r.description||''}`;
    if(!m2.has(k)) m2.set(k, blankODC());
    const row = m2.get(k);
    row.category = r.category; row.description = r.description||'';
    row.months[r.ym] = r.amount ?? null;
  }
  state.odc = [...m2.values()];
}

function renderLabor(root){
  const tbl = h(`<table><thead><tr>
    <th>Employee</th><th>Category</th><th>Rate</th>${state.months.map(m=>`<th>${new Date(m).toLocaleString('en-US',{month:'short'})}</th>`).join('')}<th></th>
  </tr></thead><tbody></tbody></table>`);
  for (let i=0;i<state.labor.length;i++){
    const it = state.labor[i];
    const tr = h(`<tr></tr>`);
    const empSel = h(`<select></select>`);
    empSel.innerHTML = `<option value="">— Select —</option>` + state.employees.map(e=>`<option value="${e.id}" ${it.employee_id===e.id?'selected':''}>${e.name}</option>`).join('');
    empSel.onchange = _=>{
      const e = state.employees.find(x=>x.id===empSel.value);
      it.employee_id = e?.id || null;
      it.employee_name = e?.name || '';
      it.labor_category = e?.labor_category || '';
      it.hourly_rate = e?.hourly_rate || null;
      rateInp.value = e?.hourly_rate ?? '';
      catInp.value = e?.labor_category ?? '';
    };

    const catInp = h(`<input value="${it.labor_category||''}" readonly>`);
    const rateInp = h(`<input type="number" step="0.01" value="${it.hourly_rate??''}" readonly>`);

    tr.append(h(`<td></td>`)).lastChild.appendChild(empSel);
    tr.append(h(`<td></td>`)).lastChild.appendChild(catInp);
    tr.append(h(`<td></td>`)).lastChild.appendChild(rateInp);

    for (const m of state.months){
      const cell = h(`<td></td>`);
      const inp  = h(`<input type="number" step="0.01" value="${it.months[m]??''}" style="width:7rem">`);
      inp.oninput = ()=> { it.months[m] = inp.value===''?null:Number(inp.value); };
      cell.appendChild(inp); tr.appendChild(cell);
    }
    const rm = h(`<td><button class="contrast">×</button></td>`);
    rm.firstChild.onclick = ()=>{ state.labor.splice(i,1); renderLabor(root); };
    tr.appendChild(rm);
    tbl.tBodies[0].appendChild(tr);
  }
  $('#laborWrap',root).innerHTML = ''; $('#laborWrap',root).appendChild(tbl);
}

function renderODC(root){
  const tbl = h(`<table><thead><tr>
    <th>Category</th><th>Description</th>${state.months.map(m=>`<th>${new Date(m).toLocaleString('en-US',{month:'short'})}</th>`).join('')}<th></th>
  </tr></thead><tbody></tbody></table>`);
  for (let i=0;i<state.odc.length;i++){
    const it = state.odc[i];
    const tr = h(`<tr></tr>`);
    const cat = h(`<select>${CATS.map(c=>`<option ${it.category===c?'selected':''}>${c}</option>`).join('')}</select>`);
    cat.onchange = ()=> it.category = cat.value;
    const desc = h(`<input value="${it.description||''}" style="width:18rem">`);
    desc.oninput = ()=> it.description = desc.value;

    tr.append(h(`<td></td>`)).lastChild.appendChild(cat);
    tr.append(h(`<td></td>`)).lastChild.appendChild(desc);

    for (const m of state.months){
      const cell = h(`<td></td>`);
      const inp  = h(`<input type="number" step="0.01" value="${it.months[m]??''}" style="width:7rem">`);
      inp.oninput = ()=> { it.months[m] = inp.value===''?null:Number(inp.value); };
      cell.appendChild(inp); tr.appendChild(cell);
    }
    const rm = h(`<td><button class="contrast">×</button></td>`);
    rm.firstChild.onclick = ()=>{ state.odc.splice(i,1); renderODC(root); };
    tr.appendChild(rm);
    tbl.tBodies[0].appendChild(tr);
  }
  $('#odcWrap',root).innerHTML = ''; $('#odcWrap',root).appendChild(tbl);
}

// flatten UI to normalized rows
function materializeLabor(){
  const out=[];
  for (const it of state.labor){
    if (!(it.employee_id || it.employee_name)) continue;
    for (const [ym,val] of Object.entries(it.months)){
      if (val==null || val==='') continue;
      out.push({
        employee_id: it.employee_id,
        employee_name: it.employee_name,
        labor_category: it.labor_category,
        hourly_rate: it.hourly_rate,
        ym, hours: Number(val)
      });
    }
  }
  return out;
}
function materializeODC(){
  const out=[];
  for (const it of state.odc){
    if (!it.category && !it.description) continue;
    for (const [ym,val] of Object.entries(it.months)){
      if (val==null || val==='') continue;
      out.push({ category: it.category, description: it.description, ym, amount: Number(val) });
    }
  }
  return out;
}
