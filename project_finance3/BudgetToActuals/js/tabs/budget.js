import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/`
  <article>
    <h3>Budget Builder</h3>

    <label>
      Grant:
      <select id="grantSelect">
        <option value="">— Select a grant —</option>
      </select>
    </label>
    <small id="msg"></small>

    <h4 style="margin-top:1.5rem">Labor</h4>
    <button id="addLabor" type="button">+ Add employee</button>
    <div class="scroll-x" style="margin-top:.5rem">
      <table>
        <thead>
          <tr id="laborHeaderRow">
            <th>Employee</th>
            <th>Labor category</th>
            <th>Rate ($/hr)</th>
            <th><!-- months inserted here --></th>
            <th>Remove</th>
          </tr>
        </thead>
        <tbody id="laborBody"></tbody>
      </table>
    </div>

    <h4 style="margin-top:1.5rem">Other Direct Costs</h4>
    <button id="addDirect" type="button">+ Add cost</button>
    <div class="scroll-x" style="margin-top:.5rem">
      <table>
        <thead>
          <tr id="directHeaderRow">
            <th>Category</th>
            <th>Description</th>
            <th><!-- months inserted here --></th>
            <th>Remove</th>
          </tr>
        </thead>
        <tbody id="directBody"></tbody>
      </table>
    </div>

    <div style="margin-top:1.5rem">
      <button id="saveBudget" type="button">Save budget</button>
    </div>
  </article>
`;

// ---- module state ----

let rootEl;
let currentGrantId = null;
let months = [];          // ['YYYY-MM-01', ...]
let laborRows = [];       // [{ employee_name, category_id, months:{ym:hours} }]
let directRows = [];      // [{ category, description, months:{ym:amount} }]
let laborCategories = []; // labor_categories rows
let laborCatById = new Map();

const DIRECT_CATS = [
  'Travel',
  'Licenses',
  'Computers',
  'Software',
  'Office Supplies',
  'Training',
  'Consultants',
  'Marketing',
  'Events',
  'Insurance',
  'Other'
];

const esc = x => (x ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;');

const fmtMonthLabel = iso => {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' }); // e.g. Jan 25
};

const firstOfMonthIso = d => {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0,0,0,0);
  return x.toISOString().slice(0,10);
};

const msg = (root, text, isErr=false) => {
  const el = $('#msg', root);
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isErr ? '#b00' : 'inherit';
  if (text) setTimeout(() => {
    if (el.textContent === text) el.textContent = '';
  }, 4000);
};

// ---- lifecycle ----

export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;

  // load dropdown and labor categories up front
  await Promise.all([
    loadGrantOptions(),
    loadLaborCategories()
  ]);

  // wire events
  $('#grantSelect', rootEl).addEventListener('change', async (e) => {
    const id = e.target.value || null;
    currentGrantId = id;
    if (!id) {
      clearBudget();
      return;
    }
    await loadBudgetForGrant(id);
  });

  $('#addLabor', rootEl).addEventListener('click', () => {
    if (!currentGrantId) return msg(rootEl, 'Select a grant first.', true);
    const row = { employee_name: '', category_id: null, months: {} };
    ensureMonthKeys(row.months);
    laborRows.push(row);
    renderLabor();
  });

  $('#addDirect', rootEl).addEventListener('click', () => {
    if (!currentGrantId) return msg(rootEl, 'Select a grant first.', true);
    const row = { category: DIRECT_CATS[0], description: '', months: {} };
    ensureMonthKeys(row.months);
    directRows.push(row);
    renderDirect();
  });

  $('#saveBudget', rootEl).addEventListener('click', saveBudget);
}

// ---- data loads ----

async function loadGrantOptions() {
  const sel = $('#grantSelect', rootEl);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a grant —</option>';

  const { data, error } = await client
    .from('grants')
    .select('id,name,grant_id,status')
    .eq('status','active');
  if (error) {
    console.error('loadGrantOptions error', error);
    msg(rootEl, error.message, true);
    return;
  }
  (data || []).forEach(g => {
    const label = g.grant_id ? `${g.name} (${g.grant_id})` : g.name;
    sel.appendChild(new Option(label, g.id));
  });
}

async function loadLaborCategories() {
  const { data, error } = await client
    .from('labor_categories')
    .select('id,name,position,hourly_rate,is_active')
    .eq('is_active', true)
    .order('name');
  if (error) {
    console.error('loadLaborCategories error', error);
    msg(rootEl, error.message, true);
    return;
  }
  laborCategories = data || [];
  laborCatById = new Map(laborCategories.map(c => [c.id, c]));
}

