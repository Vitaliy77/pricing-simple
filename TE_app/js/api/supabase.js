import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ugsedypndgtidbokttbk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnc2VkeXBuZGd0aWRib2t0dGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MTAxNDgsImV4cCI6MjA3OTE4NjE0OH0.cHwzZ7UcfbD0-vq5oedbACvH_wMzCEZFqc-_S1neDcU";

export const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
