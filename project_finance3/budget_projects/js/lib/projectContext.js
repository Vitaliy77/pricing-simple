// js/lib/projectContext.js

let _selectedProject = null;

let _planContext = {
  year: null,
  versionId: null,
  versionCode: null,
  versionLabel: null,
  planType: "Working",
  level1ProjectId: null,
  level1ProjectCode: null,
  level1ProjectName: null,

  // Lowest-level selected project (for Revenue/Cost/P&L)
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

  const id =
    project && ("id" in project
      ? project.id
      : "project_id" in project
      ? project.project_id
      : null);

  const name =
    project?.name ??
    project?.project_name ??
    project?.code ??
    project?.project_code ??
    "";

  _planContext.projectId = id;
  _planContext.projectName = name;

  console.log("[projectContext] AFTER setSelectedProject planContext =", 
    JSON.stringify(_planContext)
  );

  updateProjectHeader();
  updatePlanContextHeader();
}

export function getSelectedProject() {
  return _selectedProject;
}

/**
 * Ultra-robust — works even if _selectedProject is stale
 */
export function getSelectedProjectId() {
  if (_selectedProject?.id) return _selectedProject.id;
  if (_selectedProject?.project_id) return _selectedProject.project_id;
  if (_planContext.projectId) return _planContext.projectId;
  return null;
}

export function setPlanContext(partial) {
  _planContext = { ..._planContext, ...partial };
  updatePlanContextHeader();
}

export function getPlanContext() {
  return { ..._planContext };
}
