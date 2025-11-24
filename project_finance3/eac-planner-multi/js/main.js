// js/main.js
// Tab router + project bar + new-project modal

import { $ } from './lib/dom.js';
import { setProjectId, getProjectId, restoreProjectId } from './lib/state.js';
import { listProjects, createProject } from './data/projects.js';
import { client } from './api/supabase.js';

// -------------------------------
// Tab routing (lazy-loaded)
// -------------------------------
const routes = {
  '#visuals': () => import('./tabs/visuals.js'),   // Charts tab
  '#benchmarks': () => import('./tabs/benchmarks.js'),
  '#pnl': () => import('./tabs/pnl.js'),
  '#project': () => import('./tabs/project-info.js'),
  '#plan-employees': () => import('./tabs/plan-employees.js'),
  '#plan-subs': () => import('./tabs/plan-subs.js'),
  '#plan-equipment': () => import('./tabs/plan-equipment.js'),
  '#plan-materials': () => import('./tabs/plan-materials.js'),
  '#plan-odc': () => import('./tabs/plan-odc.js'),
  '#admin': () => import('./tabs/admin-lookups.js?v=eq-dynamic-1'),
  
};

async function render() {
  const hash = location.hash || '#visuals';
  const loader = routes[hash] || routes['#visuals'];
  const view = $('#view');

  try {
    $('#status').textContent = 'Loading tab…';
    const mod = await loader();

    view.innerHTML = mod.template || `<div class="text-sm text-slate-500 p-8 text-center">Tab loaded.</div>`;

    if (typeof mod.init === 'function') {
      await mod.init(view);
    }

    wireActionButtons();
    $('#status').textContent = '';
  } catch (err) {
    console.error('Tab render error:', err);
    view.innerHTML = `
      <div class="p-8 rounded-xl bg-red-50 text-red-700 text-center">
        <p class="font-medium">Failed to load tab</p>
        <p class="text-sm mt-2">${err?.message || err}</p>
      </div>`;
    $('#status').textContent = 'Tab failed to load';
  }
}

// Global action buttons (e.g. Recompute EAC)
function wireActionButtons() {
  const btn = document.getElementById('recomputeEac');
  if (btn && !btn.dataset.wired) {
    btn.addEventListener('click', recomputeEAC);
    btn.dataset.wired = '1';
  }
}

async function recomputeEAC() {
  const status = $('#status');
  const btn = $('#recomputeEac');
  const projectId = getProjectId();

  if (!projectId) {
    status.textContent = 'Select a project first.';
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
    }
    status.textContent = 'Recomputing EAC…';

    const { error } = await client.rpc('recompute_eac', { p_project_id: projectId });
    if (error) throw error;

    status.textContent = 'Done. Refreshing view…';

    const refreshBtn = document.getElementById('refreshPL');
    if (refreshBtn) refreshBtn.click();
    else await render();

    status.textContent = 'EAC updated successfully.';
  } catch (err) {
    console.error('recomputeEAC error', err);
    status.textContent = `Error: ${err.message || err}`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Recompute EAC';
    }
  }
}

// Project selector + modal
async function refreshProjectsUI(selectAfterId = null) {
  $('#projMsg').textContent = 'Loading projects…';
  const projects = await listProjects();
  const sel = $('#projectSelect');

  if (!projects.length) {
    sel.innerHTML = '<option value="">No projects yet</option>';
    setProjectId(null);
    $('#projMsg').textContent = 'Create your first project.';
    return;
  }

  sel.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  const stored = getProjectId();
  const validStored = projects.some(p => p.id === stored) ? stored : null;
  const toSelect = selectAfterId || validStored || projects[0].id;

  sel.value = toSelect;
  setProjectId(toSelect);
  $('#projMsg').textContent = '';
}

function openProjectModal() {
  $('#projErr').textContent = '';
  $('#projForm').reset();
  $('#projModal').classList.remove('hidden');
  $('#projModal').classList.add('flex');
  $('#projName').focus();
}

function closeProjectModal() {
  $('#projModal').classList.add('hidden');
  $('#projModal').classList.remove('flex');
}

async function handleProjectFormSubmit(e) {
  e.preventDefault();
  $('#projErr').textContent = '';
  try {
    const name = $('#projName').value.trim();
    if (!name) {
      $('#projErr').textContent = 'Project name is required.';
      return;
    }

    const newId = await createProject({ name });
    await refreshProjectsUI(newId);
    closeProjectModal();

    if ($('#projOpenRev')?.checked) {
      location.hash = '#project';
    }

    await render();
  } catch (err) {
    console.error('createProject error', err);
    $('#projErr').textContent = err?.message || String(err);
  }
}

function wireProjectControls() {
  $('#projectSelect').addEventListener('change', async (e) => {
    setProjectId(e.target.value || null);
    if (getProjectId()) await render();
  });

  $('#newProjectBtn').onclick = openProjectModal;
  $('#projCancel').onclick = closeProjectModal;
  $('#projClose').onclick = closeProjectModal;
  $('#projForm').addEventListener('submit', handleProjectFormSubmit);

  $('#manageProjectsBtn').onclick = () =>
    alert('Manage projects coming soon!');
}

// SAFE: Only runs if #monthPicker exists in DOM
function initMonthPicker() {
  const input = document.getElementById('monthPicker');

  // If the element doesn't exist (e.g. on #visuals tab), just exit silently
  if (!input) return;

  // Set default to current month if empty
  if (!input.value) {
    input.value = new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  // Re-render on change (so tabs that use the selected month)
  input.addEventListener('change', render);
}

async function init() {
  $('#status').textContent = 'Starting app…';
  initMonthPicker(); // now safe even if element missing

  restoreProjectId();
  await refreshProjectsUI();
  wireProjectControls();

  if (!location.hash) location.hash = '#project';
  await render();

  $('#status').textContent = '';
}

// Active tab highlighting
function syncActiveTab() {
  const hash = location.hash || '#project';
  document.querySelectorAll('.tab-link').forEach(a => {
    const isActive = a.getAttribute('href') === hash;
    a.classList.toggle('text-blue-600', isActive);
    a.classList.toggle('bg-blue-50', isActive);
    a.classList.toggle('border-blue-500', isActive);
    a.classList.toggle('font-semibold', isActive);
    if (isActive) a.style.borderBottomColor = '#3b82f6';
  });
}

window.addEventListener('hashchange', syncActiveTab);
document.addEventListener('DOMContentLoaded', syncActiveTab);

window.addEventListener('hashchange', render);

init();
