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

  // ← NEW: Keep lowest-level project in context too (for extra safety)
  projectId: null,
  projectName: "",
};

// ────────────────────────────────────────────────────────────────
// Header Updates
// ────────────────────────────────────────────────────────────────
function updateProjectHeader() {
  const el = document.getElementById("currentProject");
  if (!el) return;

  if (!_selectedProject) {
    el.textContent = "";
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

  // Extract ID and name defensively
  const id = project?.id ?? project?.project_id ?? null;
  const name = project?.name ?? project?.project_name ?? project?.code ?? "";

  // Keep planContext in sync (this is the key improvement)
  if (id) {
    _planContext.projectId = id;
    _planContext.projectName = name;
  } else {
    _planContext.projectId = null;
    _planContext.projectName = "";
  }

  console.log("[projectContext] setSelectedProject →", { project, id, name, _planContext });

  // Always update both headers
  updateProjectHeader();
  updatePlanContextHeader();
}

export function getSelectedProject() {
  return _selectedProject;
}

/**
 * Ultra-robust project ID getter
 * Works no matter how the data comes in
 */
export function getSelectedProjectId() {
  // 1. Direct from selected project
  if (_selectedProject?.id) return _selectedProject.id;
  if (_selectedProject?.project_id) return _selectedProject.project_id;

  // 2. From planContext (backup)
  if (_planContext.projectId) return _planContext.projectId;

  // 3. Nothing
  return null;
}

export function setPlanContext(partial) {
  _planContext = { ..._planContext, ...partial };
  updatePlanContextHeader();
}

export function getPlanContext() {
  return { ..._planContext }; // immutable copy
}
