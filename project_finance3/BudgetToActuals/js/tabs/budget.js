// js/tabs/budget.js
import { client } from '../api/supabase.js';

let rootEl = null;
let currentGrant = null;     // { id: string(uuid) }
let months = [];             // ['YYYY-MM-01', ...]
let laborUI = [];
let directUI = [];
let laborCats = [];
let laborCatById = new Map();
let currentUser = null;

const EXPENSE_CATEGORIES = [
  'Travel','Licenses','Computers','Software','Office Supplies',
  'Training','Consultants','Marketing','Events','Insurance'
];

// ───────── utils ─────────
const isoFirstOfMonth = (d) => {
  const x = new Date(d);
  x.setDate(1); x.setHours(0,0,0,0);
  return new Date(x).toISOString().slice(0,10);
};
const esc = (x) => (x ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;');
function msg(text, isErr = false) {
  const el = rootEl.querySelector('#msg');
  if (!el) return;
  el.textContent = text;
  el.className = isErr ? 'text-sm text-red-600' : 'text-sm text-green-600';
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
}

// ───────── top-level template wrapper ─────────
// We’ll swap between the Auth Gate and the Budget UI inside this wrapper.
export const template = /*html*/`
  <div id="budgetRoot" class="card p-0"></div>
`;

// Render either auth gate or budget UI into #budgetRoot
function renderAuthGate() {
  const host = rootEl.querySelector('#budgetRoot');
  host.innerHTML = `
    <div class="p-6 space-y-4">
      <h2 class="text-xl font-semibold text-slate-800">Sign in to continue</h2>
      <p class="text-sm text-slate-600">Use email + password, or send yourself a magic link.</p>

      <div class="grid gap-3 max-w-md">
        <input id="authEmail" type="email" placeholder="you@example.com" class="input text-sm" />
        <input id="authPwd" type="password" placeholder="Password (or leave empty for magic link)" class="input text-sm" />
        <div class="flex gap-2">
          <button id="btnSignIn" class="btn btn-primary btn-sm">Sign in</button>
          <button id="btnSignUp" class="btn btn-outline btn-sm">Sign up</button>
          <button id="btnMagic" class="btn btn-ghost btn-sm">Send magic link</button>
        </div>
        <div id="authMsg" class="text-xs text-slate-600"></div>
      </div>
    </div>
  `;

  const emailEl = host.querySelector('#authEmail');
  const pwdEl   = host.querySelector('#authPwd');
  const aMsg    = host.querySelector('#authMsg');

  host.querySelector('#btnSignIn').addEventListener('click', async () => {
    const email = emailEl.value.trim();
    const pwd = pwdEl.value;
    if (!email || !pwd) { aMsg.textContent = 'Enter email and password (or use magic link).'; return; }
    aMsg.textContent = 'Signing in...';
    const { data, error } = await client.auth.signInWithPassword({ email, password: pwd });
    if (error) { aMsg.textContent = 'Sign in failed: ' + error.message; return; }
    currentUser = data.user;
    await renderBudgetShell(); // load the budget UI now
  });

  host.querySelector('#btnSignUp').addEventListener('click', async () => {
    const email = emailEl.value.trim();
    const pwd = pwdEl.value;
    if (!email || !pwd) { aMsg.textContent = 'Enter email and password to sign up.'; return; }
    aMsg.textContent = 'Creating account...';
    const { data, error } = await client.auth.signUp({ email, password: pwd, options: { emailRedirectTo: window.location.origin } });
    if (error) { aMsg.textContent = 'Sign up failed: ' + error.message; return; }
    aMsg.textContent = 'Sign up ok. Check your email to confirm, then sign in.';
  });

  host.querySelector('#btnMagic').addEventListener('click', async () => {
    const email = emailEl.value.trim();
    if (!email) { aMsg.textContent = 'Enter your email for a magic link.'; return; }
    aMsg.textContent = 'Sending magic link...';
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin } // MUST be allowed in Auth → Redirect URLs
    });
    if (error) { aMsg.textContent = 'Magic link failed: ' + error.message; return; }
    aMsg.textContent = 'Magic link sent. Open it on this device.';
  });
}

