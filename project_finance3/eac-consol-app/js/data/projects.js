// js/data/projects.js
import { client } from '../api/supabase.js';

export async function listProjects() {
  // Keep it simple: only select columns we’re sure about
  const { data, error } = await client
    .from('projects')
    .select('id, name');   // ← only id + name for now
  if (error) throw error;
  return data || [];
}

export async function createProject(input) {
  const payload = { name: (input.name || '').trim() };  // ← only name
  if (!payload.name) throw new Error('Project name is required.');
  const { data, error } = await client
    .from('projects')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteProject(id) {
  const { error } = await client.from('projects').delete().eq('id', id);
  if (error) throw error;
}
