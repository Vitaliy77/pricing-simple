// js/tabs/indirect.js  ← REPLACE THE ENTIRE FILE WITH THIS VERSION

import { $ } from '../lib/dom.js';
import { client, getCurrentYm } from '../api/supabase.js';

export const template = /*html*/`...`;  // unchanged

let state = {
  year: new Date().getFullYear(),
  months: [],
  indirect: [],
  addbacks: [],
};

export async function init(root) {
  const ym = getCurrentYm();
  state.year = Number(ym.slice(0,4));
  state.months = monthsForYear(state.year);
  $('#indYear').value = state.year;

  $('#indReload').onclick = loadAll;
  $('#indAddIndirect').onclick = () => { state.indirect.push(blankLine()); render(); };
  $('#indAddAddback').onclick = () => { state.addbacks.push(blankLine()); render(); };
  $('#indSave').onclick = saveAll;

  await loadAll();
}

/* -------------------------------------------------------------
   LOAD: Use .like('ym', 'YYYY-%') instead of .gte/.lte
   ------------------------------------------------------------- */
async function loadAll() {
  const msg = $('#indMsg');
  msg.textContent = 'Loading…';

  const yearPattern = `${state.year}-%`;  // e.g. "2025-%"

  const [{ data: ind, error: e1 }, { data: ab, error: e2 }] = await Promise.all([
    client
      .from('indirect_lines')
      .select('id,label,ym,amount')
      .like('ym', yearPattern),
    client
      .from('addback_lines')
      .select('id,label,ym,amount')
      .like('ym', yearPattern),
  ]);

  if (e1 && e1.code === '42P01') {
    msg.textContent = 'Tables not found. Create indirect_lines and addback_lines in Supabase.';
    state.indirect = [blankLine()];
    state.addbacks = [blankLine()];
    render();
    return;
  }
  if (e1) { msg.textContent = e1.message; return; }
  if (e2) { msg.textContent = e2.message; return; }

  state.indirect = groupLines(ind || []);
  state.addbacks = groupLines(ab || []);
  render();
  msg.textContent = '';
}

/* -------------------------------------------------------------
   SAVE: Use ym as 'YYYY-MM-01' (text-safe)
   ------------------------------------------------------------- */
async function saveAll() {
  const msg = $('#indMsg');
  msg.textContent = 'Saving…';

  const mks = state.months.map(m => m.ym.slice(0,7));  // ['2025-01', ...]
  const rowsToInsert = [];

  state.indirect.forEach(r => {
    const label = (r.label || '').trim();
    if (!label) return;
    mks.forEach(k => {
      const amt = Number(r.month[k] || 0);
      if (!amt) return;
      rowsToInsert.push({
        label,
        ym: k + '-01',       // ← text-safe: "2025-01-01"
        amount: amt,
      });
    });
  });

  state.addbacks.forEach(r => {
    const label = (r.label || '').trim();
    if (!label) return;
    mks.forEach(k => {
      const amt = Number(r.month[k] || 0);
      if (!amt) return;
      rowsToInsert.push({
        __addback: true,
        label,
        ym: k + '-01',
        amount: amt,
      });
    });
  });

  try {
    // Delete old data for this year
    await client.from('indirect_lines').delete().like('ym', `${state.year}-%`);
    await client.from('addback_lines').delete().like('ym', `${state.year}-%`);

    const indirectRows = rowsToInsert.filter(r => !r.__addback);
    const addbackRows  = rowsToInsert.filter(r => r.__addback).map(({__addback, ...rest}) => rest);

    if (indirectRows.length) {
      const { error } = await client.from('indirect_lines').insert(indirectRows);
      if (error) throw error;
    }
    if (addbackRows.length) {
      const { error } = await client.from('addback_lines').insert(addbackRows);
      if (error) throw error;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => msg.textContent = '', 1800);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Save failed: ' + (err.message || err);
  }
}

/* -------------------------------------------------------------
   Helpers (unchanged)
   ------------------------------------------------------------- */
function monthsForYear(y) {
  return Array.from({length:12}, (_,i) => {
    const d = new Date(Date.UTC(y, i, 1));
    return { ym: d.toISOString().slice(0,10) };
  });
}
function groupLines(rows) {
  const byLabel = {};
  rows.forEach(r => {
    const k = r.label || '(no label)';
    const m = r.ym.slice(0,7);
    if (!byLabel[k]) byLabel[k] = { label: k, month: {} };
    byLabel[k].month[m] = Number(r.amount || 0);
  });
  return Object.values(byLabel);
}
function blankLine() { return { label: '', month: {} }; }
function fmtUSD0(v) {
  return Number(v||0).toLocaleString('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// render(), renderTable(), etc. → unchanged