async function renderBudgetShell() {
  const host = rootEl.querySelector('#budgetRoot');
  host.innerHTML = `
    <div class="space-y-6 p-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-800">Budget Entry</h2>
          <div id="signedInBadge" class="text-xs text-green-700"></div>
        </div>
        <div class="flex items-center gap-2">
          <select id="grantSelect" class="input text-sm w-80"></select>
          <button id="signOut" class="btn btn-ghost btn-sm">Sign out</button>
        </div>
      </div>

      <div id="msg" class="text-sm text-slate-600"></div>

      <!-- Labor -->
      <div>
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-semibold text-slate-700">Labor</h3>
          <button id="addLabor" class="btn btn-primary btn-sm">+ Add Row</button>
        </div>
        <div class="overflow-x-auto rounded-lg border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr id="laborHeaderRow">
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 w-56">Employee Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-56">Labor Category</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider w-24">Rate ($/hr)</th>
                <th class="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody id="laborBody" class="bg-white divide-y divide-slate-200"></tbody>
          </table>
        </div>
      </div>

      <!-- Direct -->
      <div>
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-semibold text-slate-700">Direct Costs</h3>
          <button id="addDirect" class="btn btn-primary btn-sm">+ Add Row</button>
        </div>
        <div class="overflow-x-auto rounded-lg border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr id="directHeaderRow">
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 w-40">Category</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-64">Description</th>
                <th class="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody id="directBody" class="bg-white divide-y divide-slate-200"></tbody>
          </table>
        </div>
      </div>

      <div class="flex justify-end gap-3 mt-2">
        <button id="saveBudget" class="btn btn-success">Save Budget</button>
      </div>
    </div>
  `;

  // show who’s signed in
  host.querySelector('#signedInBadge').textContent =
    `Signed in: ${currentUser?.email || currentUser?.id || 'unknown user'}`;

  // events for budget shell
  host.querySelector('#signOut').addEventListener('click', async () => {
    await client.auth.signOut();
    currentUser = null;
    renderAuthGate();
  });

  await loadGrants();
  await loadLaborCategories();
  setupEventListeners();

  // Load initial grant if any remains from params (handled in init)
  if (currentGrant?.id) {
    const sel = host.querySelector('#grantSelect');
    sel.value = currentGrant.id;
    await loadBudget();
  }
}

// ───────── lifecycle ─────────
export async function init(root, params = {}) {
  rootEl = root;
  currentGrant = params.grantId ? { id: String(params.grantId) } : null;
  months = [];
  laborUI = [];
  directUI = [];
  laborCats = [];
  laborCatById = new Map();
  currentUser = null;

  // pick up auth from URL (magic link) and current session
  try {
    const [{ data: { session } }, { data: { user } }] = await Promise.all([
      client.auth.getSession(),
      client.auth.getUser()
    ]);
    currentUser = user || session?.user || null;
  } catch (_) {
    currentUser = null;
  }

  // Render gate or budget shell
  if (!currentUser) renderAuthGate();
  else await renderBudgetShell();

  // keep UI synced with auth changes (e.g., after magic link)
  client.auth.onAuthStateChange(async (_event, session) => {
    const wasSignedIn = !!currentUser;
    currentUser = session?.user || null;
    if (!wasSignedIn && currentUser) {
      await renderBudgetShell();
    } else if (wasSignedIn && !currentUser) {
      renderAuthGate();
    }
  });
}

