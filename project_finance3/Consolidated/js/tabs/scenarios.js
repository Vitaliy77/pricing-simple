// js/tabs/scenarios.js
import { client } from '../api/supabase.js';
import { reloadConsol } from './consol-pl.js';   // <-- we will expose this later

const SCENARIO_ID_KEY = 'activeScenarioId';

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Scenarios / What-ifs</h2>
      <button id="newScenario" class="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm">
        + New Scenario
      </button>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- Scenario list -->
    <div id="list" class="space-y-2"></div>

    <!-- Editor (hidden until a scenario is selected) -->
    <div id="editor" class="hidden space-y-4 border-t pt-4">
      <div class="flex gap-2">
        <input id="scName" placeholder="Scenario name" class="flex-1 border rounded px-2 py-1 text-sm">
        <textarea id="scDesc" placeholder="Description (optional)" rows="2"
                  class="flex-1 border rounded px-2 py-1 text-sm"></textarea>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs text-slate-500 mb-1">Shift revenue (months)</label>
          <input id="shiftRev" type="number" min="-12" max="12" value="0"
                 class="w-full border rounded px-2 py-1 text-sm">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Shift cost (months)</label>
          <input id="shiftCost" type="number" min="-12" max="12" value="0"
                 class="w-full border rounded px-2 py-1 text-sm">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Add monthly OH ($)</label>
          <input id="monthlyOH" type="number" step="100" value="0"
                 class="w-full border rounded px-2 py-1 text-sm">
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Monthly adjustments</span>
          <button id="addRow" class="text-xs text-blue-600 hover:underline">+ Add row</button>
        </div>
        <table id="adjTable" class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="p-1 text-left">Month</th>
              <th class="p-1 text-right">Rev $</th>
              <th class="p-1 text-right">Rev %</th>
              <th class="p-1 text-right">Cost $</th>
              <th class="p-1 text-right">Cost %</th>
              <th class="p-1"></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="flex gap-2">
        <button id="saveScenario" class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm">
          Save Scenario
        </button>
        <button id="activateScenario" class="px-3 py-1.5 rounded-md border text-sm">
          Activate (apply to P&L)
        </button>
        <button id="deleteScenario" class="px-3 py-1.5 rounded-md border border-red-600 text-red-600 text-sm">
          Delete
        </button>
      </div>
    </div>
  </div>
