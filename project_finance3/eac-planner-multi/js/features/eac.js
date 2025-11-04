import { client } from '../api/supabase.js';
import { refreshPL } from './pl-table.js';

export async function recomputeEAC() {
  const btn = document.getElementById('recomputeEac');
  const statusEl = document.getElementById('status');
  const projectId = (document.getElementById('projectSelect')?.value || '').trim();
  if (!projectId) { statusEl.textContent = 'Select a project first.'; return; }
  try {
    btn.disabled = true;
    btn.textContent = 'Recomputing…';
    statusEl.textContent = 'Recomputing EAC…';
    const { error } = await client.rpc('recompute_eac', { p_project_id: projectId });
    if (error) throw error;
    statusEl.textContent = 'Recompute finished. Refreshing…';
    await refreshPL();
    statusEl.textContent = 'Done.';
  } catch (err) {
    console.error('recomputeEAC error', err);
    statusEl.textContent = `EAC recompute error: ${err.message || err}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Recompute EAC';
  }
}
