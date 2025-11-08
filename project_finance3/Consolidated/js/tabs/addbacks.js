// js/tabs/addbacks.js
import { $ } from '../lib/dom.js';
import { client, getCurrentYm } from '../api/supabase.js';

// Your scenario ID
const SCENARIO_ID = '3857bc3c-78d5-42f6-8fbb-493ce34063f2';

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
  rows: [],
  hasLabel: true
};

let rootEl = null;

export async function init(root) {
  rootEl = root;
  const ym = getCurrentYm();
  state.year = Number(ym.slice(0, 4));
  state.months = monthsForYear(state.year);
  root.querySelector('#abYear').value = state.year;

  root.querySelector('#abReload')?.addEventListener('click', loadAll);
  root.querySelector('#abAddLine')?.addEventListener('click', () => {
    state.rows.push(blankLine());
    render();
  });
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
  const next = `${state.year + 1}-01-01`;

  try {
    const { data, error } = await client
      .from('addback_lines')
      .select('id,label,ym,amount')
      .eq('scenario_id', SCENARIO_ID)
      .gte('ym', start)
      .lt('ym', next);

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows — treat as empty
        state.rows = [];
      } else {
        throw error;
      }
    } else {
      state.rows = groupLines(data || []);
    }

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
  const next = `${state.year + 1}-01-01`;
  const monthKeys = state.months.map(m => m.key);
  const rowsToInsert = [];

  const pushRow = (label, ymKey, amt) => {
    if (!amt) return;
    if (!label || label.trim() === '') {
      throw new Error('Label is required for add-back lines');
    }
    const ym = `${ymKey}-01`;
    const amountNum = Number(amt);

    rowsToInsert.push({
      scenario_id: SCENARIO_ID,
      label: label.trim(),
      ym: ym,
      amount: amountNum
    });
  };

  for (const r of state.rows) {
    const label = (r.label || '').trim();
    if (!label) continue;
    for (const k of monthKeys) {
      const amt = toNum(r.month?.[k]);
      if (amt) pushRow(label, k, amt);
    }
  }

  try {
    // Delete old
    const { error: delError } = await client
      .from('addback_lines')
      .delete()
      .eq('scenario_id', SCENARIO_ID)
      .gte('ym', start)
      .lt('ym', next);

    if (delError) throw delError;

    // Insert new
    if (rowsToInsert.length) {
      const { error } = await client.from('addback_lines').insert(rowsToInsert);
      if (error) throw error;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1500);
  } catch (e) {
    console.error(e);
    msg.textContent = 'Save failed: ' + (e?.message || e);
  }
}

function render() {
  const table = rootEl.querySelector('#abTable');
  table.innerHTML = buildTableHTML(state.rows, state.months);
  wire(table, state.rows);
}

function buildTableHTML(rows, months) {
  const monthHeads = months.map(m => `<th class="text-right px-2 py-2">${m.short}</th>`).join('');
  const body = rows.map((r, i) => {
    const labelInput = `<input data-row="${i}" data-field="label" class="border rounded px-2 py-1 w-80" placeholder="Required: Enter description..." value="${esc(r.label || '')}" required />`;
    const monthCells = months.map(m => {
      const val = fmt0(r.month?.[m.key]);
      return `<td class="px-2 py-1 text-right">
        <input data-row="${i}" data-month="${m.key}" class="border rounded px-2 py-1 w-28 text-right" value="${val}" />
      </td>`;
    }).join('');
    const total = fmt0(sum(Object.values(r.month || {})));
    return `<tr>
      <td class="px-2 py-1">${labelInput}</td>
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
          <th class="text-left px-2 py-2 w-80">Description (Required)</th>
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
    inp.addEventListener('change', e => {
      const idx = Number(e.target.dataset.row);
      rowsRef[idx].label = e.target.value.trim();
    });
  });

  container.querySelectorAll('input[data-month]').forEach(inp => {
    const update = () => {
      const idx = Number(inp.dataset.row);
      const key = inp.dataset.month;
      rowsRef[idx].month[key] = parseMoney(inp.value);
      const tr = inp.closest('tr');
      const totalCell = tr?.querySelector('td:nth-last-child(2)');
      if (totalCell) totalCell.textContent = fmt0(sum(Object.values(rowsRef[idx].month)));
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

/* --------------------- EXPORT TAB --------------------- */
export const addbacksTab = {
  template,
  async init(root) {
    rootEl = root;
    const ym = getCurrentYm();
    state.year = Number(ym.slice(0, 4));
    state.months = monthsForYear(state.year);
    root.querySelector('#abYear').value = state.year;

    root.querySelector('#abReload')?.addEventListener('click', loadAll);
    root.querySelector('#abAddLine')?.addEventListener('click', () => {
      state.rows.push(blankLine());
      render();
    });
    root.querySelector('#abSave')?.addEventListener('click', saveAll);

    await loadAll();
  }
};

/* --------------------- HELPERS --------------------- */
function monthsForYear(year) {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, i, 1));
    const key = d.toISOString().slice(0, 7);
    return { ym: `${key}-01`, key, short: names[i] };
  });
}

function blankLine() {
  return { label: '', month: {} };
}

function groupLines(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.label || 'unnamed';
    if (!map.has(key)) {
      map.set(key, { label: r.label || '', month: {} });
    }
    const obj = map.get(key);
    const ymKey = String(r.ym).slice(0, 7);
    obj.month[ymKey] = (obj.month[ymKey] || 0) + Number(r.amount || 0);
  }
  return Array.from(map.values());
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sum(obj) {
  return Object.values(obj).reduce((s, v) => s + Number(v || 0), 0);
}

function parseMoney(s) {
  const t = String(s ?? '').replace(/[, $]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function fmt0(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
