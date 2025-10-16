// js/data/lookups.js
import { client } from '../api/supabase.js';

export let rolesRate = {};       // role -> loaded_rate
export let employees = [];       // [{id, full_name/name, role}]
export let vendors = [];         // [{id, name}]
export let equipmentList = [];   // [{equip_type, rate, rate_unit}]
export let materialsList = [];   // [{sku, description, unit_cost, waste_pct}]

async function safeFetch(label, from, select='*') {
  try {
    const { data, error } = await client.from(from).select(select);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn(`${label} fetch skipped:`, e?.message || e);
    return []; // don't break init
  }
}

export async function loadLookups() {
  // Labor roles
  {
    const data = await safeFetch('labor_roles', 'labor_roles', '*');
    rolesRate = {};
    (data || []).forEach(r => {
      const role = r.role ?? r.title ?? r.name;
      const base = Number(r.base_rate ?? r.rate ?? 0);
      const burden = Number(r.burden_pct ?? r.burden ?? 0);
      if (role) rolesRate[role] = +(base * (1 + burden)).toFixed(2);
    });
  }

  // Employees
  {
    const data = await safeFetch('employees', 'employees', '*');
    employees = (data || [])
      .filter(e => e.is_active === true || e.is_active === 1 || e.is_active == null)
      .map(e => ({
        id: e.id,
        full_name: e.full_name ?? e.name ?? '',
        role: e.role ?? e.title ?? ''
      }));
  }

  // Subs/vendors
  {
    const data = await safeFetch('sub_vendors', 'sub_vendors', '*');
    vendors = (data || []).map(v => ({ id: v.id, name: v.name ?? v.vendor_name ?? '' }));
  }

  // Equipment (try view, fallback to table)
  {
    let eq = await safeFetch('vw_equipment_catalog', 'vw_equipment_catalog', '*');
    if (!eq.length) eq = await safeFetch('equipment', 'equipment', '*');
    equipmentList = (eq || []).map(x => ({
      equip_type: x.equip_type ?? x.type ?? x.name ?? '',
      rate: Number(x.rate ?? x.unit_rate ?? 0),
      rate_unit: x.rate_unit ?? x.unit ?? 'hour'
    }));
  }

  // Materials
  {
    const data = await safeFetch('materials', 'materials', '*');
    materialsList = (data || []).map(m => ({
      sku: m.sku ?? m.code ?? '',
      description: m.description ?? m.name ?? '',
      unit_cost: Number(m.unit_cost ?? m.cost ?? 0),
      waste_pct: Number(m.waste_pct ?? m.waste ?? 0)
    }));
  }
}
