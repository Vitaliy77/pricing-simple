
// js/api/supabase.js
// CDN version — no import, use global supabase
const SUPABASE_URL = 'https://maisrqextcioxwfbghoy.supabase.co'; // your URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1haXNycWV4dGNpb3h3ZmJnaG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3Njk1OTksImV4cCI6MjA3ODM0NTU5OX0.TNUJnkwxfRQI_Lv6Xn5pvSXWTAWqM7ynW13ndVkFA_M';

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
