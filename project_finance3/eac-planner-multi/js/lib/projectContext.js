// js/lib/projectContext.js

let _selectedProject = null;   // lowest-level project the user is working on
let _planContext = {
  year: null,                  // 2026 / 2027 / 2028
  versionId: null,             // plan_versions.id
  versionCode: null,           // optional – e.g. "BUD", "0+12F"
  planType: "Working",         // "Working" or "Final"
  level1ProjectId: null,       // id of the L1 project
  level1ProjectCode: null,
  level1ProjectName: null,
};

/**
 * project: { id, project_code, name }
 */
export function setSelectedProject(project) {
  _selectedProject = project || null;

  // Update header display
  const el = document.getElementById("currentProject");
  if (!el) return;

  if (!project) {
    el.textContent = "";
    return;
  }

  const code = project.project_code || project.code || "";
  const name = project.name || "";
  el.textContent = `${code} ${name}`.trim();
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
}

/**
 * Read the whole plan context object
 */
export function getPlanContext() {
  return _planContext;
}
