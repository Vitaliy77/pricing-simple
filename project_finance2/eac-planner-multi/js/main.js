import { $ } from './lib/dom.js';
import { setProjectId, getProjectId, restoreProjectId } from './lib/state.js';
import { listProjects, createProject } from './data/projects.js';
import { loadLookups } from './data/lookups.js';
import { wireRevenueUI, loadRevenueSettings } from './features/revenue.js';
import { refreshPL } from './features/pl-table.js';

import { makeLaborRow, saveLabor } from './features/plan-labor.js';
import { makeSubRow, saveSubs } from './features/plan-subs.js';
import { makeEquipRow, saveEquip } from './features/plan-equipment.js';
import { makeMatRow, saveMat } from './features/plan-materials.js';

async function loadExistingPlanForMonth(clientSideOnly=false) {
  // This function mirrors the original behavior by fetching existing rows.
  // To keep modules isolated, we inline the minimal logic needed here.
  // (Alternatively, you can move these reads into modular files too.)
  //const { client, getProjectId() } = await import('./api/supabase.js');
  const ym = `${$('#monthPicker').value}-01`;
  $('#laborTbody').innerHTML = '';
  $('#subsTbody').innerHTML = '';
  $('#equipTbody').innerHTML = '';
  $('#matTbody').innerHTML = '';

  try {
    // Labor
    const { data: pl, error: plErr } = await client
      .from('plan_labor')
      .select('employee_id, hours, override_rate')
      .eq('project_id', getProjectId())
      .eq('ym', ym);
    if (plErr) throw plErr;
    (pl || []).forEach(r => $('#laborTbody').appendChild(makeLaborRow(r)));

    // Subs
    const { data: ps, error: psErr } = await client
      .from('plan_subs')
      .select('vendor_id, cost, note')
      .eq('project_id', getProjectId())
      .eq('ym', ym);
    if (psErr) throw psErr;
    (ps || []).forEach(r => $('#subsTbody').appendChild(makeSubRow(r)));

    // Equipment
    const { data: pe, error: peErr } = await client
      .from('plan_equipment')
      .select('equipment_type, hours')
      .eq('project_id', getProjectId())
      .eq('ym', ym);
    if (peErr) throw peErr;
    (pe || []).forEach(r => $('#equipTbody').appendChild(makeEquipRow(r)));

    // Materials
    const { data: pm, error: pmErr } = await client
      .from('plan_materials')
      .select('sku, qty')
      .eq('project_id', getProjectId())
      .eq('ym', ym);
    if (pmErr) throw pmErr;
    (pm || []).forEach(r => $('#matTbody').appendChild(makeMatRow(r)));
  } catch (err) {
    console.error('Error loading plan:', err);
    $('#status').textContent = `Error loading plan: ${err.message || err}`;
  }
}


async function refreshProjectsUI(selectAfterId=null) {
  $('#projMsg').textContent = 'Loading projects…';
  const projects = await listProjects();
  const sel = $('#projectSelect');
  if (!projects.length) {
    sel.innerHTML = '<option value="">No projects yet</option>';
    $('#projMsg').textContent = 'Create your first project.';
    setProjectId(null);
    return;
  }
  sel.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}${p.client? ' — '+p.client: ''}</option>`).join('');
  const toSelect = selectAfterId || getProjectId() || projects[0].id;
  sel.value = toSelect;
  setProjectId(sel.value);
  $('#projMsg').textContent = '';
}

async function ensureProjectSelected() {
  if (!getProjectId()) await refreshProjectsUI();
  return getProjectId();
}

async function promptNewProject() {
  const name = prompt('Project name:');
  if (!name) return;
  const client = prompt('Client (optional):') || null;
  const start_date = prompt('Start date YYYY-MM-DD (optional):') || null;
  const end_date = prompt('End date YYYY-MM-DD (optional):') || null;
  const id = await createProject({ name, client, start_date, end_date });
  await refreshProjectsUI(id);
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
    $('#saveLabor').onclick = async () => { await saveLabor(); await loadExistingPlanForMonth(); await refreshPL(); };
    $('#saveSubs').onclick  = async () => { await saveSubs();  await loadExistingPlanForMonth(); await refreshPL(); };
    $('#saveEquip').onclick = async () => { await saveEquip(); await loadExistingPlanForMonth(); await refreshPL(); };
    $('#saveMat').onclick   = async () => { await saveMat();   await loadExistingPlanForMonth(); await refreshPL(); };

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