`;

let rootEl = null;
let current = null;               // {id, name, description, lines:[]}
let baseYear = null;              // current selected year

export async function init(root) {
  rootEl = root;
  baseYear = new Date().getUTCFullYear();

  // year selector (reuse consol logic)
  const yearSel = document.createElement('select');
  yearSel.id = 'scYear';
  yearSel.className = 'border rounded-md p-1 text-sm';
  for (let y = baseYear - 1; y <= baseYear + 1; y++) {
    const o = document.createElement('option');
    o.value = y; o.text = y;
    if (y === baseYear) o.selected = true;
    yearSel.appendChild(o);
  }
  yearSel.addEventListener('change', () => {
    baseYear = Number(yearSel.value);
    if (current) loadLines(current.id);
  });
  root.querySelector('#newScenario').before(yearSel);

  root.querySelector('#newScenario').addEventListener('click', newScenario);
  root.querySelector('#addRow').addEventListener('click', addEmptyRow);
  root.querySelector('#saveScenario').addEventListener('click', saveScenario);
  root.querySelector('#activateScenario').addEventListener('click', activateScenario);
  root.querySelector('#deleteScenario').addEventListener('click', deleteScenario);

  await loadScenarioList();
  const urlId = new URLSearchParams(location.hash.split('?')[1]).get('active');
  if (urlId) await activateById(urlId);
}

/* ------------------------------------------------------------------ */
/*  LIST                                                              */
/* ------------------------------------------------------------------ */
async function loadScenarioList() {
  const { data, error } = await client.from('scenarios').select('id,name,description');
  if (error) { msg(error.message); return; }
  const list = rootEl.querySelector('#list');
  list.innerHTML = '';
  data.forEach(sc => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 border rounded cursor-pointer hover:bg-slate-50';
    div.innerHTML = `
      <div>
        <div class="font-medium">${esc(sc.name)}</div>
        <div class="text-xs text-slate-500">${esc(sc.description || '—no description—')}</div>
      </div>
      <button class="text-xs text-blue-600 hover:underline loadBtn" data-id="${sc.id}">Edit</button>
    `;
    div.querySelector('.loadBtn').addEventListener('click', () => loadScenario(sc.id));
    list.appendChild(div);
  });
}

/* ------------------------------------------------------------------ */
/*  EDITOR                                                            */
/* ------------------------------------------------------------------ */
async function loadScenario(id) {
  const { data: sc, error: e1 } = await client.from('scenarios').select('*').eq('id', id).single();
  if (e1) { msg(e1.message); return; }
  current = { id: sc.id, name: sc.name, description: sc.description, lines: [] };
  rootEl.querySelector('#editor').classList.remove('hidden');
  rootEl.querySelector('#scName').value = sc.name;
  rootEl.querySelector('#scDesc').value = sc.description || '';
  await loadLines(id);
}
async function loadLines(scId) {
  const start = `${baseYear}-01-01`, end = `${baseYear + 1}-01-01`;
  const { data, error } = await client
    .from('scenario_lines')
    .select('*')
    .eq('scenario_id', scId)
    .gte('ym', start)
    .lt('ym', end)
    .order('ym');
  if (error) { msg(error.message); return; }
  current.lines = data || [];
  renderLines();
}
function renderLines() {
  const tbody = rootEl.querySelector('#adjTable tbody');
  tbody.innerHTML = '';
  const months = Array.from({ length: 12 }, (_, i) => `${baseYear}-${String(i + 1).padStart(2, '0')}-01`);
  current.lines.forEach(ln => {
    const tr = document.createElement('tr');
    const m = ln.ym.slice(0, 7);
    tr.innerHTML = `
      <td class="p-1">${monthShort(m)}</td>
      <td class="p-1"><input type="number" class="w-20 text-right border rounded px-1" value="${ln.rev_delta||0}"></td>
      <td class="p-1"><input type="number" step="0.1" class="w-20 text-right border rounded px-1" value="${ln.rev_pct||0}"></td>
      <td class="p-1"><input type="number" class="w-20 text-right border rounded px-1" value="${ln.cost_delta||0}"></td>
      <td class="p-1"><input type="number" step="0.1" class="w-20 text-right border rounded px-1" value="${ln.cost_pct||0}"></td>
      <td class="p-1"><button class="text-xs text-red-600 hover:underline removeRow">×</button></td>
    `;
    const inputs = tr.querySelectorAll('input');
    inputs.forEach((inp, idx) => inp.addEventListener('change', () => {
      const vals = ['rev_delta','rev_pct','cost_delta','cost_pct'];
      ln[vals[idx]] = Number(inp.value) || 0;
    }));
    tr.querySelector('.removeRow').addEventListener('click', () => {
      current.lines = current.lines.filter(l => l.id !== ln.id);
      renderLines();
    });
    tbody.appendChild(tr);
  });
  // fill missing months with empty rows (optional)
  const existing = current.lines.map(l => l.ym.slice(0,7));
  months.forEach(ym => {
    if (!existing.includes(ym)) addEmptyRow(ym);
  });
}
function addEmptyRow(ym = null) {
  const month = ym || `${baseYear}-${String(current.lines.length % 12 + 1).padStart(2,'0')}-01`;
  current.lines.push({
    id: crypto.randomUUID(),
    scenario_id: current.id,
    ym: month,
    rev_delta: 0, rev_pct: 0, cost_delta: 0, cost_pct: 0, oh_delta: 0
  });
  renderLines();
}

/* ------------------------------------------------------------------ */
/*  SAVE / DELETE                                                     */
/* ------------------------------------------------------------------ */
async function saveScenario() {
  if (!current) return;
  const name = rootEl.querySelector('#scName').value.trim();
  const desc = rootEl.querySelector('#scDesc').value.trim();
  if (!name) { msg('Name required'); return; }

  const { data: sc, error: e1 } = await client
    .from('scenarios')
    .upsert({ id: current.id, name, description: desc }, { onConflict: 'id' })
    .select()
    .single();
  if (e1) { msg(e1.message); return; }

  // delete old lines, insert new
  await client.from('scenario_lines').delete().eq('scenario_id', sc.id);
  const lines = current.lines.map(l => ({
    scenario_id: sc.id,
    ym: l.ym,
    rev_delta: l.rev_delta,
    rev_pct: l.rev_pct,
    cost_delta: l.cost_delta,
    cost_pct: l.cost_pct,
    oh_delta: Number(rootEl.querySelector('#monthlyOH').value) || 0
  }));
  if (lines.length) {
    const { error: e2 } = await client.from('scenario_lines').insert(lines);
    if (e2) { msg(e2.message); return; }
  }

  // apply global shifts
  const shiftRev = Number(rootEl.querySelector('#shiftRev').value) || 0;
  const shiftCost = Number(rootEl.querySelector('#shiftCost').value) || 0;
  if (shiftRev || shiftCost) await applyShifts(sc.id, shiftRev, shiftCost);

  msg('Saved');
  await loadScenarioList();
}
async function applyShifts(scId, revMo, costMo) {
  // simple shift: move all rev/cost rows by N months (wrap around year)
  const { data } = await client.from('scenario_lines').select('*').eq('scenario_id', scId);
  const shifted = data.map(l => {
    const d = new Date(l.ym);
    if (revMo) d.setMonth(d.getMonth() + revMo);
    if (costMo) d.setMonth(d.getMonth() + costMo);
    const newYm = d.toISOString().slice(0,10);
    return { ...l, ym: newYm };
  });
  await client.from('scenario_lines').delete().eq('scenario_id', scId);
  await client.from('scenario_lines').insert(shifted);
}

/* ------------------------------------------------------------------ */
/*  ACTIVATE (push to P&L)                                            */
/* ------------------------------------------------------------------ */
async function activateScenario() {
  if (!current) return;
  const url = new URL(location);
  url.hash = `#scenarios?active=${current.id}`;
  history.replaceState(null, '', url);
  sessionStorage.setItem(SCENARIO_ID_KEY, current.id);
  msg('Scenario activated – P&L will reflect it on next load');
  // force consol tab reload
  if (typeof reloadConsol === 'function') reloadConsol();
}
async function activateById(id) {
  await loadScenario(id);
  rootEl.querySelector('#activateScenario').click();
}

