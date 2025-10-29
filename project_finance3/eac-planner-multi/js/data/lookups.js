// js/data/lookups.js
// Centralized tolerant lookups used across tabs.

import { client } from '../api/supabase.js';

export let employees = [];     // [{id, full_name, role}]
export let vendors = [];       // [{id, name}]
export let rolesRate = {};     // { role -> loaded_rate }
export let equipmentList = []; // [{equip_type, rate, rate_unit}]
export let materialsList = []; // [{sku, description, unit_cost, waste_pct}]

export async function loadLookups() {
  // Fetch everything in parallel; tolerate missing tables.
  const [emp, ven, roles, mats] = await Promise.all([
    safeSel('employees',        'id, full_name, role',       500, 'full_name'),
    safeSel('vendors',          'id, name',                  500, 'name'),
    safeSel('labor_roles',      'role, loaded_rate',         500, 'role'),
    safeSel('materials_catalog','sku, description, unit_cost, waste_pct', 1000, 'sku'),
  ]);

  employees = emp || [];
  vendors   = ven || [];
  rolesRate = Object.fromEntries((roles || []).map(r => [r.role, Number(r.loaded_rate || 0)]));
  materialsList = mats || [];

  // Equipment: try multiple shapes/sources & normalize
  equipmentList = await loadEquipmentFlexible();
}

/* ----------------- equipment flexible loader ----------------- */
async function loadEquipmentFlexible() {
  // Try the expected shape first
  let rows = await safeSel('equipment_catalog', 'equip_type, rate, rate_unit', 1000, 'equip_type');
  if (rows.length) return rows.map(r => normEquip(r, 'type_rate'));

  // Try catalog with sku/description/unit_cost (our earlier SQL)
  rows = await safeSel('equipment_catalog', 'sku, description, unit_cost, rate_unit', 1000, 'sku');
  if (rows.length) return rows.map(r => normEquip(r, 'sku_desc_cost_unit'));

  // Try catalog with sku/description/unit_cost (no rate_unit)
  rows = await safeSel('equipment_catalog', 'sku, description, unit_cost', 1000, 'sku');
  if (rows.length) return rows.map(r => normEquip(r, 'sku_desc_cost'));

  // Try alternative table names you might have
  rows = await safeSel('equipment', 'sku, description, unit_cost, rate_unit', 1000, 'sku');
  if (rows.length) return rows.map(r => normEquip(r, 'sku_desc_cost_unit'));

  rows = await safeSel('equipment_items', 'sku, description, unit_cost', 1000, 'sku');
  if (rows.length) return rows.map(r => normEquip(r, 'sku_desc_cost'));

  // Nothing found — return empty list (UI will show empty dropdown)
  return [];
}

function normEquip(row, shape) {
  switch (shape) {
    case 'type_rate':
      return {
        equip_type: String(row.equip_type || ''),
        rate: Number(row.rate || 0),
        rate_unit: String(row.rate_unit || 'day'),
      };
    case 'sku_desc_cost_unit':
      return {
        equip_type: String(row.description || row.sku || ''),
        rate: Number(row.unit_cost || 0),
        rate_unit: String(row.rate_unit || 'day'),
      };
    case 'sku_desc_cost':
      return {
        equip_type: String(row.description || row.sku || ''),
        rate: Number(row.unit_cost || 0),
        rate_unit: 'day',
      };
    default:
      return { equip_type: '', rate: 0, rate_unit: 'day' };
  }
}

/* --------------------- helpers --------------------- */
async function safeSel(table, cols, limit = 100, orderBy = null) {
  try {
    let q = client.from(table).select(cols);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    if (limit)   q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn(`Lookup: table "${table}" not available:`, e && e.message ? e.message : e);
    return [];
  }
}
