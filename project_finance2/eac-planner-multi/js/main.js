import { $ } from './lib/dom.js';
import { setProjectId, getProjectId, restoreProjectId } from './lib/state.js';
import { listProjects, createProject } from './data/projects.js';
import { loadLookups } from './data/lookups.js';
import { wireRevenueUI, loadRevenueSettings } from './features/revenue.js';
import { refreshPL } from './features/pl-table.js';
import { client } from './api/supabase.js';


import { makeLaborRow, saveLabor } from './features/plan-labor.js';
import { makeSubRow, saveSubs } from './features/plan-subs.js';
import { makeEquipRow, saveEquip } from './features/plan-equipment.js';
import { makeMatRow, saveMat } from './features/plan-materials.js';

async function loadExistingPlanForMonth() {
  try {
    const pid = getProjectId();
    if (!pid) { $('#status').textContent = 'Select or create a project.'; return; }

    const ym = `${$('#monthPicker').value}-01`;

    // clear tables before refill
    $('#laborTbody').innerHTML = '';
    $('#subsTbody').innerHTML  = '';
    $('#equipTbody').innerHTML = '';
    $('#matTbody').innerHTML   = '';

    // Labor
    {
      const { data, error } = await client
        .from('plan_labor')
        .select('employee_id, hours, override_rate')
        .eq('project_id', pid).eq('ym', ym);
      if (error) throw error;
      data?.forEach(r => $('#laborTbody').appendChild(makeLaborRow(r)));
    }

    // Subs
    {
      const { data, error } = await client
        .from('plan_subs')
        .select('vendor_id, cost, note')
        .eq('project_id', pid).eq('ym', ym);
      if (error) throw error;
      data?.forEach(r => $('#subsTbody').appendChild(makeSubRow(r)));
    }

    // Equipment
    {
      const { data, error } = await client
        .from('plan_equipment')
        .select('equipment_type, hours')
        .eq('project_id', pid).eq('ym', ym);
      if (error) throw error;
      data?.forEach(r => $('#equipTbody').appendChild(makeEquipRow(r)));
    }

    // Materials
    {
      const { data, error } = await client
        .from('plan_materials')
        .select('sku, qty')
        .eq('project_id', pid).eq('ym', ym);
      if (error) throw error;
      data?.forEach(r => $('#matTbody').appendChild(makeMatRow(r)));
    }
  } catch (err) {
    console.error('Error loading plan:', err);
    $('#status').textContent = `Error loading plan: ${err.message || err}`;
  }
}



async function refreshProjectsUI(selectAfterId = null) {
  $('#projMsg').textContent = 'Loading projects…';
  const projects = await listProjects();

  const sel = $('#projectSelect');
  if (!projects.length) {
    sel.innerHTML = '<option value="">No projects yet</option>';
    $('#projMsg').textContent = 'Create your first project.';
    setProjectId(null);
    return;
  }

  // Build options
  sel.innerHTML = projects.map(p => {
    const label = [p.name, p.client ? `— ${p.client}` : ''].join(' ');
    return `<option value="${p.id}">${label}</option>`;
  }).join('');

  // Pick which project to select:
  // 1) the one we just created, 2) stored id if still valid, 3) first in list
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
    const client = $('#projClient').value.trim() || null;
    const start_date = $('#projStart').value || null;
    const end_date = $('#projEnd').value || null;
    if (!name) { $('#projErr').textContent = 'Project name is required.'; return; }

    const newId = await createProject({ name, client, start_date, end_date });
    await refreshProjectsUI(newId);          // select the new project
    closeProjectModal();

    // Optionally open revenue settings
    if ($('#projOpenRev').checked) {
      await loadRevenueSettings();
      // scroll into view
      document.querySelector('h2.text-lg.font-semibold:nth-child(1)')?.scrollIntoView({ behavior: 'smooth' });
    }

    // Load data for the new project
    await loadExistingPlanForMonth();
    await refreshPL();

  } catch (err) {
    console.error('createProject error', err);
    $('#projErr').textContent = err?.message || String(err);
  }
}


async function init() {
  try {
    // 1) Basic UI setup
    $('#monthPicker').value = new Date().toISOString().slice(0, 7);
    $('#status').textContent = 'Loading catalogs…';

    // 2) Load lookups (tolerant version from lookups.js)
    await loadLookups();
    $('#status').textContent = 'Catalogs loaded.';

    // 3) Prepare projects bar (restore → list → select)
    restoreProjectId();
    await refreshProjectsUI(); // must set setProjectId(...) or show "no projects"
    if (!getProjectId()) {
      $('#projMsg').textContent = 'Create your first project to continue.';
      return; // stop here until user creates/selects a project
    }

    // 4) With a project selected, load project-specific data
    await loadRevenueSettings();
    await loadExistingPlanForMonth();
    await refreshPL();

    // 5) Wire project controls
    $('#projectSelect').addEventListener('change', async (e) => {
      setProjectId(e.target.value || null);
      if (!getProjectId()) { $('#projMsg').textContent = 'Select a project.'; return; }
      await loadExistingPlanForMonth();
      await refreshPL();
    });
    $('#newProjectBtn').onclick = async () => {
      try {
        await promptNewProject();
        await loadExistingPlanForMonth();
        await refreshPL();
      } catch (e) {
        $('#projMsg').textContent = e.message || String(e);
      }
    };
    $('#manageProjectsBtn').onclick = () =>
      alert('Manage screen coming soon. For now, create/switch using this bar.');

    // 6) Wire planning buttons
    $('#addLaborRow').onclick = () => $('#laborTbody').appendChild(makeLaborRow());
    $('#addSubRow').onclick   = () => $('#subsTbody').appendChild(makeSubRow());
    $('#addEquipRow').onclick = () => $('#equipTbody').appendChild(makeEquipRow());
    $('#addMatRow').onclick   = () => $('#matTbody').appendChild(makeMatRow());

    $('#refreshPL').onclick = refreshPL;
    
    $('#saveLabor').onclick  = async () => { await saveLabor(); await loadExistingPlanForMonth(); await refreshPL(); };
    $('#saveSubs').onclick   = async () => { await saveSubs();  await loadExistingPlanForMonth(); await refreshPL(); };
    $('#saveEquip').onclick  = async () => { await saveEquip(); await loadExistingPlanForMonth(); await refreshPL(); };
    $('#saveMat').onclick    = async () => { await saveMat();   await loadExistingPlanForMonth(); await refreshPL(); };
    
    $('#projectSelect').addEventListener('change', async (e) => {
      setProjectId(e.target.value || null);
      if (!getProjectId()) { $('#projMsg').textContent = 'Select a project.'; return; }
      await loadExistingPlanForMonth();
      await refreshPL();
    });

    wireRevenueUI(async () => { await refreshPL(); });

    // 7) Month change
    $('#monthPicker').addEventListener('change', async () => {
      $('#status').textContent = 'Loading month…';
      $('#laborMsg').textContent = '';
      $('#subsMsg').textContent = '';
      $('#equipMsg').textContent = '';
      $('#matMsg').textContent = '';
      await loadExistingPlanForMonth();
      await refreshPL();
      $('#status').textContent = '';
    });

  } catch (err) {
    console.error('Init error', err);
    const msg = (err && err.message) ? err.message : JSON.stringify(err || {}, null, 2);
    $('#status').textContent = `Error loading data: ${msg}`;
  }
}



init();
