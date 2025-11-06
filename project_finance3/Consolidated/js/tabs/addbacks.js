// js/tabs/addbacks.js
import { $ } from '../lib/dom.js';
import { client, getCurrentYm } from '../api/supabase.js';

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Add-backs</h2>
      <div class="flex gap-2 items-center">
        <input id="abYear" type="number" class="border rounded-md p-1 w-28" />
        <button id="abReload" class="px-3 py-1.5 rounded-md border">Reload</button>
        <button id="abAddLine" class="px-3 py-1.5 rounded-md border">+ Add-back line</button>
        <button id="abSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white">Save</button>
      </div>
    </div>
    <div id="abMsg" class="text-sm text-slate-600"></div>
    <div id="abTable" class="overflow-auto border rounded-lg"></div>
  </div>
`;

const state = {
  year: null,
  months: [],
  rows: [],      // [{ label, month: { 'YYYY-MM': number } }]
  hasLabel: true // auto-detect: if label col missing, we omit it
};

let rootEl = null;

export async function init(root) {
  rootEl = root;
  const ym = getCurrentYm();                 // e.g., "2025-03"
  state.year = Number(ym.slice(0,4));
  state.months = monthsForYear(state.year);
  root.querySelector('#abYear').value = state.year;

  root.querySelector('#abReload')?.addEventListener('click', loadAll);
  root.querySelector('#abAddLine')?.addEventListener('click', () => { state.rows.push(blankLine()); render(); });
  root.querySelector('#abSave')?.addEventListener('click', saveAll);

  await loadAll();
}

export async function loadAll() {
  const msg = rootEl.querySelector('#abMsg');
  msg.textContent = 'Loading…';

  const picked = Number(rootEl.querySelector('#abYear')?.value);
  if (picked && picked !== state.year) {
    state.year = picked;
    state.months = monthsForYear(state.year);
  }
  const start = `${state.year}-01-01`;
  const next  = `${state.year+1}-01-01`;

  try {
    // try with label; fall back to no label if missing
    let { data, error } = await client.from('addback_lines')
      .select('id,label,ym,amount')
      .gte('ym', start).lt('ym', next);

    if (labelMissing(error)) {
      state.hasLabel = false;
      const r2 = await client.from('addback_lines')
        .select('id,ym,amount')
        .gte('ym', start).lt('ym', next);
      data = r2.data; error = r2.error;
    }
    if (error) throw error;

    state.rows = groupLines(data || [], state.hasLabel);
    render();
    msg.textContent = `Loaded ${state.rows.length} lines for ${state.year}.`;
  } catch (e) {
    console.error(e);
    msg.textContent = 'Load error: ' + (e?.message || e);
    if (!state.rows.length) state.rows = [blankLine()];
    render();
  }
}

export async function saveAll() {
  const msg = rootEl.querySelector('#abMsg');
  msg.textContent = 'Saving…';

  const picked = Number(rootEl.querySelector('#abYear')?.value);
  if (picked && picked !== state.year) {
    state.year = picked;
    state.months = monthsForYear(state.year);
  }
  const start = `${state.year}-01-01`;
  const next  = `${state.year+1}-01-01`;

  const monthKeys = state.months.map(m => m.key);
  const rowsToInsert = [];

  const pushRow = (label, ymKey, amt) => {
    if (!amt) return;
    const ym = `${ymKey}-01`;
    rowsToInsert.push(state.hasLabel ? { label, ym, amount: amt } : { ym, amount: amt });
  };

  for (const r of state.rows) {
    const label = (r.label || '').trim();
    if (state.hasLabel && !label) continue;
    for (const k of monthKeys) {
      const amt = toNum(r.month?.[k]);
      if (amt) pushRow(label, k, amt);
    }
  }

  try {
    // delete this year's rows
    {
      const { error } = await client.from('addback_lines').delete().gte('ym', start).lt('ym', next);
      if (error && !tableMissing(error)) throw error;
    }
    // insert new ones
    if (rowsToInsert.length) {
      const { error } = await client.from('addback_lines').insert(rowsToInsert);
      if (error) throw error;
    }
    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent=''), 1500);
  } catch (e) {
    console.error(e);
    msg.textContent = 'Save failed: ' + (e?.message || e);
  }
}

function render() {
  const table = rootEl.querySelector('#abTable');
  table.innerHTML = buildTableHTML(state.rows, state.months, state.hasLabel);
  wire(table, state.rows);
}

function buildTableHTML(rows, months, showLabel) {
  const monthHeads = months.map(m => `<th class="text-right px-2 py-2">${m.short}</th>`).join('');
  const body = rows.map((r, i) => {
    const labelInput = showLabel
      ? `<input data-row="${i}" data-field="label" class="border rounded px-2 py-1 w-full" value="${esc(r.label||'')}" />`
      : `<span class="text-slate-400">(label omitted)</span>`;
    const monthCells = months.map(m => {
      const val = fmt0(r.month?.[m.key]);
      return `<td class="px-2 py-1 text-right">
        <input data-row="${i}" data-month="${m.key}" class="border rounded px-2 py-1 w-28 text-right" value="${val}" />
      </td>`;
    }).join('');
    const total = fmt0(sum(Object.values(r.month||{})));
    return `<tr>
      <td class="px-2 py-1 w-56">${labelInput}</td>
      ${monthCells}
      <td class="px-2 py-1 text-right font-medium">${total}</td>
      <td class="px-2 py-1 text-right">
        <button data-del="${i}" class="text-red-600 hover:underline">Delete</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <table class="min-w-full text-sm">
      <thead class="bg-slate-50 sticky top-0">
        <tr>
          <th class="text-left px-2 py-2">Label</th>
          ${monthHeads}
          <th class="text-right px-2 py-2">Total</th>
          <th class="px-2 py-2"></th>
        </tr>
      </thead>
      <tbody>${body || `<tr><td colspan="${months.length + 3}" class="px-2 py-10 text-center text-slate-500">No lines — add one</td></tr>`}</tbody>
    </table>
  `;
}

function wire(container, rowsRef) {
  container.querySelectorAll('input[data-field="label"]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = Number(e.target.dataset.row);
      rowsRef[idx].label = e.target.value;
    });
  });
  container.querySelectorAll('input[data-month]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = Number(e.target.dataset.row);
      const key = e.target.dataset.month; // 'YYYY-MM'
      const v = parseMoney(e.target.value);
      rowsRef[idx].month[key] = v;
      const tr = e.target.closest('tr');
      const totalCell = tr?.querySelector('td:nth-last-child(2)');
      if (totalCell) totalCell.textContent = fmt0(sum(Object.values(rowsRef[idx].month)));
    });
  });
  container.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = Number(e.currentTarget.dataset.del);
      rowsRef.splice(idx, 1);
      render();
    });
  });
}

/* helpers */
function monthsForYear(year) {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return [...Array(12)].map((_, m) => {
    const d = new Date(Date.UTC(year, m, 1));
    const key = d.toISOString().slice(0,7);
    return { ym: `${key}-01`, key, short: names[m] };
  });
}
function blankLine() { return { label: '', month: {} }; }
function groupLines(rows, hasLabel=true) {
  const map = new Map();
  for (const r of rows) {
    const k = hasLabel ? (r.label || '') : 'line';
    if (!map.has(k)) map.set(k, { label: hasLabel ? k : '', month: {} });
    const key = String(r.ym).slice(0,7);
    map.get(k).month[key] = (map.get(k).month[key] || 0) + Number(r.amount || 0);
  }
  return [...map.values()];
}
function labelMissing(err) {
  return err && (err.code === 'PGRST204' || err.code === '42703' || /label.*does not exist/i.test(err.message||''));
}
function tableMissing(err) {
  return err && (err.code === '42P01' || /relation .* does not exist/i.test(err.message||''));
}
function toNum(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function sum(a){ let s=0; for (const v of a) s += Number(v||0); return s; }
function parseMoney(s){ const t=String(s??'').replace(/[, $]/g,''); const n=Number(t); return Number.isFinite(n)?n:0; }
function fmt0(v){ const n=Number(v||0); if(!Number.isFinite(n)) return ''; return n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}); }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
