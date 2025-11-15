// js/lib/grantContext.js

const KEY = 'selectedGrantId';

// Read current grant (in-memory first, then localStorage)
export function getSelectedGrantId() {
  if (window.__currentGrantId) return window.__currentGrantId;
  try {
    const v = localStorage.getItem(KEY);
    return v || null;
  } catch {
    return null;
  }
}

// Set current grant (store both in-memory + localStorage)
export function setSelectedGrantId(id) {
  window.__currentGrantId = id || null;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore storage errors
  }
}
