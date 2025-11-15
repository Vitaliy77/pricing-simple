// js/lib/grantContext.js
// Central place to store the "currently selected grant" for the whole app

const STORAGE_KEY = 'gbapp_selected_grant_id';

let currentGrantId = null;
const listeners = new Set();

// Initialize from localStorage on first load
try {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved) currentGrantId = saved;
} catch (e) {
  console.warn('[grantContext] localStorage unavailable', e);
}

/**
 * Get currently selected grant id (string uuid or null)
 */
export function getSelectedGrantId() {
  return currentGrantId;
}

/**
 * Set the currently selected grant id.
 * - Persists to localStorage
 * - Notifies subscribers
 */
export function setSelectedGrantId(id) {
  const val = id || null;
  currentGrantId = val;

  try {
    if (val) window.localStorage.setItem(STORAGE_KEY, val);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[grantContext] localStorage write failed', e);
  }

  // notify listeners
  listeners.forEach(fn => {
    try { fn(currentGrantId); } catch (e) { console.error(e); }
  });
}

/**
 * Subscribe to grant changes.
 * Returns an unsubscribe function.
 */
export function onGrantChange(fn) {
  if (typeof fn === 'function') listeners.add(fn);
  return () => listeners.delete(fn);
}
