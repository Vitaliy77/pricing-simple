
// js/api/supabase.js
// CDN version — no import, use global supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const client = createClient(
  const SUPABASE_URL = 'https://maisrqextcioxwfbghoy.supabase.co'; // your URL
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1haXNycWV4dGNpb3h3ZmJnaG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3Njk1OTksImV4cCI6MjA3ODM0NTU5OX0.TNUJnkwxfRQI_Lv6Xn5pvSXWTAWqM7ynW13ndVkFA_M';
 
  { auth: { persistSession: true, autoRefreshToken: true } }
);