// ───────── data loads ─────────
function setupEventListeners() {
  rootEl.querySelector('#grantSelect').addEventListener('change', async (e) => {
    const id = e.target.value || null;
    currentGrant = id ? { id } : null;
    if (currentGrant) await loadBudget();
    else clearBudget();
  });

  rootEl.querySelector('#addLabor').addEventListener('click', addLaborRow);
  rootEl.querySelector('#addDirect').addEventListener('click', addDirectRow);
  rootEl.querySelector('#saveBudget').addEventListener('click', saveBudget);
}

async function loadGrants() {
  const sel = rootEl.querySelector('#grantSelect');
  sel.innerHTML = '<option value="">— Select Grant —</option>';
  const { data, error } = await client
    .from('grants')
    .select('id,name,grant_id,status')
    .eq('status','active')
    .order('name', { ascending: true });
  if (error) { msg(`Failed to load grants: ${error.message}`, true); return; }
  (data || []).forEach(g => sel.add(new Option(`${g.name} (${g.grant_id || '—'})`, g.id)));
}

async function loadLaborCategories() {
  const { data, error } = await client
    .from('labor_categories')
    .select('id,name,hourly_rate,position,is_active')
    .eq('is_active', true)
    .order('name');
  if (error) { msg(`Failed to load labor categories: ${error.message}`, true); return; }
  laborCats = data || [];
  laborCatById = new Map(laborCats.map(x => [x.id, x]));
}

async function computeMonthsForGrant(grantId) {
  const { data, error } = await client
    .from('grants')
    .select('start_date,end_date')
    .eq('id', grantId).single();
  if (error) throw error;
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  start.setDate(1); end.setDate(1);
  const out = [];
  const d = new Date(start);
  while (d <= end) {
    out.push(isoFirstOfMonth(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

async function loadBudget() {
  if (!currentGrant?.id) return;
  try {
    months = await computeMonthsForGrant(currentGrant.id);

    const [lab, dir] = await Promise.all([
      client.from('budget_labor')
        .select('grant_id, employee_name, category_id, ym, hours')
        .eq('grant_id', currentGrant.id),
      client.from('budget_direct')
        .select('grant_id, category, description, ym, amount')
        .eq('grant_id', currentGrant.id)
    ]);
    if (lab.error) throw lab.error;
    if (dir.error) throw dir.error;

    laborUI  = pivotLabor(lab.data || []);
    directUI = pivotDirect(dir.data || []);

    renderMonthHeaders();
    renderLabor();
    renderDirect();
  } catch (e) {
    msg(`Load failed: ${e.message}`, true);
  }
}

// ───────── pivot helpers ─────────
function pivotLabor(rows) {
  const key = (r) => `${r.employee_name || ''}||${r.category_id || ''}`;
  const map = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!map.has(k)) map.set(k, { employee_name: r.employee_name || '', category_id: r.category_id || null, months: {} });
    map.get(k).months[isoFirstOfMonth(r.ym)] = r.hours ?? null;
  }
  const out = Array.from(map.values());
  out.forEach(it => months.forEach(m => { if (!(m in it.months)) it.months[m] = null; }));
  return out;
}

function pivotDirect(rows) {
  const key = (r) => `${r.category || ''}||${r.description || ''}`;
  const map = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!map.has(k)) map.set(k, { category: r.category || EXPENSE_CATEGORIES[0], description: r.description || '', months: {} });
    map.get(k).months[isoFirstOfMonth(r.ym)] = r.amount ?? null;
  }
  const out = Array.from(map.values());
  out.forEach(it => months.forEach(m => { if (!(m in it.months)) it.months[m] = null; }));
  return out;
}

// ───────── rendering ─────────
function renderMonthHeaders() {
  const makeHeader = (monthIso) => {
    const th = document.createElement('th');
    th.className = 'px-3 py-2 text-center text-xs font-medium text-slate-600 bg-slate-50 border-l border-slate-200 first:border-l-0 w-20';
    th.textContent = new Date(monthIso).toLocaleString('en-US', { month: 'short' });
    return th;
  };

  const laborRow = rootEl.querySelector('#laborHeaderRow');
  const directRow = rootEl.querySelector('#directHeaderRow');

  while (laborRow.children.length > 4) laborRow.removeChild(laborRow.children[3]);
  while (directRow.children.length > 3) directRow.removeChild(directRow.children[2]);

  months.forEach(m => {
    laborRow.insertBefore(makeHeader(m), laborRow.lastElementChild);
    directRow.insertBefore(makeHeader(m), directRow.lastElementChild);
  });
}

