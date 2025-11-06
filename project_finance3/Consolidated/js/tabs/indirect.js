// js/tabs/indirect.js
import { $ } from '../lib/dom.js';
import { client, getCurrentYm } from '../api/supabase.js';

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Indirect Costs & Add-backs</h2>
      <div class="flex gap-2 items-center">
        <input id="indYear" type="number" class="border rounded-md p-1 w-28" />
        <button id="indReload" class="px-3 py-1.5 rounded-md border">Reload</button>
        <button id="indAddIndirect" class="px-3 py-1.5 rounded-md border">+ Indirect line</button>
        <button id="indAddAddback" class="px-3 py-1.5 rounded-md border">+ Add-back line</button>
        <button id="indSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white">Save</button>
      </div>
    </div>
    <div id="indMsg" class="text-sm text-slate-500"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <h3 class="font-semibold mb-2">Indirect costs</h3>
        <div class="overflow-x-auto">
          <table id="indIndirectTbl" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
        </div>
      </div>
      <div>
        <h3 class="font-semibold mb-2">Add-backs / Adjustments</h3>
        <div class="overflow-x-auto">
          <table id="indAddbackTbl" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
        </div>
      </div>
    </div>
  </div>
`;

let state = {
  year: new Date().getFullYear(),
  months: [],
  indirect: [],
  addbacks: [],
};

// Save root element so loadAll/saveAll can access it
let rootElement = null;

export async function init(root) {
  rootElement = root;  // ← Save root for later use

  const ym = getCurrentYm();
  state.year = Number(ym.slice(0, 4));
  state.months = monthsForYear(state.year);

  const yearInput = root.querySelector('#indYear');
  if (yearInput) yearInput.value = state.year;

  root.querySelector('#indReload').onclick = loadAll;
  root.querySelector('#indAddIndirect').onclick = () => {
    state.indirect.push(blankLine());
    render();
  };
  root.querySelector('#indAddAddback').onclick = () => {
    state.addbacks.push(blankLine());
    render();
  };
  root.querySelector('#indSave').onclick = saveAll;

  await loadAll();
}

/* -------------------------------------------------------------
   LOAD: Use .like('ym', 'YYYY-%') instead of .gte/.lte
   ------------------------------------------------------------- */
async function loadAll() {
  const msg = rootElement.querySelector('#indMsg') || $('#indMsg');
  msg.textContent = 'Loading…';

  const yearPattern = `${state.year}-%`; // e.g. "2025-%"

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
  if (e1) {
    msg.textContent = e1.message;
    return;
  }
  if (e2) {
    msg.textContent = e2.message;
    return;
  }

  state.indirect = groupLines(ind || []);
  state.addbacks = groupLines(ab || []);
  render();
  msg.textContent = '';
}

/* -------------------------------------------------------------
   SAVE: Use ym as 'YYYY-MM-01' (text-safe)
   ------------------------------------------------------------- */
async function saveAll() {
  const msg = rootElement.querySelector('#indMsg') || $('#indMsg');
  msg.textContent = 'Saving…';

  const mks = state.months.map(m => m.ym.slice(0, 7)); // ['2025-01', ...]
  const rowsToInsert = [];

  state.indirect.forEach(r => {
    const label = (r.label || '').trim();
    if (!label) return;
    mks.forEach(k => {
      const amt = Number(r.month[k] || 0);
      if (!amt) return;
      rowsToInsert.push({
        label,
        ym: k + '-01',
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
    await client.from('indirect_lines').delete().like('ym', `${state.year}-%`);
    await client.from('addback_lines').delete().like('ym', `${state.year}-%`);

    const indirectRows = rowsToInsert.filter(r => !r.__addback);
    const addbackRows = rowsToInsert.filter(r => r.__addback).map(({ __addback, ...rest }) => rest);

    if (indirectRows.length) {
      const { error } = await client.from('indirect_lines').insert(indirectRows);
      if (error) throw error;
    }
    if (addbackRows.length) {
      const { error } = await client.from('addback_lines').insert(addbackRows);
      if (error) throw error;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1800);
  } catch (err) {
    console.error(err);
    msg.textContent = 'Save failed: ' + (err.message || err);
  }
}

/* -------------------------------------------------------------
   RENDER
   ------------------------------------------------------------- */
function render() {
  renderTable('indIndirectTbl', state.indirect, false);
  renderTable('indAddbackTbl', state.addbacks, true);
}

function renderTable(elId, rows, isAddback) {
  const tbl = document.getElementById(elId);
  const mks = state.months.map(m => m.ym.slice(0, 7));
  let html = '<thead><tr>';
  html += '<th class="p-2 text-left sticky left-0 bg-white">Label</th>';
  mks.forEach(mk => (html += `<th class="p-2 text-right">${mk.slice(5)}</th>`));
  html += '<th class="p-2 text-right">Year Total</th>';
  html += '<th class="p-2"></th>';
  html += '</tr></thead><tbody>';

  rows.forEach((row, idx) => {
    const total = mks.reduce((s, k) => s + Number(row.month[k] || 0), 0);
    html += `<tr data-idx="${idx}">`;
    html += `<td class="p-2 sticky left-0 bg-white">
      <input class="lblInp border rounded-md p-1 w-48" value="${esc(row.label)}">
    </td>`;
    mks.forEach(k => {
      const v = row.month[k] ?? '';
      html += `<td class="p-1 text-right">
        <input data-k="${k}" class="amtInp border rounded-md p-1 w-20 text-right" type="number" step="0.01" min="0" value="${v}">
      </td>`;
    });
    html += `<td class="p-2 text-right font-medium">${fmtUSD0(total)}</td>`;
    html += `<td class="p-2">
      <button class="rowDel px-2 py-1 rounded-md border hover:bg-slate-50">X</button>
    </td>`;
    html += '</tr>';
  });

  const foot = mks.map(k => rows.reduce((s, r) => s + Number(r.month[k] || 0), 0));
  const totalYear = foot.reduce((s, x) => s + x, 0);
  html += `<tr class="font-semibold bg-slate-50">
    <td class="p-2 sticky left-0 bg-white">Totals</td>
    ${foot.map(v => `<td class="p-2 text-right">${fmtUSD0(v)}</td>`).join('')}
    <td class="p-2 text-right">${fmtUSD0(totalYear)}</td>
    <td class="p-2"></td>
  </tr>`;

  html += '</tbody>';
  tbl.innerHTML = html;

  tbl.querySelectorAll('.lblInp').forEach(inp => {
    inp.addEventListener('change', e => {
      const row = rows[e.target.closest('tr').dataset.idx];
      row.label = e.target.value;
    });
  });
  tbl.querySelectorAll('.amtInp').forEach(inp => {
    inp.addEventListener('change', e => {
      const tr = e.target.closest('tr');
      const row = rows[tr.dataset.idx];
      const k = e.target.dataset.k;
      const val = e.target.value;
      row.month[k] = val === '' ? '' : Number(val);
      render();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
    });
  });
  tbl.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.closest('tr').dataset.idx;
      rows.splice(idx, 1);
      render();
    });
  });
}

/* -------------------------------------------------------------
   Helpers
   ------------------------------------------------------------- */
function monthsForYear(y) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, i, 1));
    return { ym: d.toISOString().slice(0, 10) };
  });
}

function groupLines(rows) {
  const byLabel = {};
  rows.forEach(r => {
    const k = r.label || '(no label)';
    const m = r.ym.slice(0, 7);
    if (!byLabel[k]) byLabel[k] = { label: k, month: {} };
    byLabel[k].month[m] = Number(r.amount || 0);
  });
  return Object.values(byLabel);
}

function blankLine() {
  return { label: '', month: {} };
}

function fmtUSD0(v) {
  return Number(v || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
