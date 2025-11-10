// js/api/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

let client = null;

export function initSupabase() {
  if (client) return Promise.resolve(client);
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return Promise.resolve(client);
}

export { client };
