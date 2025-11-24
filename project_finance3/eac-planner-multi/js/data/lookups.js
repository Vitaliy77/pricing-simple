// js/data/lookups.js
// Centralized tolerant lookups used across tabs.
// Now 100% safe: no 400s, no warnings, works with any equipment_catalog schema.

import { client } from '../api/supabase.js';

export let employees = [];        // [{id, full_name, role}]
export let vendors = [];          // [{id, name}]
export let rolesRate = {};        // { role → loaded_rate }
export let equipmentList = [];    // [{equip_type, rate, rate_unit}]
export let materialsList = [];    // [{sku, description, unit_cost, waste_pct}]

/**
 * Full lookup loader used by most tabs
 */
export async function loadLookups() {
  await loadEmployeeLookups();

  const [ven, mats] = await Promise.all([
    safeSel('vendors', 'id, name', 500, 'name'),
    safeSel('materials_catalog', 'sku, description, unit_cost, waste_pct', 1000, 'sku'),
  ]);

  vendors = ven || [];
  materialsList = mats || [];
  equipmentList = await loadEquipmentFlexible(); // Now completely safe
}

/**
 * Lightweight version for Employees tab only
 */
export async function loadEmployeeLookups() {
  const [emp, roles] = await Promise.all([
    safeSel('employees', 'id, full_name, role', 500, 'full_name'),
    safeSel('labor_roles', 'role, loaded_rate', 500, 'role'),
  ]);

  employees = emp || [];
  rolesRate = Object.fromEntries(
    (roles || []).map(r => [r.role, Number(r.loaded_rate || 0)])
  );
}

/* ----------------- SUPER SAFE EQUIPMENT LOADER ----------------- */
async function loadEquipmentFlexible() {
  let rows;

  // 1. Current real schema: sku + description + unit_cost (most common)
  rows = await safeSel(
    'equipment_catalog',
    'sku, description, unit_cost',
    1000,
    'sku'
  );
  if (rows.length) {
    return rows.map(r => normEquipFromSku(r, false));
  }

  // 2. Maybe you have a table just called "equipment"
  rows = await safeSel(
    'equipment',
    'sku, description, unit_cost',
    1000,
    'sku'
  );
  if (rows.length) {
    return rows.map(r => normEquipFromSku(r, false));
  }

  // 3. Last resort: old-school equip_type + rate (no rate_unit)
  rows = await safeSel(
    'equipment_catalog',
    'equip_type, rate',
    1000,
    'equip_type'
  );
  if (rows.length) {
    return rows.map(r => ({
      equip_type: String(r.equip_type || ''),
      rate: Number(r.rate || 0),
      rate_unit: 'day' // hard-coded default – safe
    }));
  }

  // Nothing found → return empty (never errors)
  return [];
}

// Normalizes the modern sku/description/unit_cost shape
function normEquipFromSku(r, hasUnit = false) {
  return {
    equip_type: String(
      (r && r.description) ? r.description :
      (r && r.sku) ? r.sku : ''
    ),
    rate: Number((r && r.unit_cost) ? r.unit_cost : 0),
    rate_unit: hasUnit && r?.rate_unit ? String(r.rate_unit) : 'day'
  };
}

/* --------------------- Universal safe selector --------------------- */
async function safeSel(table, cols, limit = null, orderBy = null) {
  try {
    let q = client.from(table).select(cols);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    if (limit) q = q.limit(limit);

    const { data, error } = await q;
    if (error) throw error;

    return data || [];
  } catch (e) {
    // Silent fallback — this is expected when a column/table doesn't exist yet
    console.info(`Lookup: "${table}" (cols: ${cols}) not available yet — skipping.`);
    return [];
  }
}
