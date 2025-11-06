// js/api/indirect.js
import { client } from './supabase.js';

/** Normalize a date range. Defaults to the current calendar year. */
function normalizeRange(from, to) {
  const now = new Date();
  const y = now.getFullYear();
  const start = from ?? `${y}-01-01`;
  const end   = to   ?? `${y}-12-31`;
  return { start, end };
}

/** Fetch indirect_lines for any range (DATE column recommended for ym). */
export async function getIndirectLines(from, to) {
  const { start, end } = normalizeRange(from, to);

  const { data, error, status } = await client
    .from('indirect_lines')
    .select('id, label, ym, amount')
    .gte('ym', start)
    .lte('ym', end);

  if (error) throw new Error(`Supabase ${status}: ${error.message}`);
  return data;
}

/** Convenience: current calendar year. */
export async function getIndirectLinesForYear(year) {
  const y = year ?? new Date().getFullYear();
  return getIndirectLines(`${y}-01-01`, `${y}-12-31`);
}

/** Convenience: rolling 12 months ending this month. */
export async function getIndirectLinesRolling12() {
  const d = new Date();
  const lastDayThisMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    .toISOString().slice(0, 10);
  const firstDay12moAgo = new Date(d.getFullYear(), d.getMonth() - 11, 1)
    .toISOString().slice(0, 10);
  return getIndirectLines(firstDay12moAgo, lastDayThisMonth);
}
