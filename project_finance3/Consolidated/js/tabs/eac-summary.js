// js/tabs/eac-summary.js
import { client } from '../api/supabase.js';

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">EAC Summary – Revenue & Margin by Project</h2>
      <div class="flex gap-2 items-center">
        <label class="text-sm text-slate-500">Year:</label>
        <select id="eacYear" class="border rounded-md p-1 text-sm"></select>
        <button id="eacReload" class="px-3 py-1.5 rounded-md border hover:bg-slate-50 text-sm">
          Reload
        </button>
      </div>
    </div>

    <div id="eacMsg" class="text-sm text-slate-500"></div>

    <div class="overflow-x-auto">
      <table id="eacTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>
  </div>
`;

const state = {
  year: new Date().getUTCFullYear(),
  projects: []
};

let rootEl = null;

export async function init(root) {
  rootEl = root;

  const sel = root.querySelector('#eacYear');
  const nowY = new Date().getUTCFullYear();

  for (let y = nowY - 1; y <= nowY + 1; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === nowY) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.addEventListener('change', () => load(Number(sel.value)));
  root.querySelector('#eacReload')?.addEventListener('click', () => load(state.year));

  await load(nowY);
}

async function load(year) {
  const msg = rootEl.querySelector('#eacMsg');
  const table = rootEl.querySelector('#eacTable');
  msg.textContent = 'Loading…';
  table.innerHTML = '';

  const start = `${year}-01-01`;
  const end   = `${year + 1}-01-01`;

  try {
    // 1. Pull ALL data from the single EAC view
    const { data: rows, error } = await client
      .from('vw_eac_revenue_monthly')
      .select('project_id, ym, revenue, labor, equip, materials, subs')
      .gte('ym', start)
      .lt('ym', end);

    if (error) throw error;

    // 2. Get project names
    const allIds = new Set(rows.map(r => r.project_id));
    const { data: nameRows } = await client
      .from('projects')
      .select('id, name')
      .in('id', Array.from(allIds));

    const nameMap = {};
    (nameRows || []).forEach(p => {
      nameMap[p.id] = p.name || `Project ${p.id.slice(0, 8)}`;
    });

    // 3. Build project map
    const projMap = new Map();

    const getProj = (pid) => {
      if (!projMap.has(pid)) {
        projMap.set(pid, {
          project_id: pid,
          name: nameMap[pid] || `Project ${pid.slice(0, 8)}`,
          months: {},
          totals: { rev: 0, dc: 0 }
        });
      }
      return projMap.get(pid);
    };

    // 4. Aggregate
    for (const r of rows) {
      const m = String(r.ym).slice(0, 7); // '2025-01'
      const p = getProj(r.project_id);

      p.months[m] = p.months[m] || { rev: 0, dc: 0 };
      p.months[m].rev += Number(r.revenue || 0);

      const dc = Number(r.labor || 0) + Number(r.equip || 0) +
                 Number(r.materials || 0) + Number(r.subs || 0);
      p.months[m].dc += dc;

      p.totals.rev += p.months[m].rev;
      p.totals.dc += dc;
    }

    state.projects = Array.from(projMap.values())
      .sort((a, b) => b.totals.rev - a.totals.rev);

    render();
    msg.textContent = `${state.projects.length} projects loaded for ${year}.`;
  } catch (e) {
    console.error(e);
    msg.textContent = 'Load error: ' + (e?.message || e);
  }
}

function render() {
  const table = rootEl.querySelector('#eacTable');
  if (!table) return;

  const months = Array.from({ length: 12 }, (_, i) => `${state.year}-${String(i + 1).padStart(2, '0')}`);

  let html = `<thead class="bg-slate-50 sticky top-0"><tr>
    <th class="p-2 text-left sticky left-0 bg-white w-56">Project</th>`;
  months.forEach(m => html += `<th class="p-2 text-right">${monthLabel(m)}</th>`);
  html += `<th class="p-2 text-right">Rev YTD</th>
           <th class="p-2 text-right">DC YTD</th>
           <th class="p-2 text-right">Margin $</th>
           <th class="p-2 text-right">Margin %</th>
         </tr></thead><tbody>`;

  for (const p of state.projects) {
    let monthHtml = '';
    let revYtd = 0, dcYtd = 0;

    for (const m of months) {
      const d = p.months[m] || { rev: 0, dc: 0 };
      revYtd += d.rev;
      dcYtd += d.dc;
      monthHtml += `<td class="p-2 text-right">${fmt(d.rev)}</td>`;
    }

    const margin$ = revYtd - dcYtd;
    const marginPct = revYtd ? (margin$ / revYtd) * 100 : 0;

    html += `<tr>
      <td class="p-2 sticky left-0 bg-white font-medium">${esc(p.name)}</td>
      ${monthHtml}
      <td class="p-2 text-right font-medium">${fmt(revYtd)}</td>
      <td class="p-2 text-right">${fmt(dcYtd)}</td>
      <td class="p-2 text-right ${margin$ >= 0 ? 'text-green-600' : 'text-red-600'}">${fmt(margin$)}</td>
      <td class="p-2 text-right ${marginPct >= 0 ? 'text-green-600' : 'text-red-600'}">${marginPct.toFixed(1)}%</td>
    </tr>`;
  }

  html += `</tbody>`;
  table.innerHTML = html;
}

/* Helpers */
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
}

function fmt(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export const eacSummaryTab = {
  template,
  async init(root) {
    rootEl = root;
    const nowY = new Date().getUTCFullYear();
    const sel = root.querySelector('#eacYear');
    sel.value = nowY;
    sel.addEventListener('change', () => load(Number(sel.value)));
    root.querySelector('#eacReload')?.addEventListener('click', () => load(state.year));
    await load(nowY);
  }
};
