// js/tabs/grant-info.js
import { client } from '../api/supabase.js';

let rootEl = null;
let grants = [];
let editingGrant = null;

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Grant Information</h2>
      <button id="newGrant" class="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium">
        + New Grant
      </button>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- Grant List -->
    <div id="grantList" class="space-y-3"></div>

    <!-- Editor Modal (hidden until edit/new) -->
    <div id="editorModal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-lg w-full max-w-2xl p-6 space-y-5">
        <h3 id="editorTitle" class="text-lg font-semibold">New Grant</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Grant Name *</label>
            <input id="name" type="text" class="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g., Youth Education Initiative">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Grant ID</label>
            <input id="grantId" type="text" class="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g., GEI-2025-001">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Funder</label>
            <input id="funder" type="text" class="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g., Gates Foundation">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Total Award ($)</label>
            <input id="totalAward" type="number" step="1000" class="w-full border rounded-md px-3 py-2 text-sm" placeholder="250000">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
            <input id="startDate" type="date" class="w-full border rounded-md px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">End Date *</label>
            <input id="endDate" type="date" class="w-full border rounded-md px-3 py-2 text-sm">
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button id="cancelEdit" class="px-4 py-2 border rounded-md text-sm">Cancel</button>
          <button id="saveGrant" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium">
            Save Grant
          </button>
        </div>
      </div>
    </div>
  </div>
`;

export async function init(root) {
  rootEl = root;
  setupEventListeners();
  await loadGrants();
}

function setupEventListeners() {
  rootEl.querySelector('#newGrant').addEventListener('click', openEditor);
  rootEl.querySelector('#cancelEdit').addEventListener('click', closeEditor);
  rootEl.querySelector('#saveGrant').addEventListener('click', saveGrant);
}

async function loadGrants() {
  const { data, error } = await client
    .from('grants')
    .select('id, name, grant_id, funder, start_date, end_date, total_award, status')
    .order('name');

  if (error) {
    msg(`Error loading grants: ${error.message}`);
    return;
  }

  grants = data;
  renderGrantList();
}

function renderGrantList() {
  const container = rootEl.querySelector('#grantList');
  if (grants.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-500">No grants yet. Create one!</p>';
    return;
  }

  container.innerHTML = grants.map(g => {
    const duration = `${formatDate(g.start_date)} → ${formatDate(g.end_date)}`;
    const months = monthDiff(g.start_date, g.end_date);
    const statusColor = g.status === 'active' ? 'text-green-600' : 'text-slate-500';

    return `
      <div class="border rounded-lg p-4 hover:bg-slate-50 transition cursor-pointer" data-id="${g.id}">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <h4 class="font-medium text-lg">${esc(g.name)}</h4>
              <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 ${statusColor}">${g.status}</span>
            </div>
            <div class="text-sm text-slate-600 mt-1">
              <span class="font-medium">${esc(g.grant_id || '—')}</span> | 
              ${esc(g.funder || '—')}
            </div>
            <div class="text-sm text-slate-500 mt-1">
              ${duration} (${months} months) | 
              <span class="font-medium">${fmt(g.total_award)}</span>
            </div>
          </div>
          <div class="flex gap-1">
            <button class="editGrant text-xs text-blue-600 hover:underline" data-id="${g.id}">Edit</button>
            <button class="deleteGrant text-xs text-red-600 hover:underline" data-id="${g.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach listeners
  container.querySelectorAll('[data-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = card.dataset.id;
      navigateToBudget(id);
    });
  });

  container.querySelectorAll('.editGrant').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      openEditor(id);
    });
  });

  container.querySelectorAll('.deleteGrant').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteGrant(id);
    });
  });
}

function openEditor(id = null) {
  editingGrant = id ? grants.find(g => g.id === id) : null;

  const modal = rootEl.querySelector('#editorModal');
  const title = rootEl.querySelector('#editorTitle');
  title.textContent = editingGrant ? 'Edit Grant' : 'New Grant';

  // Fill fields
  const set = (id, val) => rootEl.querySelector(`#${id}`).value = val || '';
  set('name', editingGrant?.name);
  set('grantId', editingGrant?.grant_id);
  set('funder', editingGrant?.funder);
  set('totalAward', editingGrant?.total_award);
  set('startDate', editingGrant?.start_date);
  set('endDate', editingGrant?.end_date);

  modal.classList.remove('hidden');
}

function closeEditor() {
  rootEl.querySelector('#editorModal').classList.add('hidden');
  editingGrant = null;
}

async function saveGrant() {
  const get = (id) => rootEl.querySelector(`#${id}`).value.trim();
  const name = get('name');
  const startDate = get('startDate');
  const endDate = get('endDate');

  if (!name || !startDate || !endDate) {
    msg('Name, Start Date, and End Date are required.');
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    msg('End date must be after start date.');
    return;
  }

  const payload = {
    name,
    grant_id: get('grantId') || null,
    funder: get('funder') || null,
    total_award: Number(get('totalAward')) || 0,
    start_date: startDate,
    end_date: endDate,
    status: 'active'
  };

  try {
    msg('Saving...');
    let result;
    if (editingGrant) {
      result = await client.from('grants').update(payload).eq('id', editingGrant.id);
    } else {
      result = await client.from('grants').insert(payload).select().single();
    }

    if (result.error) throw result.error;

    closeEditor();
    await loadGrants();
    msg(editingGrant ? 'Grant updated!' : 'Grant created!');

    // Auto-open budget for new grant
    if (!editingGrant && result.data) {
      setTimeout(() => navigateToBudget(result.data.id), 800);
    }
  } catch (e) {
    msg(`Save failed: ${e.message}`);
  }
}

async function deleteGrant(id) {
  if (!confirm('Delete this grant and all its budget data?')) return;

  try {
    msg('Deleting...');
    await client.from('grants').delete().eq('id', id);
    await loadGrants();
    msg('Grant deleted.');
  } catch (e) {
    msg(`Delete failed: ${e.message}`);
  }
}

function navigateToBudget(grantId) {
  // Use router's navigateTo
  if (window.navigateTo) {
    window.navigateTo(`#budget?grant=${grantId}`);
  } else {
    window.location.hash = `#budget?grant=${grantId}`;
  }
}

// Helpers
function msg(txt) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  if (txt) setTimeout(() => el.textContent = '', 3000);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthDiff(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1;
}

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export const grantTab = { template, init };
