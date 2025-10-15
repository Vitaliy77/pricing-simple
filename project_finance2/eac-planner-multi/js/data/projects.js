import { client } from '../api/supabase.js';

export async function listProjects() {
  const { data, error } = await client
    .from('projects')
    .select('id, name, client, start_date, end_date, status')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createProject(input) {
  const payload = {
    name: input.name?.trim(),
    client: input.client?.trim() || null,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    status: input.status || 'ACTIVE'
  };
  if (!payload.name) throw new Error('Project name is required.');
  const { data, error } = await client.from('projects').insert(payload).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteProject(id) {
  const { error } = await client.from('projects').delete().eq('id', id);
  if (error) throw error;
}
