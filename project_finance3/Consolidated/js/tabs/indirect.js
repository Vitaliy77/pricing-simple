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
    <div id="indMsg" class="text-sm text-slate-600"></div>
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <h3 class="font-medium mb-2">Indirect</h3>
        <div id="indirectTable" class="overflow-auto border rounded-lg"></div>
      </div>
      <div>
        <h3 class="font-medium mb-2">Add-backs</h3>
        <div id="addbacksTable" class="overflow-auto border rounded-lg"></div>
      </div>
    </div>
  </div>
`;

/* -------------------------------------------------------------
   Local state
------------------------------------------------------------- */
const state = {
  year: null,
  months: [],
  indirect: [],
  addbacks: [],
  hasLabel: true,
};

let rootElement = null;

/* -------------------------------------------------------------
   Init & wiring
------------------------------------------------------------- */
export async function init(root) {
  rootElement = root;
  const ym = getCurrentYm();
  state.year = Number(ym.slice(0, 4));
  state.months = monthsForYear(state.year);

  const yearInput = root.querySelector('#indYear');
  if (yearInput) yearInput.value = state.year;

  root.querySelector('#indReload')?.addEventListener('click', loadAll);
  root.querySelector('#indSave')?.addEventListener('click', saveAll);
  root.querySelector('#indAddIndirect')?.addEventListener('click', () => {
    state.indirect.push(blankLine());
    render();
  });
  root.querySelector('#indAddAddback')?.addEventListener('click', () => {
    state.addbacks.push(blankLine());
    render();
  });

  await loadAll();
}

/* -------------------------------------------------------------
   Load: DATE ranges, auto-fallback if 'label' column missing
------------------------------------------------------------- */
export async function loadAll() {
  const msg = rootElement.querySelector('#indMsg') || $('#indMsg');
  msg.textContent = 'Loading…';

  const yearInput = rootElement.querySelector('#indYear');
  const pickedYear = Number(yearInput?.value);
  if (pickedYear && pickedYear !== state.year) {
    state.year = pickedYear;
    state.months = monthsForYear(state.year);
  }

  const start = `${state.year}-01-01`;
  const next = `${state.year + 1}-01-01`;

  try {
    const trySelect = async (table) => {
      let q = client.from(table).select('id,label,ym,amount').gte('ym', start).lt('ym', next);
      let { data, error } = await q;
      if (error && labelMissing(error)) {
        state.hasLabel = false;
        const q2 = client.from(table).select('id,ym,amount').gte('ym', start).lt('ym', next);
        const r2 = await q2;
        data = r2.data; error = r2.error;
      }
      if (error) throw error;
      return data || [];
    };

    const [indRows, abRows] = await Promise.all([
      trySelect('indirect_lines'),
      trySelect('addback_lines'),
    ]);

    state.indirect = groupLines(indRows, state.hasLabel);
    state.addbacks = groupLines(abRows, state.hasLabel);
    render();
    msg.textContent = `Loaded ${state.indirect.length + state.addbacks.length} lines for ${state.year}.`;
  } catch (e) {
    console.error(e);
    msg.textContent = 'Load error: ' + (e?.message || e);
    if (!state.indirect.length) state.indirect = [blankLine()];
    if (!state.addbacks.length) state.addbacks = [blankLine()];
    render();
  }
}

/* -------------------------------------------------------------
   Save: delete by DATE range, then bulk insert
------------------------------------------------------------- */
export async function saveAll() {
  const msg = rootElement.querySelector('#indMsg') || $('#indMsg');
  msg.textContent = 'Saving…';

  const yearInput = rootElement.querySelector('#indYear');
  const pickedYear = Number(yearInput?.value);
  if (pickedYear && pickedYear !== state.year) {
    state.year = pickedYear;
    state.months = monthsForYear(state.year);
  }

  const start = `${state.year}-01-01`;
  const next = `${state.year + 1}-01-01`;
  const monthKeys = state.months.map(m => m.key);

  const rowsIndirect = [];
  const rowsAddbacks = [];

  const pushRow = (arr, label, ymKey, amt) => {
    if (!amt) return;
    const ym = `${ymKey}-01`;
    if (state.hasLabel) {
      arr.push({ label, ym, amount: amt });
    } else {
      arr.push({ ym, amount: amt });
    }
  };

  for (const r of state.indirect) {
    const label = (r.label || '').trim();
    if (state.hasLabel && !label) continue;
    for (const k of monthKeys) {
      const amt = num(r.month?.[k]);
      if (amt) pushRow(rowsIndirect, label, k, amt);
    }
  }

  for (const r of state.addbacks) {
    const label = (r.label || '').trim();
    if (state.hasLabel && !label) continue;
    for (const k of monthKeys) {
      const amt = num(r.month?.[k]);
      if (amt) pushRow(rowsAddbacks, label, k, amt);
    }
  }

  try {
    const deleteYear = async (table) => {
      const { error } = await client.from(table).delete().gte('ym', start).lt('ym', next);
      if (error && !tableMissing(error)) throw error;
    };

    await deleteYear('indirect_lines');
    await deleteYear('addback_lines');

    if (rowsIndirect.length) {
      const { error } = await client.from('indirect_lines').insert(rowsIndirect);
      if (error) throw error;
    }
    if (rowsAddbacks.length) {
      const { error } = await client.from('addback_lines').insert(rowsAddbacks);
      if (error) throw error;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1800);
  } catch (e) {
    console.error(e);
    msg.textContent = 'Save failed: ' + (e?.message || e);
  }
}

/* -------------------------------------------------------------
   Render
------------------------------------------------------------- */
function render() {
  const indEl = rootElement.querySelector('#indirectTable');
  const abEl = rootElement.querySelector('#addbacksTable');
  indEl.innerHTML = buildTableHTML(state.indirect, state.months, { title: 'Indirect' });
  abEl.innerHTML = buildTableHTML(state.addbacks, state.months, { title: 'Add-backs' });
  wireTable(indEl, state.indirect);
  wireTable(abEl, state.addbacks);
}

function buildTableHTML(rows, months, opts = {}) {
  const headMonths = months.map(m => `<th class="text-right px-2 py-2 whitespace-nowrap">${esc(m.short)}</th>`).join('');
  const body = rows.map((r, i) => {
    const labelCell = `<input data-row="${i}" data-field="label" class="border rounded px-2 py-1 w-full" value="${esc(r.label || '')}" ${state.hasLabel ? '' : 'placeholder="(label omitted)"'} />`;
    const monthCells = months.map(m => {
      const val = r.month?.[m.key] ?? '';
      return `<td class="px-2 py-1 text-right">
        <input data-row="${i}" data-month="${m.key}" class="border rounded px-2 py-1 w-28 text-right" value="${fmtUSD0(val)}" />
      </td>`;
    }).join('');
    const total = fmtUSD0(sum(Object.values(r.month || {})));
    return `<tr>
      <td class="px-2 py-1 w-56">${labelCell}</td>
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
          ${headMonths}
          <th class="text-right px-2 py-2">Total</th>
          <th class="px-2 py-2"></th>
        </tr>
      </thead>
      <tbody>${body || `<tr><td colspan="${months.length + 3}" class="px-2 py-10 text-center text-slate-500">No lines — add one</td></tr>`}</tbody>
    </table>
  `;
}

function wireTable(container, rowsRef) {
  container.querySelectorAll('input[data-field="label"]').forEach(inp => {
    inp.addEventListener('change', e => {
      const idx = Number(e.target.dataset.row);
      rowsRef[idx].label = e.target.value.trim();
    });
  });

  container.querySelectorAll('input[data-month]').forEach(inp => {
    const update = () => {
      const idx = Number(inp.dataset.row);
      const key = inp.dataset.month;
      const v = parseMoney(inp.value);
      rowsRef[idx].month[key] = v;

      const tr = inp.closest('tr');
      const totalCell = tr?.querySelector('td:nth-last-child(2)');
      if (totalCell) {
        totalCell.textContent = fmtUSD0(sum(Object.values(rowsRef[idx].month)));
      }
    };

    inp.addEventListener('change', update);
    inp.addEventListener('blur', update);
  });

  container.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.del);
      rowsRef.splice(idx, 1);
      render();
    });
  });
}

/* -------------------------------------------------------------
   Helpers
------------------------------------------------------------- */
function monthsForYear(year) {
  const arr = [];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(year, m, 1));
    const key = d.toISOString().slice(0, 7);
    const ym = `${key}-01`;
    arr.push({ ym, key, short: monthNames[m] });
  }
  return arr;
}

function blankLine() {
  return { label: '', month: {} };
}

function groupLines(rows, hasLabel = true) {
  const map = new Map();
  for (const r of rows) {
    const key = hasLabel ? (r.label || '') : 'line';
    if (!map.has(key)) map.set(key, { label: hasLabel ? key : '', month: {} });
    const obj = map.get(key);
    const ymKey = String(r.ym).slice(0, 7);
    obj.month[ymKey] = (obj.month[ymKey] || 0) + Number(r.amount || 0);
  }
  return Array.from(map.values());
}

function labelMissing(error) {
  return error && (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    /column .*label.* does not exist/i.test(error.message || '')
  );
}

function tableMissing(error) {
  return error && (
    error.code === '42P01' ||
    /relation .* does not exist/i.test(error.message || '')
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sum(arr) {
  let s = 0;
  for (const v of arr) s += Number(v || 0);
  return s;
}

function parseMoney(s) {
  if (s == null) return 0;
  const str = String(s).replace(/[, $]/g, '');
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

function fmtUSD0(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
