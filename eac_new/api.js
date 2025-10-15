import { client, PROJECT_ID } from './config.js';
import { ymToDate } from './state.js';

export async function loadLookups(){
  const [roles, emp, subs, eq, mat] = await Promise.all([
    client.from('labor_roles').select('role, base_rate, burden_pct'),
    client.from('employees').select('id, full_name, role').eq('is_active', true),
    client.from('sub_vendors').select('id, name').order('name'),
    client.from('vw_equipment_catalog').select('equip_type, rate, rate_unit').order('equip_type'),
    client.from('materials').select('sku, description, unit_cost, waste_pct').order('sku')
  ]);
  if (roles.error) throw roles.error;
  if (emp.error) throw emp.error;
  if (subs.error) throw subs.error;
  if (eq.error) throw eq.error;
  if (mat.error) throw mat.error;
  return {
    roles: roles.data || [],
    employees: emp.data || [],
    vendors: subs.data || [],
    equipment: eq.data || [],
    materials: mat.data || []
  };
}

export async function upsertPlan(table, rows){
  return client.from(table).upsert(rows);
}

export async function fetchPlan(table, ym){
  return client.from(table)
    .select('*')
    .eq('project_id', PROJECT_ID)
    .eq('ym', ymToDate(ym));
}

export async function fetchPL(year){
  const start = `${year}-01-01`, end = `${year+1}-01-01`;
  const costs = await client.from('vw_eac_monthly_pl')
    .select('ym, labor, equip, materials, subs, fringe, overhead, gna, total_cost')
    .eq('project_id', PROJECT_ID).gte('ym', start).lt('ym', end).order('ym');
  if (costs.error) throw costs.error;

  const rev = await client.from('vw_eac_revenue_monthly')
    .select('ym, revenue')
    .eq('project_id', PROJECT_ID).gte('ym', start).lt('ym', end).order('ym');
  if (rev.error) throw rev.error;

  return { costs: costs.data || [], rev: rev.data || [] };
}

export async function loadRevenuePolicy(){
  const { data, error } = await client
    .from('project_revenue_policy')
    .select('method, fee_pct, mat_markup_pct, subs_markup_pct, equip_markup_pct')
    .eq('project_id', PROJECT_ID).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || { method:'TM', fee_pct:0, mat_markup_pct:0, subs_markup_pct:0, equip_markup_pct:0 };
}

export async function saveRevenuePolicy(payload){
  return client.from('project_revenue_policy').upsert(payload, { onConflict: 'project_id' });
}
