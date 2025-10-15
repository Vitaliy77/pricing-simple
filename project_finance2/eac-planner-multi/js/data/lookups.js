// js/data/lookups.js
import { client } from '../api/supabase.js';

export let rolesRate = {};       // role -> loaded_rate
export let employees = [];       // [{id, full_name/name, role}]
export let vendors = [];         // [{id, name}]
export let equipmentList = [];   // [{equip_type, rate, rate_unit}]
export let materialsList = [];   // [{sku, description, unit_cost, waste_pct}]

export async function loadLookups() {
  // Labor roles (be flexible)
  {
    const { data, error } = await client.from('labor_roles').select('*');
    if (error) throw error;
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
    const { data, error } = await client.from('employees').select('*');
    if (error) throw error;
    employees = (data || [])
      .filter(e => e.is_active === true || e.is_active === 1 || e.is_active == null) // allow missing flag
      .map(e => ({
        id: e.id,
        full_name: e.full_name ?? e.name ?? '',
        role: e.role ?? e.title ?? ''
      }));
  }

  // Subs/vendors
  {
    const { data, error } = await client.from('sub_vendors').select('*');
    if (error) throw error;
    vendors = (data || []).map(v => ({ id: v.id, name: v.name ?? v.vendor_name ?? '' }));
  }

  // Equipment
  {
    // use your view if present; else fallback to "equipment" table
    let eq = null, err = null;
    ({ data: eq, error: err } = await client.from('vw_equipment_catalog').select('*'));
    if (err) {
      const res = await client.from('equipment').select('*');
      if (res.error) throw res.error;
      eq = res.data;
    }
    equipmentList = (eq || []).map(x => ({
      equip_type: x.equip_type ?? x.type ?? x.name ?? '',
      rate: Number(x.rate ?? x.unit_rate ?? 0),
      rate_unit: x.rate_unit ?? x.unit ?? 'hour'
    }));
  }

  // Materials
  {
    const { data, error } = await client.from('materials').select('*');
    if (error) throw error;
    materialsList = (data || []).map(m => ({
      sku: m.sku ?? m.code ?? '',
      description: m.description ?? m.name ?? '',
      unit_cost: Number(m.unit_cost ?? m.cost ?? 0),
      waste_pct: Number(m.waste_pct ?? m.waste ?? 0)
    }));
  }
}
