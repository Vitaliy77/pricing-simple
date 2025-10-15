import { client } from '../api/supabase.js';

export let rolesRate = {};       // role -> loaded_rate
export let employees = [];       // [{id, full_name, role}]
export let vendors = [];         // [{id, name}]
export let equipmentList = [];   // [{equip_type, rate, rate_unit}]
export let materialsList = [];   // [{sku, description, unit_cost, waste_pct}]

export async function loadLookups() {
  // Labor roles -> loaded rate
  const { data: lr, error: lrErr } = await client
    .from('labor_roles')
    .select('role, base_rate, burden_pct');
  if (lrErr) throw new Error(lrErr.message);
  rolesRate = {};
  (lr || []).forEach(r => rolesRate[r.role] = +(r.base_rate * (1 + r.burden_pct)).toFixed(2));

  // Employees
  const { data: emp, error: eErr } = await client
    .from('employees')
    .select('id, full_name, role')
    .eq('is_active', true);
  if (eErr) throw new Error(eErr.message);
  employees = emp || [];

  // Subs/vendors
  const { data: subs, error: sErr } = await client
    .from('sub_vendors')
    .select('id, name')
    .order('name', { ascending: true });
  if (sErr) throw new Error(sErr.message);
  vendors = subs || [];

  // Equipment
  const { data: eq, error: eqErr } = await client
    .from('vw_equipment_catalog')
    .select('equip_type, rate, rate_unit')
    .order('equip_type');
  if (eqErr) throw new Error(eqErr.message);
  equipmentList = eq || [];

  // Materials
  const { data: mat, error: mErr } = await client
    .from('materials')
    .select('sku, description, unit_cost, waste_pct')
    .order('sku');
  if (mErr) throw new Error(mErr.message);
  materialsList = mat || [];
}
