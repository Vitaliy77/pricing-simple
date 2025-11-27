// js/api/supabase.js

// Supabase v2 client from CDN (no bundler needed)
import { createClient } from "https://mzdomznhlvuejnazzsif.supabase.co";

// 🔴 REPLACE this with your actual project URL from Supabase
// It looks like: https://xxxxxxxxxxxx.supabase.co
const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";

// ✅ Use your publishable key here
const SUPABASE_KEY = "sb_publishable_Hz8nV_-6RUK4y1R4uTS3xA_leHoje73";

// Create a single shared client for the whole app
export const client = createClient(SUPABASE_URL, SUPABASE_KEY);