function renderLabor() {
  const tbody = rootEl.querySelector('#laborBody');
  const html = laborUI.map((item, i) => {
    const cat = item.category_id ? laborCatById.get(item.category_id) : null;
    const rate = cat?.hourly_rate ?? '';
    const monthCells = months.map(m => `
      <td class="px-3 py-2 text-center border-l border-slate-200 first:border-l-0">
        <input type="number" class="input text-sm w-16 text-center"
               value="${esc(item.months[m] ?? '')}"
               data-kind="labor" data-row="${i}" data-month="${m}">
      </td>
    `).join('');

    return `
      <tr class="hover:bg-slate-50">
        <td class="px-6 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
          <input type="text" class="input text-sm w-full" placeholder="Employee name"
                 value="${esc(item.employee_name)}"
                 data-kind="labor-field" data-row="${i}" data-field="employee_name">
        </td>
        <td class="px-6 py-3 border-r border-slate-200">
          <select class="input text-sm w-full"
                  data-kind="labor-field" data-row="${i}" data-field="category_id">
            <option value="">— Select Labor Category —</option>
            ${laborCats.map(c => `<option value="${c.id}" ${item.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </td>
        <td class="px-4 py-3 text-right border-r border-slate-200">
          <input type="number" class="input text-sm w-20 text-right" value="${esc(rate)}" readonly>
        </td>
        ${monthCells}
        <td class="px-4 py-3 text-center">
          <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeLabor(${i})">×</button>
        </td>
      </tr>
    `;
  }).join('');
  tbody.innerHTML = html;

  tbody.querySelectorAll('input[data-kind="labor"]').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.row);
      const m = e.target.dataset.month;
      const v = e.target.value === '' ? null : Number(e.target.value);
      laborUI[i].months[m] = isNaN(v) ? null : v;
    });
  });
  tbody.querySelectorAll('[data-kind="labor-field"]').forEach(el => {
    el.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.row);
      const field = e.target.dataset.field;
      if (field === 'category_id') {
        laborUI[i][field] = e.target.value || null;
        const tr = e.target.closest('tr');
        const cat = laborUI[i][field] ? laborCatById.get(laborUI[i][field]) : null;
        tr.cells[2].querySelector('input').value = cat?.hourly_rate ?? '';
      } else {
        laborUI[i][field] = e.target.value || '';
      }
    });
  });
}

function renderDirect() {
  const tbody = rootEl.querySelector('#directBody');
  const html = directUI.map((item, i) => {
    const monthCells = months.map(m => `
      <td class="px-3 py-2 text-center border-l border-slate-200 first:border-l-0">
        <input type="number" class="input text-sm w-20 text-center"
               value="${esc(item.months[m] ?? '')}"
               data-kind="direct" data-row="${i}" data-month="${m}">
      </td>
    `).join('');

    return `
      <tr class="hover:bg-slate-50">
        <td class="px-6 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
          <select class="input text-sm w-full"
                  data-kind="direct-field" data-row="${i}" data-field="category">
            ${EXPENSE_CATEGORIES.map(c => `<option value="${esc(c)}" ${item.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </td>
        <td class="px-6 py-3 border-r border-slate-200">
          <input type="text" class="input text-sm w-full" placeholder="Description"
                 value="${esc(item.description)}"
                 data-kind="direct-field" data-row="${i}" data-field="description">
        </td>
        ${monthCells}
        <td class="px-4 py-3 text-center">
          <button class="text-red-600 hover:text-red-800 text-xl" onclick="removeDirect(${i})">×</button>
        </td>
      </tr>
    `;
  }).join('');
  tbody.innerHTML = html;

  tbody.querySelectorAll('input[data-kind="direct"]').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.row);
      const m = e.target.dataset.month;
      const v = e.target.value === '' ? null : Number(e.target.value);
      directUI[i].months[m] = isNaN(v) ? null : v;
    });
  });
  tbody.querySelectorAll('[data-kind="direct-field"]').forEach(el => {
    el.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.row);
      const field = e.target.dataset.field;
      directUI[i][field] = e.target.value || '';
    });
  });
}

