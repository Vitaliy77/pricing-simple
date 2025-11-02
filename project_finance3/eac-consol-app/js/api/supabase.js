// js/api/supabase.js
// Centralized Supabase client for the *consolidated* app.
// 👉 replace SUPABASE_URL and SUPABASE_ANON_KEY with your actual values.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let client = null;

export function initSupabase() {
  if (client) return client;
  const url = 'https://yonpinjixytqooqyyzdh.supabase.co';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbnBpbmppeHl0cW9vcXl5emRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNjkwMzIsImV4cCI6MjA3NDk0NTAzMn0.8g9iNl4kmIm77u7TT8cylgcV872D45pzZGHJWBnZBGo';
  client = createClient(url, key, {
    auth: { persistSession: false }
  });
  return client;
}

export function getClient() {
  if (!client) throw new Error('Supabase not initialized');
  return client;
}

// helper: get month prefix like "2025-06"
export function getCurrentYm() {
  const el = document.getElementById('monthPicker');
  return (el?.value || new Date().toISOString().slice(0,7));
}