/* ------------------------------------------------------------------ */
/*  NEW / DELETE                                                      */
/* ------------------------------------------------------------------ */
function newScenario() {
  current = { id: crypto.randomUUID(), name: '', description: '', lines: [] };
  rootEl.querySelector('#editor').classList.remove('hidden');
  rootEl.querySelector('#scName').value = '';
  rootEl.querySelector('#scDesc').value = '';
  rootEl.querySelector('#shiftRev').value = 0;
  rootEl.querySelector('#shiftCost').value = 0;
  rootEl.querySelector('#monthlyOH').value = 0;
  renderLines();
}
async function deleteScenario() {
  if (!current) return;
  if (!confirm('Delete this scenario?')) return;
  await client.from('scenario_lines').delete().eq('scenario_id', current.id);
  await client.from('scenarios').delete().eq('id', current.id);
  current = null;
  rootEl.querySelector('#editor').classList.add('hidden');
  await loadScenarioList();
  sessionStorage.removeItem(SCENARIO_ID_KEY);
  msg('Deleted');
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */
function msg(txt) { rootEl.querySelector('#msg').textContent = txt; }
function monthShort(ym) {                     // '2025-01' → 'Jan'
  const [y,m] = ym.split('-');
  return new Date(y, m-1, 1).toLocaleString('en-US', {month:'short'});
}
function esc(s) { return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ------------------------------------------------------------------ */
/*  Export tab (router)                                               */
/* ------------------------------------------------------------------ */
export const scenariosTab = { template, init };
