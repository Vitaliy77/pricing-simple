// js/data/lookups.js
// Centralized tolerant lookups used across tabs.

import { client } from '../api/supabase.js';

export let employees = [];     // [{id, full_name, role}]
export let vendors = [];       // [{id, name}]
export let rolesRate = {};     // { role -> loaded_rate }
export let equipmentList = []; // [{equip_type, rate, rate_unit}]
export let materialsList = []; // [{sku, description, unit_cost, waste_pct}]

/**
 * Full lookup loader used by tabs that need employees, vendors,
 * materials, equipment, etc.
 */
export async function loadLookups() {
  // Load employees + roles with the dedicated helper
  await loadEmployeeLookups();

  // Fetch common non-labor lookups in parallel
  const [ven, mats] = await Promise.all([
    safeSel('vendors',          'id, name',                         500, 'name'),
    safeSel('materials_catalog','sku, description, unit_cost, waste_pct', 1000, 'sku'),
  ]);

  vendors       = ven || [];
  materialsList = mats || [];

  // Equipment: flex loader that tries your likely schema first
  equipmentList = await loadEquipmentFlexible();
}

/**
 * Focused loader for Employees tab: only employees + labor roles.
 * This avoids pulling equipment/materials when not needed.
 */
export async function loadEmployeeLookups() {
  const [emp, roles] = await Promise.all([
    safeSel('employees',   'id, full_name, role', 500, 'full_name'),
    safeSel('labor_roles', 'role, loaded_rate',   500, 'role'),
  ]);

  employees = emp || [];
  rolesRate = Object.fromEntries(
    (roles || []).map(r => [r.role, Number(r.loaded_rate || 0)])
  );
}

/* ----------------- equipment flexible loader ----------------- */
async function loadEquipmentFlexible() {
  // Try the most common schema you have: sku/description/unit_cost[/rate_unit]
  let rows = await safeSel('equipment_catalog', 'sku, description, unit_cost, rate_unit', 1000, 'sku');
  if (rows.length) return rows.map(r => normEquipFromSku(r, /*hasUnit*/ true));

  rows = await safeSel('equipment_catalog', 'sku, description, unit_cost', 1000, 'sku');
  if (rows.length) return rows.map(r => normEquipFromSku(r, /*hasUnit*/ false));

  // Fall back to an alt table name, if you had one before
  rows = await safeSel('equipment', 'sku, description, unit_cost, rate_unit', 1000, 'sku');
  if (rows.length) return rows.map(r => normEquipFromSku(r, /*hasUnit*/ true));

  rows = await safeSel('equipment', 'sku, description, unit_cost', 1000, 'sku');
  if (rows.length) return rows.map(r => normEquipFromSku(r, /*hasUnit*/ false));

  // Finally try the original “type/rate” shape (only if it exists)
  rows = await safeSel('equipment_catalog', 'equip_type, rate, rate_unit', 1000, 'equip_type');
  if (rows.length) return rows.map(r => normEquipFromType(r));

  // Nothing found — return empty list
  return [];
}

function normEquipFromSku(r, hasUnit) {
  return {
    // Use human-readable description as the "type" label; fall back to sku
    equip_type: String(
      r && r.description
        ? r.description
        : r && r.sku
        ? r.sku
        : ''
    ),
    rate: Number(r && r.unit_cost ? r.unit_cost : 0),
    rate_unit: String(
      hasUnit && r && r.rate_unit
        ? r.rate_unit
        : 'day'
    ),
  };
}

function normEquipFromType(r) {
  return {
    equip_type: String(r && r.equip_type ? r.equip_type : ''),
    rate: Number(r && r.rate ? r.rate : 0),
    rate_unit: String(r && r.rate_unit ? r.rate_unit : 'day'),
  };
}

/* --------------------- helpers --------------------- */
async function safeSel(table, cols, limit, orderBy) {
  try {
    let q = client.from(table).select(cols);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    if (limit)   q = q.limit(limit);
    const res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  } catch (e) {
    console.warn(
      'Lookup: table "' + table + '" not available:',
      (e && e.message) ? e.message : e
    );
    return [];
  }
}
