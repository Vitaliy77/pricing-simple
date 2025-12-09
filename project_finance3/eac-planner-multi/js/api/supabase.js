// js/api/supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://yonpinjixytqooqyyzdh.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbnBpbmppeHl0cW9vcXl5emRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNjkwMzIsImV4cCI6MjA3NDk0NTAzMn0.8g9iNl4kmIm77u7TT8cylgcV872D45pzZGHJWBnZBGo";

export const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Optional: quick sanity log so you can see it’s working
console.log("[Supabase] client initialised:", !!client);
