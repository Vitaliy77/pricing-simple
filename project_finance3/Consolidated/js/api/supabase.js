// js/api/supabase.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yonpinjixytqooqyyzdh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbnBpbmppeHl0cW9vcXl5emRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNjkwMzIsImV4cCI6MjA3NDk0NTAzMn0.8g9iNl4kmIm77u7TT8cylgcV872D45pzZGHJWBnZBGo';

export const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/* -------------------------------------------------------------
   Existing helpers (unchanged)
------------------------------------------------------------- */
export function initSupabase() { return client; }
export function getClient()    { return client; }

export function getCurrentYm() {
  const el = document.getElementById('monthPicker');
  return el?.value || new Date().toISOString().slice(0, 7); // YYYY-MM
}

/* -------------------------------------------------------------
   NEW: fetch indirect_lines for a **full year** (or any range)
------------------------------------------------------------- */
export async function fetchIndirectLinesForYear(year = 2025) {
  const start = `${year}-01-01`;   // first day of the year
  const end   = `${year}-12-31`;   // last day of the year

  const { data, error, status } = await client
    .from('indirect_lines')
    .select('id, label, ym, amount')
    .gte('ym', start)   // ≥ start date
    .lte('ym', end);    // ≤ end date

  if (error) {
    console.error('Supabase error:', error);
    throw new Error(`Supabase ${status}: ${error.message}`);
  }

  return data;   // array of rows
}

/* -------------------------------------------------------------
   OPTIONAL: fetch for the **currently selected month** only
------------------------------------------------------------- */
export async function fetchIndirectLinesForCurrentMonth() {
  const ym = getCurrentYm();               // e.g. "2025-03"
  const start = `${ym}-01`;                // first day of the month
  const end   = new Date(ym + '-01');
  end.setMonth(end.getMonth() + 1);        // next month
  end.setDate(0);                          // last day of current month
  const endStr = end.toISOString().slice(0, 10);

  const { data, error, status } = await client
    .from('indirect_lines')
    .select('id, label, ym, amount')
    .gte('ym', start)
    .lte('ym', endStr);

  if (error) throw new Error(`Supabase ${status}: ${error.message}`);
  return data;
}
