// js/api/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yonpinjixytqooqyyzdh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbnBpbmppeHl0cW9vcXl5emRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNjkwMzIsImV4cCI6MjA3NDk0NTAzMn0.8g9iNl4kmIm77u7TT8cylgcV872D45pzZGHJWBnZBGo';


let client = null;

export function initSupabase() {
  if (client) return Promise.resolve(client);
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return Promise.resolve(client);
}

export { client };
