let _projectId = null;

export function getProjectId() { return _projectId; }
export function setProjectId(id) {
  _projectId = id || null;
  if (_projectId) localStorage.setItem('eac.currentProjectId', _projectId);
  else localStorage.removeItem('eac.currentProjectId');
}
export function restoreProjectId() {
  const v = localStorage.getItem('eac.currentProjectId');
  _projectId = v || null;
  return _projectId;
}
