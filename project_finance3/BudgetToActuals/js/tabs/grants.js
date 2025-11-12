import { client } from '../api/supabase.js';
import { $, h } from '../lib/dom.js';

export const template = /*html*/`
  <article>
    <h3>Create Grant</h3>
    <div class="grid">
      <input id="g_name" placeholder="Grant Name">
      <input id="g_id"   placeholder="Grant ID">
      <input id="g_gr"   placeholder="Grantee">
      <input id="g_amt"  type="number" step="0.01" placeholder="Amount">
      <input id="g_from" type="date"  placeholder="Start">
      <input id="g_to"   type="date"  placeholder="End">
    </div>
    <button id="create">Create</button>
    <small id="msg"></small>

    <h3 style="margin-top:2rem">All Grants</h3>
    <div class="scroll-x"><table id="tbl"><thead>
      <tr><th>Name</th><th>Grant ID</th><th>Grantee</th><th>Start</th><th>End</th><th>Amount</th><th>PM</th></tr>
    </thead><tbody></tbody></table></div>
  </article>
`;

export async function init(root) {
  const msg = (t,e=false)=> { $('#msg',root).textContent=t; $('#msg',root).style.color=e?'#b00':'inherit'; };

  $('#create',root).onclick = async () => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return msg('Sign in first', true);
    const row = {
      name:  $('#g_name',root).value.trim(),
      grant_id: $('#g_id',root).value.trim() || null,
      grantee:  $('#g_gr',root).value.trim() || null,
      start_date: $('#g_from',root).value,
      end_date:   $('#g_to',root).value,
      amount:  Number($('#g_amt',root).value || 0),
      pm_user_id: user.id
    };
    const { error } = await client.from('grants').insert(row);
    msg(error ? error.message : 'Created');
    await load();
  };

  async function load() {
    const { data, error } = await client.from('grants')
      .select('id,name,grant_id,grantee,start_date,end_date,amount,pm_user_id,profiles!grants_pm_user_id_fkey(full_name,email)')
      .order('created_at', { ascending:false });
    if (error) return msg(error.message, true);
    const tb = $('#tbl tbody', root); tb.innerHTML = '';
    for (const g of data) {
      tb.appendChild(h(`<tr>
        <td>${g.name}</td><td>${g.grant_id||''}</td><td>${g.grantee||''}</td>
        <td>${g.start_date}</td><td>${g.end_date}</td><td>${g.amount||0}</td>
        <td>${g.profiles?.full_name || g.profiles?.email || g.pm_user_id || ''}</td>
      </tr>`));
    }
  }
  await load();
}
