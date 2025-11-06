import { createClient } from '@supabase/supabase-js';

const BASE = 'https://yonpinjixytqooqyyzdh.supabase.co';
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
export const supabase = createClient(BASE, KEY);

/** Get indirect lines for any date range (defaults to current calendar year). */
export async function getIndirectLines(from?: string, to?: string) {
  const { start, end } = normalizeRange(from, to);
  const { data, error } = await supabase
    .from('indirect_lines')
    .select('id,label,ym,amount')
    .gte('ym', start)
    .lte('ym', end);
  if (error) throw error;
  return data;
}

/** If no inputs, use Jan 1 → Dec 31 of the current year. */
function normalizeRange(from?: string, to?: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const start = from ?? `${currentYear}-01-01`;
  const end   = to   ?? `${currentYear}-12-31`;
  return { start, end };
}
