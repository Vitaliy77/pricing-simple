// js/main.js
// Tab router + project bar + new-project modal

import { $ } from './lib/dom.js';
import { setProjectId, getProjectId, restoreProjectId } from './lib/state.js';
import { listProjects, createProject } from './data/projects.js';

// -------------------------------
// Tab routing (lazy-loaded files)
// -------------------------------
const routes = {
  '#project': () => import('./tabs/project-info.js'),
  '#pnl': () => import('./tabs/pnl.js'),
  '#plan-employees': () => import('./tabs/plan-employees.js'),
  '#plan-subs': () => import('./tabs/plan-subs.js'),
  '#plan-equipment': () => import('./tabs/plan-equipment.js'),
  '#plan-materials': () => import('./tabs/plan-materials.js'),
  '#plan-odc': () => import('./tabs/plan-odc.js'),
  '#benchmarks': () => import('./tabs/benchmarks.js'),
  '#admin': () => import('./tabs/admin-lookups.js'),
};

async function render() {
  const hash = location.hash || '#project';
  const loader = routes[hash] || routes['#project'];
  const view = $('#view');
  try {
    const mod = await loader();
    view.innerHTML = mod.template || `<div class="text-sm text-slate-500">Loaded.</div>`;
    // Each tab module should export: template (string) and optional init(viewEl)
    if (typeof mod.init === 'function') {
      await mod.init(view);
    }
  } catch (err) {
    console.error('Tab render error:', err);
    view.innerHTML = `<div class="p-4 rounded-md bg-red-50 text-red-700 text-sm">
      Failed to load tab. ${err?.message || err}
    </div>`;
  }
}

// -------------------------------
// Project selector + modal
// -------------------------------
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

  // Build options
  sel.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  // Choose selection: newly created id, or previously stored (if still valid), or first
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
    if (!name) { $('#projErr').textContent = 'Project name is required.'; return; }

    // Minimal payload (only name) to avoid schema mismatches
    const newId = await createProject({ name });

    // Refresh & select the new project
    await refreshProjectsUI(newId);
    closeProjectModal();

    // Optional: jump to revenue settings later (when we implement it on #project tab)
    if ($('#projOpenRev')?.checked) {
      location.hash = '#project';
    }

    // Re-render current tab with the new context
    await render();
  } catch (err) {
    console.error('createProject error', err);
    $('#projErr').textContent = err?.message || String(err);
  }
}

// -------------------------------
// App bootstrap
// -------------------------------
function wireProjectControls() {
  // Switch projects
  $('#projectSelect').addEventListener('change', async (e) => {
    setProjectId(e.target.value || null);
    if (!getProjectId()) { $('#projMsg').textContent = 'Select a project.'; return; }
    await render(); // refresh current tab with the new project context
  });

  // Modal open/close + submit
  $('#newProjectBtn').onclick = openProjectModal;
  $('#projCancel').onclick = closeProjectModal;
  $('#projClose').onclick = closeProjectModal;
  $('#projForm').addEventListener('submit', handleProjectFormSubmit);

  // (Optional placeholder)
  $('#manageProjectsBtn').onclick = () =>
    alert('Manage screen coming soon. For now, create/switch using the Project bar.');
}

function initMonthPicker() {
  const el = $('#monthPicker');
  if (!el.value) {
    el.value = new Date().toISOString().slice(0, 7); // YYYY-MM
  }
  el.addEventListener('change', () => {
    // Tabs can read #monthPicker when they compute monthly views
    render();
  });
}

async function init() {
  try {
    $('#status').textContent = 'Loading…';
    initMonthPicker();

    // Restore selection, populate projects, ensure we have something selected
    restoreProjectId();
    await refreshProjectsUI();
    wireProjectControls();

    // Default route
    if (!location.hash) location.hash = '#project';
    await render();

    $('#status').textContent = '';
  } catch (err) {
    console.error('Init error', err);
    const msg = (err && err.message) ? err.message : JSON.stringify(err || {}, null, 2);
    $('#status').textContent = `Error loading app: ${msg}`;
  }
}

window.addEventListener('hashchange', render);
init();
