let activeSession = null;
let sessionRequest = null;

function apiFailure(response, payload) {
  const item = payload?.errors?.[0];
  const error = new Error(item?.message || "项目服务暂时无法完成请求。");
  error.code = item?.code || "INTERNAL_ERROR";
  error.status = response.status;
  error.field = item?.field || null;
  return error;
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("项目服务返回了无法识别的响应。");
  }
  if (!response.ok || payload?.status !== "ok") throw apiFailure(response, payload);
  return payload;
}

export async function ensureProjectSession({ force = false } = {}) {
  if (!force && activeSession) return activeSession;
  if (!force && sessionRequest) return sessionRequest;
  sessionRequest = (async () => {
    try {
      const current = await call("/api/v1/session");
      activeSession = current.data;
      return activeSession;
    } catch (error) {
      if (error.status !== 401) throw error;
      const created = await call("/api/v1/session/bootstrap", { method: "POST", body: {} });
      const current = await call("/api/v1/session");
      activeSession = { ...current.data, csrf_token: created.data.csrf_token };
      return activeSession;
    }
  })();
  try {
    return await sessionRequest;
  } finally {
    sessionRequest = null;
  }
}

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function write(path, { method = "POST", body = {}, version = null } = {}) {
  const session = await ensureProjectSession();
  const response = await call(path, {
    method,
    body,
    headers: {
      "X-CSRF-Token": session.csrf_token,
      "Idempotency-Key": idempotencyKey(),
      ...(version == null ? {} : { "If-Match": `"v${version}"` }),
    },
  });
  return response;
}

export async function loadProjectWorkspace() {
  const session = await ensureProjectSession();
  const space = session.spaces?.[0];
  if (!space) throw new Error("当前安装尚未建立可用空间。");
  const query = new URLSearchParams({ space_id: space.id, limit: "200" });
  const projects = await call(`/api/v1/projects?${query.toString()}`);
  return { session, space, projects: projects.data.items, page: projects.meta.page };
}

export function createProject(input) {
  return write("/api/v1/projects", { body: input });
}

export function updateProject(projectId, version, patch) {
  return write(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: patch,
    version,
  });
}

export function transitionProject(projectId, version, action) {
  return write(`/api/v1/projects/${encodeURIComponent(projectId)}/transitions`, {
    body: { action },
    version,
  });
}

export function deleteProject(projectId, version) {
  return write(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    body: {},
    version,
  });
}

export async function loadProjectWorkItems(projectId) {
  const encoded = encodeURIComponent(projectId);
  const [milestones, tasks, discussions, decisions] = await Promise.all([
    call(`/api/v1/projects/${encoded}/milestones`),
    call(`/api/v1/projects/${encoded}/tasks`),
    call(`/api/v1/projects/${encoded}/discussions`),
    call(`/api/v1/projects/${encoded}/decisions`),
  ]);
  return {
    milestones: milestones.data.items,
    tasks: tasks.data.items,
    discussions: discussions.data.items,
    decisions: decisions.data.items,
  };
}

export function createMilestone(projectId, input) {
  return write(`/api/v1/projects/${encodeURIComponent(projectId)}/milestones`, { body: input });
}

export function updateMilestone(milestoneId, version, patch) {
  return write(`/api/v1/milestones/${encodeURIComponent(milestoneId)}`, {
    method: "PATCH",
    body: patch,
    version,
  });
}

