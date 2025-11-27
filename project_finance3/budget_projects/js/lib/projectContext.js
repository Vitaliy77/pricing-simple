// js/lib/projectContext.js

let _selectedProject = null;

let _planContext = {
  year: null,
  versionId: null,
  versionCode: null,
  versionLabel: null,           // e.g. "BUDGET – Annual Budget"
  planType: "Working",
  level1ProjectId: null,
  level1ProjectCode: null,
  level1ProjectName: null,
};

// ────────────────────────────────────────────────────────────────
// Header Updates
// ────────────────────────────────────────────────────────────────
function updateProjectHeader() {
  const el = document.getElementById("currentProject");
  if (!el) return;

  if (!_selectedProject) {
    el.textContent = "";                 // ← Clean, no "No project selected"
    return;
  }

  const code = _selectedProject.project_code || _selectedProject.code || "";
  const name = _selectedProject.name || _selectedProject.project_name || "";
  el.textContent = `${code} – ${name}`.trim();
}

function updatePlanContextHeader() {
  const el = document.getElementById("planContextHeader");
  if (!el) return;

  const parts = [];

  if (_planContext.versionLabel) {
    parts.push(_planContext.versionLabel);
  } else if (_planContext.versionCode) {
    parts.push(_planContext.versionCode);
  }

  if (_planContext.planType) {
    parts.push(`${_planContext.planType} version`);
  }

  if (_planContext.level1ProjectCode) {
    const l1 = `Level 1 Project: ${_planContext.level1ProjectCode}` +
      (_planContext.level1ProjectName ? ` – ${_planContext.level1ProjectName}` : "");
    parts.push(l1);
  }

  el.textContent = parts.length ? parts.join(" · ") : "";
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────
export function setSelectedProject(project) {
  _selectedProject = project || null;

  // Always keep both headers in sync
  updateProjectHeader();
  updatePlanContextHeader();
}

export function getSelectedProject() {
  return _selectedProject;
}

/**
 * Smart & defensive project ID getter
 * Works whether you pass { id }, { project_id }, or even old data shapes
 */
export function getSelectedProjectId() {
  if (!_selectedProject) return null;

  // Most common cases
  if (_selectedProject.id) return _selectedProject.id;
  if (_selectedProject.project_id) return _selectedProject.project_id;

  // Fallback: maybe someone stored it directly in context (legacy)
  if (_planContext.projectId) return _planContext.projectId;

  return null;
}

export function setPlanContext(partial) {
  _planContext = { ..._planContext, ...partial };
  updatePlanContextHeader();
}

export function getPlanContext() {
  return { ..._planContext }; // immutable shallow copy
}
