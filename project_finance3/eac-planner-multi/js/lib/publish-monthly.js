// js/lib/publish-monthly.js
import { client } from '../api/supabase.js';

/**
 * Recompute monthly priced P&L for a project+year and upsert into plan_monthly_pl.
 * We price revenue using project's revenue_formula & fee_pct.
 */
export async function publishMonthlyPL(projectId, year) {
  // 1) loads
  const [
    projRes,
    empRes, rolesRes,
    equipRes, matsRes,
    planLabRes, planSubsRes, planEqRes, planMatRes, planOdcRes
  ] = await Promise.all([
    client.from('projects').select('id, revenue_formula, fee_pct').eq('id', projectId).single(),
    client.from('employees').select('id, role'),
    client.from('labor_roles').select('role, loaded_rate'),
    client.from('equipment_catalog').select('equipment_type, rate, rate_unit'),
    client.from('materials_catalog').select('sku, unit_cost, waste_pct'),
    client.from('plan_labor').select('project_id, employee_id, ym, hours').eq('project_id', projectId),
    client.from('plan_subs').select('project_id, vendor_id, ym, cost').eq('project_id', projectId),
    client.from('plan_equipment').select('project_id, equipment_type, ym, hours').eq('project_id', projectId),
    client.from('plan_materials').select('project_id, sku, ym, qty').eq('project_id', projectId),
    client.from('plan_odc').select('project_id, odc_type, ym, cost').eq('project_id', projectId),
  ]);

  if (projRes.error)  throw projRes.error;
  if (rolesRes.error) throw rolesRes.error;
  if (empRes.error)   throw empRes.error;
  if (equipRes.error) throw equipRes.error;
  if (matsRes.error)  throw matsRes.error;
  if (planLabRes.error || planSubsRes.error || planEqRes.error || planMatRes.error || planOdcRes.error) {
    throw new Error('Failed loading one or more plan_* tables.');
  }

  const proj = projRes.data;
  const yearStr = String(year);
  const months = Array.from({length:12}, (_,i)=>`${yearStr}-${String(i+1).padStart(2,'0')}`);

  // maps
  const empRole  = Object.fromEntries((empRes.data||[]).map(e => [e.id, e.role]));
  const roleRate = Object.fromEntries((rolesRes.data||[]).map(r => [r.role, Number(r.loaded_rate||0)]));
  const eqRate   = Object.fromEntries((equipRes.data||[]).map(e => [e.equipment_type, Number(e.rate||0)]));
  const matInfo  = Object.fromEntries((matsRes.data||[]).map(m => [m.sku, {unit: Number(m.unit_cost||0), w: Number(m.waste_pct||0)}]));

  // accumulators by month (strings 'YYYY-MM')
  const byM = {};
  months.forEach(m => byM[m] = { revenue:0, labor:0, subs:0, equipment:0, materials:0, odc:0 });

  const yearFilter = r => String(r.ym).slice(0,4) === yearStr;

  // labor cost
  for (const r of (planLabRes.data||[]).filter(yearFilter)) {
    const m = String(r.ym).slice(0,7);
    const role = empRole[r.employee_id] || '';
    const rate = roleRate[role] || 0;
    byM[m].labor += Number(r.hours||0) * rate;
  }
  // subs cost
  for (const r of (planSubsRes.data||[]).filter(yearFilter)) {
    const m = String(r.ym).slice(0,7);
    byM[m].subs += Number(r.cost||0);
  }
  // equipment cost
  for (const r of (planEqRes.data||[]).filter(yearFilter)) {
    const m = String(r.ym).slice(0,7);
    const rate = eqRate[r.equipment_type] || 0;
    byM[m].equipment += Number(r.hours||0) * rate;
  }
  // materials cost (loaded by waste)
  for (const r of (planMatRes.data||[]).filter(yearFilter)) {
    const m = String(r.ym).slice(0,7);
    const mi = matInfo[r.sku] || {unit:0,w:0};
    const loaded = mi.unit * (1 + mi.w);
    byM[m].materials += Number(r.qty||0) * loaded;
  }
  // odc cost
  for (const r of (planOdcRes.data||[]).filter(yearFilter)) {
    const m = String(r.ym).slice(0,7);
    byM[m].odc += Number(r.cost||0);
  }

  // price revenue by project rule
  const rule = proj?.revenue_formula || 'TM';
  const fee  = Number(proj?.fee_pct || 0);
  const price = (dc, rule, fee) => {
    switch (rule) {
      case 'COST_PLUS': return dc * (1 + fee/100);
      case 'TM':        return dc;               // adjust later if needed
      case 'FP':        return dc;               // placeholder
      default:          return dc;
    }
  };

  months.forEach(m => {
    const dc = byM[m].labor + byM[m].subs + byM[m].equipment + byM[m].materials + byM[m].odc;
    byM[m].revenue = price(dc, rule, fee);
  });

  // payload
  const rows = months.map(m => ({
    project_id: projectId,
    ym: m + '-01',
    revenue: byM[m].revenue,
    labor: byM[m].labor,
    subs: byM[m].subs,
    equipment: byM[m].equipment,
    materials: byM[m].materials,
    odc: byM[m].odc,
  }));

  // upsert
  const { error: upErr } = await client
    .from('plan_monthly_pl')
    .upsert(rows, { onConflict: 'project_id,ym' });

  if (upErr) throw upErr;
}