// ───────── add/remove ─────────
function ensureMonthKeys(obj) { months.forEach(m => { if (!(m in obj.months)) obj.months[m] = null; }); }
function addLaborRow() {
  if (!currentGrant?.id) return msg('Select a grant first', true);
  const item = { employee_name: '', category_id: null, months: {} };
  ensureMonthKeys(item);
  laborUI.push(item);
  renderLabor();
}
function addDirectRow() {
  if (!currentGrant?.id) return msg('Select a grant first', true);
  const item = { category: EXPENSE_CATEGORIES[0], description: '', months: {} };
  ensureMonthKeys(item);
  directUI.push(item);
  renderDirect();
}
window.removeLabor = (i) => { laborUI.splice(i, 1); renderLabor(); };
window.removeDirect = (i) => { directUI.splice(i, 1); renderDirect(); };

// ───────── save (UI -> normalized) ─────────
async function saveBudget() {
  if (!currentGrant?.id) return msg('Select a grant', true);
  if (!currentUser) return msg('Please sign in first.', true);

  const laborInserts = [];
  for (const it of laborUI) {
    const hasHeader = (it.employee_name?.trim() || it.category_id);
    if (!hasHeader) continue;
    for (const m of months) {
      const v = it.months[m];
      if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) {
        laborInserts.push({ grant_id: currentGrant.id, employee_name: it.employee_name || null, category_id: it.category_id || null, ym: m, hours: Number(v) });
      }
    }
  }

  const directInserts = [];
  for (const it of directUI) {
    const hasHeader = (it.category?.trim() || it.description?.trim());
    if (!hasHeader) continue;
    for (const m of months) {
      const v = it.months[m];
      if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) {
        directInserts.push({ grant_id: currentGrant.id, category: it.category || null, description: it.description || null, ym: m, amount: Number(v) });
      }
    }
  }

  try {
    // Replace this grant slice
    const del1 = await client.from('budget_labor').delete().eq('grant_id', currentGrant.id);
    if (del1.error) throw del1.error;

    const del2 = await client.from('budget_direct').delete().eq('grant_id', currentGrant.id);
    if (del2.error) throw del2.error;

    if (laborInserts.length) {
      const ins1 = await client.from('budget_labor').insert(laborInserts);
      if (ins1.error) throw ins1.error;
    }
    if (directInserts.length) {
      const ins2 = await client.from('budget_direct').insert(directInserts);
      if (ins2.error) throw ins2.error;
    }

    msg('Budget saved successfully!');
    await loadBudget();
  } catch (err) {
    msg('Save failed: ' + (err.message || String(err)), true);
  }
}

// ───────── clear ─────────
function clearBudget() {
  laborUI = []; directUI = []; months = [];
  const lb = rootEl.querySelector('#laborBody');
  const db = rootEl.querySelector('#directBody');
  if (lb) lb.innerHTML = '';
  if (db) db.innerHTML = '';
  const laborRow = rootEl.querySelector('#laborHeaderRow');
  const directRow = rootEl.querySelector('#directHeaderRow');
  if (laborRow) while (laborRow.children.length > 4) laborRow.removeChild(laborRow.children[3]);
  if (directRow) while (directRow.children.length > 3) directRow.removeChild(directRow.children[2]);
}

export const budgetTab = { template, init };