async function loadBudgetForGrant(grantId) {
  try {
    msg(rootEl, 'Loading budget…');

    // 1) months from grant period
    const { data: g, error: gErr } = await client
      .from('grants')
      .select('start_date,end_date')
      .eq('id', grantId)
      .single();
    if (gErr) throw gErr;

    months = computeMonths(g.start_date, g.end_date);

    // 2) existing labor + direct rows
    const [lab, dir] = await Promise.all([
      client.from('budget_labor')
        .select('employee_name,category_id,ym,hours')
        .eq('grant_id', grantId),
      client.from('budget_direct')
        .select('category,description,ym,amount')
        .eq('grant_id', grantId)
    ]);

    if (lab.error) throw lab.error;
    if (dir.error) throw dir.error;

    laborRows  = pivotLabor(lab.data || []);
    directRows = pivotDirect(dir.data || []);

    renderMonthHeaders();
    renderLabor();
    renderDirect();
    msg(rootEl, '');
  } catch (e) {
    console.error('loadBudgetForGrant error', e);
    msg(rootEl, e.message || String(e), true);
  }
}

function computeMonths(start, end) {
  const out = [];
  if (!start || !end) return out;
  const s = new Date(start);
  const e = new Date(end);
  s.setDate(1); e.setDate(1);
  const d = new Date(s);
  while (d <= e) {
    out.push(firstOfMonthIso(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

// ---- pivot helpers ----

function ensureMonthKeys(obj) {
  months.forEach(m => { if (!(m in obj)) obj[m] = null; });
}

function pivotLabor(rows) {
  const map = new Map(); // key: employee_name||category_id
  rows.forEach(r => {
    const key = `${r.employee_name || ''}||${r.category_id || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        employee_name: r.employee_name || '',
        category_id:   r.category_id || null,
        months: {}
      });
    }
    const ym = firstOfMonthIso(r.ym);
    map.get(key).months[ym] = r.hours ?? null;
  });

  const arr = Array.from(map.values());
  arr.forEach(r => ensureMonthKeys(r.months));
  return arr;
}

function pivotDirect(rows) {
  const map = new Map(); // key: category||description
  rows.forEach(r => {
    const key = `${r.category || ''}||${r.description || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        category:    r.category || DIRECT_CATS[0],
        description: r.description || '',
        months: {}
      });
    }
    const ym = firstOfMonthIso(r.ym);
    map.get(key).months[ym] = r.amount ?? null;
  });

  const arr = Array.from(map.values());
  arr.forEach(r => ensureMonthKeys(r.months));
  return arr;
}

// ---- rendering ----

function renderMonthHeaders() {
  const laborRow  = $('#laborHeaderRow', rootEl);
  const directRow = $('#directHeaderRow', rootEl);
  if (!laborRow || !directRow) return;

  // clear existing month columns (keep first 3 and last)
  while (laborRow.children.length > 5) laborRow.removeChild(laborRow.children[3]);
  while (directRow.children.length > 4) directRow.removeChild(directRow.children[2]);

  months.forEach(m => {
    const th1 = document.createElement('th');
    th1.textContent = fmtMonthLabel(m);
    laborRow.insertBefore(th1, laborRow.lastElementChild);

    const th2 = document.createElement('th');
    th2.textContent = fmtMonthLabel(m);
    directRow.insertBefore(th2, directRow.lastElementChild);
  });
}

function renderLabor() {
  const tbody = $('#laborBody', rootEl);
  if (!tbody) return;

  tbody.innerHTML = laborRows.map((row, i) => {
    const cat  = row.category_id ? laborCatById.get(row.category_id) : null;
    const rate = cat?.hourly_rate ?? '';

    const monthCells = months.map(m => `
      <td>
        <input
          type="number"
          class="input"
          style="width:5rem;text-align:right"
          data-kind="labor-month"
          data-row="${i}"
          data-month="${m}"
          value="${row.months[m] ?? ''}"
        >
      </td>
    `).join('');

    return `
      <tr>
        <td>
          <input
            type="text"
            class="input"
            placeholder="Employee name"
            data-kind="labor-field"
            data-field="employee_name"
            data-row="${i}"
            value="${esc(row.employee_name)}"
          >
        </td>
        <td>
          <select
            class="input"
            data-kind="labor-field"
            data-field="category_id"
            data-row="${i}"
          >
            <option value="">— Select category —</option>
            ${laborCategories.map(c => `
              <option value="${c.id}" ${row.category_id === c.id ? 'selected' : ''}>
                ${esc(c.name)}${c.position ? ' ('+esc(c.position)+')' : ''}
              </option>
            `).join('')}
          </select>
        </td>
        <td>
          <input type="number" class="input" style="width:5rem;text-align:right" value="${rate}" readonly>
        </td>
        ${monthCells}
        <td>
          <button type="button" data-action="remove-labor" data-row="${i}">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  // wire events
  tbody.querySelectorAll('[data-kind="labor-field"]').forEach(el => {
    el.addEventListener('input', e => {
      const idx   = Number(e.target.dataset.row);
      const field = e.target.dataset.field;
      if (!Number.isInteger(idx) || !laborRows[idx]) return;
      if (field === 'category_id') {
        laborRows[idx].category_id = e.target.value || null;
        const cat  = laborRows[idx].category_id ? laborCatById.get(laborRows[idx].category_id) : null;
        const rate = cat?.hourly_rate ?? '';
        const tr   = e.target.closest('tr');
        tr.querySelectorAll('td')[2].querySelector('input').value = rate;
      } else {
        laborRows[idx][field] = e.target.value || '';
      }
    });
  });

  tbody.querySelectorAll('[data-kind="labor-month"]').forEach(el => {
    el.addEventListener('input', e => {
      const idx = Number(e.target.dataset.row);
      const ym  = e.target.dataset.month;
      if (!Number.isInteger(idx) || !laborRows[idx] || !ym) return;
      const v = e.target.value === '' ? null : Number(e.target.value);
      laborRows[idx].months[ym] = isNaN(v) ? null : v;
    });
  });

  tbody.addEventListener('click', e => {
    if (e.target?.dataset.action === 'remove-labor') {
      const idx = Number(e.target.dataset.row);
      if (Number.isInteger(idx)) {
        laborRows.splice(idx, 1);
        renderLabor();
      }
    }
  }, { once: true });
}

function renderDirect() {
  const tbody = $('#directBody', rootEl);
  if (!tbody) return;

  tbody.innerHTML = directRows.map((row, i) => {
    const monthCells = months.map(m => `
      <td>
        <input
          type="number"
          class="input"
          style="width:5rem;text-align:right"
          data-kind="direct-month"
          data-row="${i}"
          data-month="${m}"
          value="${row.months[m] ?? ''}"
        >
      </td>
    `).join('');

    return `
      <tr>
        <td>
          <select
            class="input"
            data-kind="direct-field"
            data-field="category"
            data-row="${i}"
          >
            ${DIRECT_CATS.map(c => `
              <option value="${esc(c)}" ${row.category === c ? 'selected' : ''}>${esc(c)}</option>
            `).join('')}
          </select>
        </td>
        <td>
          <input
            type="text"
            class="input"
            placeholder="Description"
            data-kind="direct-field"
            data-field="description"
            data-row="${i}"
            value="${esc(row.description)}"
          >
        </td>
        ${monthCells}
        <td>
          <button type="button" data-action="remove-direct" data-row="${i}">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-kind="direct-field"]').forEach(el => {
    el.addEventListener('input', e => {
      const idx   = Number(e.target.dataset.row);
      const field = e.target.dataset.field;
      if (!Number.isInteger(idx) || !directRows[idx]) return;
      directRows[idx][field] = e.target.value || '';
    });
  });

  tbody.querySelectorAll('[data-kind="direct-month"]').forEach(el => {
    el.addEventListener('input', e => {
      const idx = Number(e.target.dataset.row);
      const ym  = e.target.dataset.month;
      if (!Number.isInteger(idx) || !directRows[idx] || !ym) return;
      const v = e.target.value === '' ? null : Number(e.target.value);
      directRows[idx].months[ym] = isNaN(v) ? null : v;
    });
  });

  tbody.addEventListener('click', e => {
    if (e.target?.dataset.action === 'remove-direct') {
      const idx = Number(e.target.dataset.row);
      if (Number.isInteger(idx)) {
        directRows.splice(idx, 1);
        renderDirect();
      }
    }
  }, { once: true });
}

// ---- save ----

async function saveBudget() {
  if (!currentGrantId) return msg(rootEl, 'Select a grant first.', true);

  const laborInserts = [];
  laborRows.forEach(r => {
    const hasHeader = (r.employee_name?.trim() || r.category_id);
    if (!hasHeader) return;
    months.forEach(m => {
      const v = r.months[m];
      if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) {
        laborInserts.push({
          grant_id:      currentGrantId,
          employee_name: r.employee_name || null,
          category_id:   r.category_id || null,
          ym:            m,
          hours:         Number(v)
        });
      }
    });
  });

  const directInserts = [];
  directRows.forEach(r => {
    const hasHeader = (r.category?.trim() || r.description?.trim());
    if (!hasHeader) return;
    months.forEach(m => {
      const v = r.months[m];
      if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) {
        directInserts.push({
          grant_id:    currentGrantId,
          category:    r.category || null,
          description: r.description || null,
          ym:          m,
          amount:      Number(v)
        });
      }
    });
  });

  try {
    msg(rootEl, 'Saving…');

    const delLab = await client.from('budget_labor').delete().eq('grant_id', currentGrantId);
    if (delLab.error) throw delLab.error;
    const delDir = await client.from('budget_direct').delete().eq('grant_id', currentGrantId);
    if (delDir.error) throw delDir.error;

    if (laborInserts.length) {
      const insLab = await client.from('budget_labor').insert(laborInserts);
      if (insLab.error) throw insLab.error;
    }
    if (directInserts.length) {
      const insDir = await client.from('budget_direct').insert(directInserts);
      if (insDir.error) throw insDir.error;
    }

    msg(rootEl, 'Budget saved.');
  } catch (e) {
    console.error('saveBudget error', e);
    msg(rootEl, e.message || String(e), true);
  }
}

// ---- clear ----

function clearBudget() {
  months = [];
  laborRows = [];
  directRows = [];
  const lb = $('#laborBody', rootEl);
  const db = $('#directBody', rootEl);
  if (lb) lb.innerHTML = '';
  if (db) db.innerHTML = '';
}
