// js/api/supabase.js
// Centralized Supabase client for the consolidated app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 👉 your actual project values
const SUPABASE_URL = 'https://yonpinjixytqooqyyzdh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbnBpbmppeHl0cW9vcXl5emRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNjkwMzIsImV4cCI6MjA3NDk0NTAzMn0.8g9iNl4kmIm77u7TT8cylgcV872D45pzZGHJWBnZBGo';

// single shared client
export const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// optional legacy helpers — use if some files call init/get
export function initSupabase() {
  return client;
}

export function getClient() {
  return client;
}

// helper: read current YYYY-MM from the month picker (or today)
export function getCurrentYm() {
  const el = document.getElementById('monthPicker');
  return el?.value || new Date().toISOString().slice(0, 7);
}
