// /js/tabs/grants.js
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

    <hr />

    <h4 style="margin-top:1rem">Current working grant</h4>
    <label>
      <select id="grantCurrent">
        <option value="">— None selected —</option>
      </select>
    </label>
    <small id="grantCurrentMsg"></small>

    <h3 style="margin-top:1.5rem">All Grants</h3>
    <div class="scroll-x">
      <table id="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Grant ID</th>
            <th>Grantee</th>
            <th>Start</th>
            <th>End</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </article>
`;

export async function init(root) {
  root.innerHTML = template;

  const msg = (t, e = false) => {
    const el = $('#msg', root);
    if (!el) return;
    el.textContent = t || '';
    el.style.color = e ? '#b00' : 'inherit';
  };

  const msgCurrent = (t) => {
    const el = $('#grantCurrentMsg', root);
    if (!el) return;
    el.textContent = t || '';
  };

  // Create grant handler
  $('#create', root).onclick = async () => {
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user || null;
    if (!user) return msg('Sign in first', true);

    const row = {
      name: $('#g_name', root).value.trim(),
      grant_id: $('#g_id', root).value.trim() || null,
      grantee: $('#g_gr', root).value.trim() || null,
      start_date: $('#g_from', root).value || null,
      end_date: $('#g_to', root).value || null,
      amount: Number($('#g_amt', root).value || 0),
      pm_user_id: user.id,
      status: 'active',
    };

    if (!row.name || !row.start_date || !row.end_date) {
      return msg('Name, start date and end date are required.', true);
    }

    const { error } = await client.from('grants').insert(row);
    if (error) {
      console.error('[grants] insert error', error);
      return msg(error.message, true);
    }
    msg('Grant created.');

    // clear inputs
    $('#g_name', root).value = '';
    $('#g_id', root).value = '';
    $('#g_gr', root).value = '';
    $('#g_amt', root).value = '';
    $('#g_from', root).value = '';
    $('#g_to', root).value = '';

    await load();
  };

  // Change current working grant
  $('#grantCurrent', root).addEventListener('change', (e) => {
    const id = e.target.value || '';
    if (!id) {
      localStorage.removeItem('selectedGrantId');
      localStorage.removeItem('selectedGrantName');
      msgCurrent('No default grant selected.');
      return;
    }
    const opt = e.target.selectedOptions[0];
    const label = opt ? opt.textContent.trim() : '';
    localStorage.setItem('selectedGrantId', id);
    localStorage.setItem('selectedGrantName', label);
    msgCurrent(`Default grant set to: ${label}`);
  });

  async function load() {
    const { data, error } = await client
      .from('grants')
      .select('id,name,grant_id,grantee,start_date,end_date,amount,status,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[grants] load error', error);
      return msg(error.message, true);
    }

    const tb = $('#tbl tbody', root);
    tb.innerHTML = '';
    (data || []).forEach((g) => {
      tb.appendChild(h(`<tr data-id="${g.id}">
        <td>${g.name}</td>
        <td>${g.grant_id || ''}</td>
        <td>${g.grantee || ''}</td>
        <td>${g.start_date || ''}</td>
        <td>${g.end_date || ''}</td>
        <td>${g.amount ?? 0}</td>
        <td>${g.status || ''}</td>
      </tr>`));
    });

    // fill Current working grant select
    const sel = $('#grantCurrent', root);
    sel.innerHTML = '<option value="">— None selected —</option>';
    const storedId = localStorage.getItem('selectedGrantId') || '';
    (data || []).forEach((g) => {
      const label = g.grant_id ? `${g.name} (${g.grant_id})` : g.name;
      const opt = new Option(label, g.id);
      sel.add(opt);
    });

    if (storedId && (data || []).some((g) => g.id === storedId)) {
      sel.value = storedId;
      const label = sel.selectedOptions[0]?.textContent.trim() || '';
      msgCurrent(`Default grant: ${label}`);
    } else {
      msgCurrent('');
    }
  }

  await load();
}
