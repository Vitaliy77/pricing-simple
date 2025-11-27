// js/api/supabase.js

// Supabase v2 client as a real ES module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Your real project URL and anon key
const SUPABASE_URL = "https://mzdomznhlvuejnazzsif.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16ZG9tem5obHZ1ZWpuYXp6c2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNTU5OTksImV4cCI6MjA3OTgzMTk5OX0.FI_2sG3WVGP2A_OXetzKlAxN0AjIX8WWnSFQssLCckg";

// Single shared client for the entire app
export const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
