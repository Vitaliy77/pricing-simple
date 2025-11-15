// js/tabs/grants.js
import { client } from '../api/supabase.js';
import { $, h } from '../lib/dom.js';
import { getSelectedGrantId, setSelectedGrantId } from '../lib/grantContext.js';

export const template = /*html*/`
  <article>
    <h3>Grant Setup & Selection</h3>

    <section class="form-row" style="margin-bottom:0.75rem">
      <div class="grid">
        <input id="g_name" placeholder="Grant Name">
        <input id="g_id"   placeholder="Grant ID">
        <input id="g_gr"   placeholder="Grantee / Funder">
        <input id="g_amt"  type="number" step="0.01" placeholder="Amount">
        <input id="g_from" type="date"  placeholder="Start">
        <input id="g_to"   type="date"  placeholder="End">
      </div>
      <div style="margin-top:0.5rem">
        <button id="create">Create</button>
        <small id="msg" style="margin-left:0.5rem"></small>
      </div>
    </section>

    <h4 style="margin-top:1.5rem">All Grants</h4>
    <p id="currentGrantLabel" style="font-size:0.8rem;color:#555;margin-bottom:0.25rem"></p>

    <div class="scroll-x">
      <table id="tbl">
        <thead>
          <tr>
            <th></th>
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
    $('#msg', root).textContent = t;
    $('#msg', root).style.color = e ? '#b00' : 'inherit';
  };

  const currentLabel = $('#currentGrantLabel', root);
  const updateCurrentLabel = (grants = []) => {
    const id = getSelectedGrantId();
    if (!id) {
      currentLabel.textContent = 'No grant selected.';
      return;
    }
    const g = grants.find(x => x.id === id);
    if (g) {
      currentLabel.textContent = `Current grant: ${g.name} (${g.grant_id || 'no code'})`;
    } else {
      currentLabel.textContent = 'Current grant: (not found in list)';
    }
  };

  $('#create', root).onclick = async () => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return msg('Sign in first', true);

    const row = {
      name:       $('#g_name', root).value.trim(),
      grant_id:   $('#g_id',   root).value.trim() || null,
      grantee:    $('#g_gr',   root).value.trim() || null,
      start_date: $('#g_from', root).value,
      end_date:   $('#g_to',   root).value,
      amount:     Number($('#g_amt', root).value || 0),
      status:     'active',
    };

    if (!row.name || !row.start_date || !row.end_date) {
      return msg('Name, start, and end dates are required.', true);
    }

    const { error } = await client.from('grants').insert(row);
    if (error) return msg(error.message, true);

    msg('Grant created.');
    await load();
  };

  async function load() {
    const { data, error } = await client
      .from('grants')
      .select('id,name,grant_id,grantee,start_date,end_date,amount,status,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[grants] load error', error);
      msg(error.message, true);
      return;
    }

    const grants = data || [];
    const tb = $('#tbl tbody', root);
    tb.innerHTML = '';

    const currentId = getSelectedGrantId();

    for (const g of grants) {
      const isCurrent = currentId && g.id === currentId;
      const tr = h(`<tr${isCurrent ? ' style="background:#e6f2ff"' : ''}></tr>`);

      const btnCell = h('<td></td>');
      const btn = document.createElement('button');
      btn.textContent = isCurrent ? 'Current' : 'Use';
      btn.type = 'button';
      btn.className = isCurrent ? 'secondary' : 'outline';
      btn.onclick = () => {
        setSelectedGrantId(g.id);
        load();                  // re-render highlight & button labels
      };
      btnCell.appendChild(btn);
      tr.appendChild(btnCell);

      tr.appendChild(h(`<td>${g.name}</td>`));
      tr.appendChild(h(`<td>${g.grant_id || ''}</td>`));
      tr.appendChild(h(`<td>${g.grantee || ''}</td>`));
      tr.appendChild(h(`<td>${g.start_date}</td>`));
      tr.appendChild(h(`<td>${g.end_date}</td>`));
      tr.appendChild(h(`<td>${g.amount || 0}</td>`));
      tr.appendChild(h(`<td>${g.status || ''}</td>`));

      tb.appendChild(tr);
    }

    updateCurrentLabel(grants);
  }

  await load();
}