export function createTask(projectId, input) {
  return write(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks`, { body: input });
}

export function transitionTask(taskId, version, action) {
  return write(`/api/v1/tasks/${encodeURIComponent(taskId)}/transitions`, {
    body: { action },
    version,
  });
}

export function createDiscussion(projectId, input) {
  return write(`/api/v1/projects/${encodeURIComponent(projectId)}/discussions`, { body: input });
}

export async function loadDiscussionEntries(discussionId) {
  const response = await call(`/api/v1/discussions/${encodeURIComponent(discussionId)}/entries`);
  return response.data.items;
}

export function createDiscussionEntry(discussionId, input) {
  return write(`/api/v1/discussions/${encodeURIComponent(discussionId)}/entries`, { body: input });
}

export function convertDiscussion(discussionId, input) {
  return write(`/api/v1/discussions/${encodeURIComponent(discussionId)}/conversions`, { body: input });
}

export async function loadCaptureInbox(status = "inbox") {
  const workspace = await loadProjectWorkspace();
  const query = new URLSearchParams({ space_id: workspace.space.id, status, limit: "200" });
  const captures = await call(`/api/v1/captures?${query.toString()}`);
  return { ...workspace, captures: captures.data.items };
}

export function createCapture(input) {
  return write("/api/v1/captures", { body: input });
}

export function transitionCapture(captureId, version, action) {
  return write(`/api/v1/captures/${encodeURIComponent(captureId)}/transitions`, {
    body: { action },
    version,
  });
}

export async function loadDaily(date) {
  const session = await ensureProjectSession();
  const space = session.spaces?.[0];
  if (!space) throw new Error("当前安装尚未建立可用空间。");
  const query = new URLSearchParams({ space_id: space.id });
  const response = await call(`/api/v1/daily/${encodeURIComponent(date)}?${query.toString()}`);
  return { space, ...response.data };
}

export function saveDailyPlan(date, spaceId, taskIds, version = null) {
  return write(`/api/v1/daily-plans/${encodeURIComponent(date)}`, {
    method: "PUT",
    body: { space_id: spaceId, task_ids: taskIds },
    version,
  });
}

export function saveDailyReview(date, spaceId, input, version = null) {
  return write(`/api/v1/daily-reviews/${encodeURIComponent(date)}`, {
    method: "PUT",
    body: { space_id: spaceId, ...input },
    version,
  });
}

export async function loadContextLibrary() {
  const workspace = await loadProjectWorkspace();
  const sourceQuery = new URLSearchParams({ space_id: workspace.space.id, status: "ready", limit: "200" });
  const packageQuery = new URLSearchParams({ space_id: workspace.space.id, status: "active", limit: "50" });
  const [sources, contextPackages] = await Promise.all([
    call(`/api/v1/sources?${sourceQuery.toString()}`),
    call(`/api/v1/context/packages?${packageQuery.toString()}`),
  ]);
  const firstPackage = contextPackages.data.items[0] || null;
  const activePackage = firstPackage
    ? await loadContextPackage(firstPackage.id, workspace.space.id)
    : null;
  return { ...workspace, sources: sources.data.items, contextPackages: contextPackages.data.items, activePackage };
}

export function importMarkdownSource(input) {
  return write("/api/v1/sources/imports/markdown", { body: input });
}

export async function loadContextPackage(packageId, spaceId) {
  const query = new URLSearchParams({ space_id: spaceId });
  const response = await call(`/api/v1/context/packages/${encodeURIComponent(packageId)}?${query.toString()}`);
  return response.data;
}

export function createContextPackage(input) {
  return write("/api/v1/context/packages", { body: input });
}

export function addContextPackageItem(packageId, version, input) {
  return write(`/api/v1/context/packages/${encodeURIComponent(packageId)}/items`, { body: input, version });
}

export function removeContextPackageItem(packageId, itemId, spaceId, version) {
  const query = new URLSearchParams({ space_id: spaceId });
  return write(`/api/v1/context/packages/${encodeURIComponent(packageId)}/items/${encodeURIComponent(itemId)}?${query.toString()}`, {
    method: "DELETE",
    body: {},
    version,
  });
}

export function archiveContextPackage(packageId, spaceId, version) {
  return write(`/api/v1/context/packages/${encodeURIComponent(packageId)}/transitions`, {
    body: { space_id: spaceId, action: "archive" },
    version,
  });
}

export async function searchContext({ spaceId, query, projectId = "", types = [], from = "", to = "", limit = 20 }) {
  const response = await call("/api/v1/context/search", {
    method: "POST",
    body: {
      space_id: spaceId,
      q: query,
      limit,
      ...(projectId ? { project_id: projectId } : {}),
      ...(types.length ? { types } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
  });
  return response.data;
}

export async function searchCurrentContext(query, options = {}) {
  const session = await ensureProjectSession();
  const space = session.spaces?.[0];
  if (!space) throw new Error("当前安装尚未建立可用空间。");
  return searchContext({ spaceId: space.id, query, ...options });
}

export async function loadRuntimeWorkspace() {
  const workspace = await loadProjectWorkspace();
  const spaceId = workspace.space.id;
  const query = new URLSearchParams({ space_id: spaceId, limit: "100" });
  const packageQuery = new URLSearchParams({ space_id: spaceId, status: "active", limit: "50" });
  const [runtimes, runs, candidates, approvals, contextPackages] = await Promise.all([
    call("/api/v1/runtimes"),
    call(`/api/v1/runs?${query.toString()}`),
    call(`/api/v1/candidates?${query.toString()}`),
    call(`/api/v1/approvals?${query.toString()}`),
    call(`/api/v1/context/packages?${packageQuery.toString()}`),
  ]);
  return {
    ...workspace,
    runtimes: runtimes.data.items,
    runs: runs.data.items,
    candidates: candidates.data.items,
    approvals: approvals.data.items,
    contextPackages: contextPackages.data.items,
  };
}

export async function loadRuntimePackage(packageId, spaceId) {
  return loadContextPackage(packageId, spaceId);
}

export async function loadRunDetails(runId, spaceId) {
  const encoded = encodeURIComponent(runId);
  const query = new URLSearchParams({ space_id: spaceId });
  const [run, events, checkpoints] = await Promise.all([
    call(`/api/v1/runs/${encoded}?${query.toString()}`),
    call(`/api/v1/runs/${encoded}/events?${query.toString()}`),
    call(`/api/v1/runs/${encoded}/checkpoints?${query.toString()}`),
  ]);
  return { run: run.data, events: events.data.items, checkpoints: checkpoints.data.items };
}

export function createAgentRun(input) {
  return write("/api/v1/runs", { body: input });
}

export function cancelAgentRun(runId, spaceId, version) {
  return write(`/api/v1/runs/${encodeURIComponent(runId)}/cancel`, {
    body: { space_id: spaceId, reason: "user_requested" },
    version,
  });
}

export function retryAgentRun(runId, spaceId, version) {
  return write(`/api/v1/runs/${encodeURIComponent(runId)}/retry`, {
    body: { space_id: spaceId },
    version,
  });
}

export function requestTaskCandidateApproval(candidateId, spaceId) {
  return write(`/api/v1/candidates/${encodeURIComponent(candidateId)}/approvals`, {
    body: { space_id: spaceId, reason_code: "apply_task_candidate" },
  });
}

export function resolveTaskCandidateApproval(approvalId, spaceId, version, decision) {
  return write(`/api/v1/approvals/${encodeURIComponent(approvalId)}/resolve`, {
    body: { space_id: spaceId, decision },
    version,
  });
}

export function applyTaskCandidate(candidateId, approvalId, spaceId, version) {
  return write(`/api/v1/candidates/${encodeURIComponent(candidateId)}/apply`, {
    body: { space_id: spaceId, approval_id: approvalId },
    version,
  });
}

export function runtimeEventStreamUrl(runId, spaceId, afterSeq = 0) {
  const query = new URLSearchParams({ space_id: spaceId, after_seq: String(afterSeq) });
  return `/api/v1/runs/${encodeURIComponent(runId)}/events/stream?${query.toString()}`;
}
