// /js/tabs/grants.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/`
  <article>
    <h3>Create Grant</h3>
    <div class="grid">
      <input id="g_name" placeholder="Grant Name">
      <input id="g_id"   placeholder="Grant ID">
      <input id="g_funder"   placeholder="Funder / Grantee">
      <input id="g_amt"  type="number" step="0.01" placeholder="Total Award Amount">
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
            <th>Name</th>
            <th>Grant ID</th>
            <th>Funder</th>
            <th>Start</th>
            <th>End</th>
            <th>Total Award</th>
            <th>PM (user id)</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </article>
`;

export async function init(root) {
  const msg = (t, err = false) => {
    const m = $('#msg', root);
    if (!m) return;
    m.textContent = t || '';
    m.style.color = err ? '#b00' : 'inherit';
    if (t) setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 4000);
  };

  const esc = x => (x ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fmtDate = d => d ? String(d).slice(0, 10) : '';
  const fmtMoney = n =>
    (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // CREATE GRANT
  $('#create', root).onclick = async () => {
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return msg('Please sign in first.', true);

      const name = $('#g_name', root).value.trim();
      const start_date = $('#g_from', root).value;
      const end_date   = $('#g_to', root).value;

      if (!name)       return msg('Grant Name is required.', true);
      if (!start_date) return msg('Start date is required.', true);
      if (!end_date)   return msg('End date is required.', true);

      const row = {
        name,
        grant_id:    $('#g_id', root).value.trim() || null,
        funder:      $('#g_funder', root).value.trim() || null, // <- funder column
        start_date,
        end_date,
        total_award: $('#g_amt', root).value ? Number($('#g_amt', root).value) : null, // <- total_award column
        pm_user_id:  user.id,
        status:      'active'
      };

      const { error } = await client.from('grants').insert(row);
      if (error) return msg(error.message, true);

      // Clear form
      ['g_name','g_id','g_funder','g_amt','g_from','g_to'].forEach(id => {
        const el = $('#' + id, root);
        if (el) el.value = '';
      });

      msg('Grant created.');
      await loadTable();
    } catch (e) {
      console.error('create grant failed:', e);
      msg(e.message || String(e), true);
    }
  };

  // LOAD TABLE
  async function loadTable() {
    msg('Loading…');
    try {
      // match your schema: funder, total_award
      let res = await client
        .from('grants')
        .select('id, name, grant_id, funder, start_date, end_date, total_award, pm_user_id, status, created_at')
        .order('created_at', { ascending: false });

      // if created_at order is a problem, fall back to start_date
      if (res.error) {
        console.warn('order by created_at failed, falling back to start_date:', res.error);
        res = await client
          .from('grants')
          .select('id, name, grant_id, funder, start_date, end_date, total_award, pm_user_id, status')
          .order('start_date', { ascending: false });
      }

      if (res.error) {
        console.error('grants load error', res.error);
        return msg(res.error.message, true);
      }

      const grants = res.data || [];
      const tb = $('#tbl tbody', root);
      if (!tb) return;
      tb.innerHTML = '';

      grants.forEach(g => {
        tb.appendChild(h(`
          <tr>
            <td>${esc(g.name)}</td>
            <td>${esc(g.grant_id || '')}</td>
            <td>${esc(g.funder   || '')}</td>
            <td>${esc(fmtDate(g.start_date))}</td>
            <td>${esc(fmtDate(g.end_date))}</td>
            <td>${fmtMoney(g.total_award)}</td>
            <td>${esc(g.pm_user_id || '')}</td>
          </tr>
        `));
      });

      msg('');
    } catch (e) {
      console.error('grants load failed:', e);
      msg(e.message || String(e), true);
    }
  }

  await loadTable();
}
