// /js/tabs/grants.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

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
    <button id="create" type="button">Create</button>
    <small id="msg"></small>

    <h3 style="margin-top:2rem">All Grants</h3>
    <div class="scroll-x">
      <table id="tbl">
        <thead>
          <tr>
            <th>Name</th><th>Grant ID</th><th>Grantee</th>
            <th>Start</th><th>End</th><th>Amount</th><th>PM</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </article>
`;

export async function init(root) {
  const msg = (t, err=false) => {
    const m = $('#msg', root);
    if (!m) return;
    m.textContent = t || '';
    m.style.color = err ? '#b00' : 'inherit';
    if (t) setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 4000);
  };

  const fmtDate = (d) => d ? String(d).slice(0, 10) : '';
  const fmtMoney = (n) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Create new grant
  $('#create', root).onclick = async () => {
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return msg('Please sign in first.', true);

      const name = $('#g_name', root).value.trim();
      const start_date = $('#g_from', root).value;
      const end_date   = $('#g_to', root).value;

      if (!name)        return msg('Grant Name is required.', true);
      if (!start_date)  return msg('Start date is required.', true);
      if (!end_date)    return msg('End date is required.', true);

      const row = {
        name,
        grant_id:  $('#g_id', root).value.trim() || null,
        grantee:   $('#g_gr', root).value.trim() || null,
        start_date,
        end_date,
        amount:    $('#g_amt', root).value ? Number($('#g_amt', root).value) : null,
        pm_user_id: user.id,                // current user as PM
        status:     'active'                // optional default if you use status
      };

      const { error } = await client.from('grants').insert(row);
      if (error) return msg(error.message, true);

      // clear quick inputs
      $('#g_name', root).value = '';
      $('#g_id',   root).value = '';
      $('#g_gr',   root).value = '';
      $('#g_amt',  root).value = '';
      $('#g_from', root).value = '';
      $('#g_to',   root).value = '';

      msg('Grant created.');
      await loadTable();
    } catch (e) {
      console.error('create grant failed:', e);
      msg(e.message || String(e), true);
    }
  };

  // Load and render table
  async function loadTable() {
    msg('Loading…');
    try {
      // SAFE query (no embed). If you only want active, add .eq('status','active')
      const { data: grants, error } = await client
        .from('grants')
        .select('id, name, grant_id, grantee, start_date, end_date, amount, pm_user_id, status, created_at')
        .order('created_at', { ascending: false });

      if (error) { msg(error.message, true); return; }

      // Optional: map PM display via profiles
      const pmIds = [...new Set((grants || []).map(g => g.pm_user_id).filter(Boolean))];
      let pmById = {};
      if (pmIds.length) {
        const { data: profs, error: pErr } = await client
          .from('profiles')
          .select('id, full_name, email')
          .in('id', pmIds);
        if (!pErr && profs) {
          pmById = Object.fromEntries(profs.map(r => [r.id, r]));
        }
      }

      const tb = $('#tbl tbody', root);
      tb.innerHTML = '';
      (grants || []).forEach(g => {
        const pm = pmById[g.pm_user_id] || {};
        tb.appendChild(h(`
          <tr>
            <td>${escapeHtml(g.name)}</td>
            <td>${escapeHtml(g.grant_id || '')}</td>
            <td>${escapeHtml(g.grantee  || '')}</td>
            <td>${escapeHtml(fmtDate(g.start_date))}</td>
            <td>${escapeHtml(fmtDate(g.end_date))}</td>
            <td>${fmtMoney(g.amount)}</td>
            <td>${escapeHtml(pm.full_name || pm.email || g.pm_user_id || '')}</td>
          </tr>
        `));
      });

      msg('');
    } catch (e) {
      console.error('grants load failed:', e);
      msg(e.message || String(e), true);
    }
  }

  // tiny escape
  function escapeHtml(x) {
    return (x ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;');
  }

  await loadTable();
}
