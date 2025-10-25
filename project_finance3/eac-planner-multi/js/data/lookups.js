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
  const [emp, ven, roles, equip, mats] = await Promise.all([
    safeSel('employees',        'id, full_name, role',       500, 'full_name'),
    safeSel('vendors',          'id, name',                  500, 'name'),
    safeSel('labor_roles',      'role, loaded_rate',         500, 'role'),
    safeSel('equipment_catalog','equip_type, rate, rate_unit',500, 'equip_type'),
    safeSel('materials_catalog','sku, description, unit_cost, waste_pct', 1000, 'sku'),
  ]);

  employees = emp;
  vendors   = ven;
  rolesRate = Object.fromEntries((roles || []).map(r => [r.role, Number(r.loaded_rate || 0)]));

  // If you don’t have these catalogs yet, the arrays will be empty (that’s fine).
  equipmentList = equip || [];
  materialsList = mats || [];
}

// ------------- helpers -------------
async function safeSel(table, cols, limit = 100, orderBy = null) {
  try {
    let q = client.from(table).select(cols);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    if (limit)   q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn(`Lookup: table "${table}" not available:`, e?.message || e);
    return [];
  }
}
