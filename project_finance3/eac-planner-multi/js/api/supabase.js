// js/api/supabase.js

export const SUPABASE_URL = "https://yonpinjixytqooqyyzdh.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbnBpbmppeHl0cW9vcXl5emRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNjkwMzIsImV4cCI6MjA3NDk0NTAzMn0.8g9iNl4kmIm77u7TT8cylgcV872D45pzZGHJWBnZBGo";

if (!window.supabase) {
  console.error("[Supabase] global supabase object not found. Check script tag.");
}

export const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("[Supabase] client initialized:", !!client);
