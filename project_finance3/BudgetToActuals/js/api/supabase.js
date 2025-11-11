
// js/api/supabase.js
// CDN version — no import, use global supabase
const SUPABASE_URL = 'https://yonpinjixytqooqyyzdh.supabase.co'; // your URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbnBpbmppeHl0cW9vcXl5emRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNjkwMzIsImV4cCI6MjA3NDk0NTAzMn0.8g9iNl4kmIm77u7TT8cylgcV872D45pzZGHJWBnZBGo';

let supabaseClient = null;

export function initSupabase() {
  if (supabaseClient) return Promise.resolve(supabaseClient);

  // Use global supabase from CDN
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    throw new Error('Supabase CDN not loaded. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> to index.html');
  }

  return Promise.resolve(supabaseClient);
}

export { supabaseClient as client };
