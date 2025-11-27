// js/lib/projectContext.js

let _selectedProject = null;   // lowest-level project the user is working on
let _planContext = {
  year: null,                  // 2026 / 2027 / 2028
  versionId: null,             // plan_versions.id
  versionCode: null,           // e.g. "BUDGET"
  versionLabel: null,          // e.g. "BUDGET – Annual Budget"
  planType: "Working",         // "Working" or "Final"
  level1ProjectId: null,
  level1ProjectCode: null,
  level1ProjectName: null,
};

function updateProjectHeader() {
  const el = document.getElementById("currentProject");
  if (!el) return;

  if (!_selectedProject) {
    el.textContent = "";
    return;
  }

  const code = _selectedProject.project_code || _selectedProject.code || "";
  const name = _selectedProject.name || "";
  el.textContent = `${code} ${name}`.trim();
}

function updatePlanContextHeader() {
  const el = document.getElementById("planContextHeader");
  if (!el) return;

  const parts = [];

  // Example: "BUDGET – Annual Budget"
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

  el.textContent = parts.join(" · ");
}

/**
 * project: { id, project_code, name }
 */
export function setSelectedProject(project) {
  _selectedProject = project || null;
  updateProjectHeader();
}

export function getSelectedProject() {
  return _selectedProject;
}

export function getSelectedProjectId() {
  return _selectedProject?.id ?? null;
}

/**
 * Update plan context (you can pass partials)
 * e.g. setPlanContext({ year: 2026, versionId: "uuid", planType: "Working" })
 */
export function setPlanContext(partial) {
  _planContext = {
    ..._planContext,
    ...partial,
  };
  updatePlanContextHeader();
}

/**
 * Read the whole plan context object
 */
export function getPlanContext() {
  return _planContext;
}
