// js/tabs/grantSelect.js
import { client } from '../api/supabase.js';
import { $ } from '../lib/dom.js';
import { getSelectedGrantId, setSelectedGrantId } from '../lib/grantContext.js';

export const template = /*html*/`
  <article>
    <h3>Grant Selection</h3>
    <small id="msg"></small>

    <section style="margin-top:0.75rem;max-width:700px;">
      <label style="display:block;margin-bottom:0.5rem;">
        <span style="display:block;margin-bottom:0.25rem;">Select active grant</span>
        <select id="grantSelectMain" style="width:100%;padding:0.35rem;font-size:0.9rem;">
          <option value="">— Choose a grant —</option>
        </select>
      </label>
      <button id="setCurrent" type="button" style="font-size:0.85rem;padding:0.25rem 0.75rem;">
        Set as current grant
      </button>
    </section>

    <section id="grantInfo" style="margin-top:1.5rem;max-width:700px;">
      <!-- filled by JS -->
    </section>
  </article>
`;

let rootEl = null;
let grantsCache = [];

/* ---------- helpers ---------- */

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $('#msg', rootEl);
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isErr ? '#b00' : 'inherit';
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 3500);
  }
}

function esc(x) {
  return (x ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function renderGrantInfo(grant) {
  const box = $('#grantInfo', rootEl);
  if (!box) return;

  if (!grant) {
    box.innerHTML = `<p style="color:#666;">No grant selected.</p>`;
    return;
  }

  const pop = `${grant.start_date || '—'} → ${grant.end_date || '—'}`;
  const amt = grant.amount != null
    ? Number(grant.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

  box.innerHTML = `
    <div style="
      border:1px solid #ddd;
      border-radius:0.4rem;
      padding:0.75rem 0.9rem;
      background:#fafafa;
    ">
      <h4 style="margin:0 0 0.4rem 0;">${esc(grant.name)}</h4>
      <p style="margin:0.1rem 0;font-size:0.9rem;">
        <strong>Grant ID:</strong> ${esc(grant.grant_id || '—')}
      </p>
      <p style="margin:0.1rem 0;font-size:0.9rem;">
        <strong>Period of performance:</strong> ${esc(pop)}
      </p>
      <p style="margin:0.1rem 0;font-size:0.9rem;">
        <strong>Total award:</strong> $${amt}
      </p>
      <p style="margin:0.1rem 0;font-size:0.9rem;color:#666;">
        <strong>Status:</strong> ${esc(grant.status || 'active')}
      </p>
    </div>
  `;
}

/* ---------- main ---------- */

export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;
  msg('');

  const sel = $('#grantSelectMain', rootEl);

  // Load active grants
  try {
    const { data, error } = await client
      .from('grants')
      .select('id,name,grant_id,start_date,end_date,amount,status')
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) throw error;

    grantsCache = data || [];
    sel.innerHTML = '<option value="">— Choose a grant —</option>';

    grantsCache.forEach(g => {
      const label = g.grant_id
        ? `${g.name} (${g.grant_id})`
        : g.name;
      sel.appendChild(new Option(label, g.id));
    });

    // Try to auto-select previously chosen grant
    const savedId = getSelectedGrantId();
    if (savedId && sel.querySelector(`option[value="${savedId}"]`)) {
      sel.value = savedId;
      const g = grantsCache.find(x => x.id === savedId);
      renderGrantInfo(g || null);
    } else {
      renderGrantInfo(null);
    }
  } catch (e) {
    console.error('[grantSelect] load error', e);
    msg(e.message || String(e), true);
  }

  // When dropdown changes -> update info, but DO NOT overwrite global until user clicks button
  sel.addEventListener('change', e => {
    const id = e.target.value || null;
    const grant = grantsCache.find(g => g.id === id) || null;
    renderGrantInfo(grant);
  });

  // Button: set as current grant (global)
  $('#setCurrent', rootEl).addEventListener('click', () => {
    const id = sel.value || null;
    if (!id) return msg('Select a grant first.', true);

    setSelectedGrantId(id);
    const g = grantsCache.find(x => x.id === id) || null;
    renderGrantInfo(g);
    msg('Current grant set. Other tabs will now use this grant.');
  });
}
