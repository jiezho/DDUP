import { apiGet, apiPost, apiPostForm, buildHeaders } from "./api";

export type HermesOverview = {
  repo_root: string;
  instances_count: number;
  active_instances_count: number;
  online_instances_count: number;
  skills_count: number;
  shared_memory_files_count: number;
  outputs_entries_count: number;
  runtime: {
    wiki_raw_files_count: number;
    wiki_compiled_files_count: number;
    cron_archive_files_count: number;
    published_skills_count: number;
    memory_namespaces_count: number;
  };
  coverage: Record<string, boolean>;
  current_focus: string[];
};

export type HermesBlueprint = {
  principles: { title: string; description: string }[];
  interfaces: { name: string; scope: string; contract: string; status: string }[];
  lifecycle: { stage: string; description: string; checkpoints: string[] }[];
  pending_tasks: { priority: string; title: string; description: string }[];
};

export type HermesInstanceListItem = {
  id: string;
  name: string;
  status: string;
  description: string;
  deployment: {
    type: string;
    host_label: string;
    hermes_version: string;
    data_path_present: boolean;
  };
  capabilities: {
    model: string | null;
    context_window: number | null;
    platforms: string[];
    toolsets: string[];
    skills_count: number | null;
    skill_hub_available: number | null;
    max_subagents: number | null;
    declared_count: number;
    summary_tags: string[];
  };
  specialization: string[];
  published_skills: string[];
  sub_agents_count: number;
  cron_jobs_count: number;
  memory: {
    files_count: number;
    latest_updated_at: string | null;
    recent_files: { name: string; relative_path: string; updated_at: string; size: number }[];
  };
  outputs: {
    entries_count: number;
    latest_entry: { title?: string; summary?: string; archived_at?: string } | null;
  };
  data_assets_summary: Record<string, number>;
};

export type HermesInstanceDetail = HermesInstanceListItem & {
  sub_agents: { name: string; type?: string; trigger?: string; output_target?: string }[];
  cron_jobs: { name: string; schedule?: string; output_target?: string }[];
};

export type HermesSkillsResponse = {
  version: string;
  updated_at: string | null;
  skills_count: number;
  skills: { name: string; version?: string; description?: string; author?: string; tags?: string[]; priority?: string; path?: string }[];
};

export type HermesSearchResponse = {
  query: string;
  total: number;
  items: {
    source: string;
    id: string;
    title: string;
    snippet: string;
    instance_id?: string | null;
    access?: string | null;
    file_path?: string | null;
  }[];
};

export type HermesSearchFilters = {
  query: string;
  sources?: string[];
  instanceId?: string | null;
  limit?: number;
};

export type HermesRuntimeStatus = {
  cron: {
    registry_present: boolean;
    jobs_total: number;
    active_jobs: number;
    owners: string[];
  };
  archives: {
    entries_count: number;
    index_present: boolean;
    recent_entries: {
      id: string;
      instance_id?: string;
      job_id?: string;
      title?: string;
      summary?: string;
      archived_at?: string;
      file_path?: string;
    }[];
  };
  storage: {
    policy_present: boolean;
    endpoint: string;
    bucket: string;
    credentials_present: boolean;
    namespace_pattern?: string | null;
    retention_days?: number | null;
    git_max_bytes?: number | null;
    probe: {
      reachable?: boolean;
      status?: string;
      host?: string;
      port?: number;
    };
  };
  isolation: {
    present: boolean;
    rules_count: number;
    enforcement_level: string;
    block_on_violation: boolean;
    audit_violations: boolean;
    shared_memory_cross_read: boolean;
    storage_cross_read: boolean;
    compiled_wiki_readonly: boolean;
  };
  lifecycle_tasks: {
    key: string;
    stage: string;
    title: string;
    status: string;
    detail: string;
  }[];
};

export type HermesFeedbackSummary = {
  focus: string[];
  pending: { priority: string; title: string; description: string; status: string }[];
  feedback: { key: string; level: string; title: string; description: string }[];
  recent_actions: { action: string; resource_type: string; resource_id: string; created_at: string }[];
  operational_jobs: {
    job_id: string;
    owner: string;
    schedule: string;
    configured_status: string;
    derived_status: string;
    last_execution_status: string | null;
    archive_count: number;
    success_count: number;
    failure_count: number;
    last_archived_at: string | null;
    last_success_at: string | null;
    last_failure_at: string | null;
    last_duration_ms: number | null;
    latest_title: string | null;
    last_failure_summary: string | null;
    last_failure_message: string | null;
    last_failure_hint: string | null;
  }[];
  metrics: {
    open_tasks: number;
    in_progress_tasks: number;
    recent_actions: number;
    active_instances: number;
    operational_jobs: number;
    stale_jobs: number;
  };
};

export type HermesOpsCheck = {
  environment: {
    ddup_path_configured: boolean;
    hermes_api_configured: boolean;
    wiki_enabled: boolean;
    storage_configured: boolean;
    isolation_rules_present: boolean;
  };
  integrity: {
    registry_present: boolean;
    skills_manifest_present: boolean;
    outputs_index_present: boolean;
    shared_memory_present: boolean;
    wiki_raw_present: boolean;
    cron_registry_present: boolean;
  };
  runtime: HermesRuntimeStatus;
  recommendations: {
    level: string;
    title: string;
    description: string;
  }[];
};

export type HermesRegisterInstanceInput = {
  id: string;
  name: string;
  description?: string;
  deployment_type?: string;
  host?: string;
  hermes_version?: string;
  data_path?: string;
  model?: string | null;
  context_window?: number | null;
  platforms?: string[];
  toolsets?: string[];
  skills_count?: number | null;
  skill_hub_available?: number | null;
  max_subagents?: number | null;
  specialization?: string[];
  published_skills?: string[];
  status?: string;
};

export type HermesMemoryWriteInput = {
  instance_id: string;
  scope: "self" | "shared";
  key: string;
  content: string;
};

export type HermesWikiWriteInput = {
  instance_id: string;
  title: string;
  content: string;
  tags?: string[];
};

export type HermesStoragePresignOut = {
  status: string;
  url: string | null;
  expires_in: string | null;
  key: string;
  message?: string | null;
};

export type HermesStorageUploadInput = {
  file: File;
  instanceId?: string | null;
  category?: string;
  tags?: Record<string, string>;
};

export type HermesStorageUploadOut = {
  status: string;
  key: string | null;
  url: string | null;
  size_bytes: number;
  original_name: string | null;
  message?: string | null;
};

export type HermesStorageListResponse = {
  status: string;
  total: number;
  objects: { key: string; size: number; last_modified: string | null }[];
  prefix: string;
  message?: string | null;
};

export type HermesStorageListFilters = {
  instanceId?: string | null;
  prefix?: string | null;
  limit?: number;
};

export type HermesStoragePresignInput = {
  key: string;
  expires_days?: number;
};

export type HermesStorageDeleteInput = {
  key: string;
  instance_id?: string | null;
};

export type HermesStorageDeleteOut = {
  status: string;
  deleted: string | null;
  message?: string | null;
};

export type HermesStorageDownloadInput = {
  key: string;
  instance_id?: string | null;
};

export type HermesActionResult = {
  status: string;
  message?: string | null;
  instance_id?: string | null;
  path?: string | null;
  scope?: string | null;
  created_paths?: string[];
};

export type HermesArchiveWriteInput = {
  instance_id: string;
  job_id: string;
  title: string;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export async function getHermesOverview(): Promise<HermesOverview> {
  return apiGet<HermesOverview>("/api/hermes/overview");
}

export async function getHermesBlueprint(): Promise<HermesBlueprint> {
  return apiGet<HermesBlueprint>("/api/hermes/blueprint");
}

export async function getHermesInstances(): Promise<{ items: HermesInstanceListItem[]; total: number }> {
  return apiGet<{ items: HermesInstanceListItem[]; total: number }>("/api/hermes/instances");
}

export async function getHermesInstanceDetail(instanceId: string): Promise<HermesInstanceDetail> {
  return apiGet<HermesInstanceDetail>(`/api/hermes/instances/${instanceId}`);
}

export async function getHermesSkills(): Promise<HermesSkillsResponse> {
  return apiGet<HermesSkillsResponse>("/api/hermes/skills");
}

export async function getHermesRuntime(limit = 5): Promise<HermesRuntimeStatus> {
  return apiGet<HermesRuntimeStatus>(`/api/hermes/runtime?limit=${limit}`);
}

export async function getHermesFeedbackSummary(actionLimit = 8): Promise<HermesFeedbackSummary> {
  return apiGet<HermesFeedbackSummary>(`/api/hermes/feedback/summary?action_limit=${actionLimit}`);
}

export async function getHermesOpsCheck(): Promise<HermesOpsCheck> {
  return apiGet<HermesOpsCheck>("/api/hermes/ops/check");
}

export async function getHermesStorageObjects(filters: HermesStorageListFilters = {}): Promise<HermesStorageListResponse> {
  const params = new URLSearchParams({ limit: String(filters.limit ?? 20) });
  if (filters.instanceId) {
    params.set("instance_id", filters.instanceId);
  }
  if (filters.prefix) {
    params.set("prefix", filters.prefix);
  }
  return apiGet<HermesStorageListResponse>(`/api/hermes/storage/objects?${params.toString()}`);
}

export async function uploadHermesStorageObject(payload: HermesStorageUploadInput): Promise<HermesStorageUploadOut> {
  const form = new FormData();
  form.append("file", payload.file);
  form.append("category", payload.category || "assets");
  if (payload.instanceId) {
    form.append("instance_id", payload.instanceId);
  }
  if (payload.tags && Object.keys(payload.tags).length > 0) {
    form.append("tags", JSON.stringify(payload.tags));
  }
  return apiPostForm<HermesStorageUploadOut>("/api/hermes/storage/upload", form);
}

export async function searchHermesLibrary(filters: string | HermesSearchFilters): Promise<HermesSearchResponse> {
  const normalized =
    typeof filters === "string"
      ? { query: filters, limit: 12 }
      : { query: filters.query, limit: filters.limit ?? 12, sources: filters.sources, instanceId: filters.instanceId };
  const params = new URLSearchParams({ q: normalized.query, limit: String(normalized.limit ?? 12) });
  (normalized.sources || []).forEach((source) => params.append("sources", source));
  if (normalized.instanceId) {
    params.set("instance_id", normalized.instanceId);
  }
  return apiGet<HermesSearchResponse>(`/api/hermes/search?${params.toString()}`);
}

export async function registerHermesInstance(payload: HermesRegisterInstanceInput): Promise<HermesActionResult> {
  return apiPost<HermesActionResult>("/api/hermes/instances/register", payload);
}

export async function saveHermesArchive(payload: HermesArchiveWriteInput): Promise<HermesActionResult> {
  return apiPost<HermesActionResult>("/api/hermes/archive/save", payload);
}

export async function presignHermesStorageObject(payload: HermesStoragePresignInput): Promise<HermesStoragePresignOut> {
  return apiPost<HermesStoragePresignOut>("/api/hermes/storage/presign", payload);
}

export async function deleteHermesStorageObject(payload: HermesStorageDeleteInput): Promise<HermesStorageDeleteOut> {
  return apiPost<HermesStorageDeleteOut>("/api/hermes/storage/delete", payload);
}

export async function downloadHermesStorageObject(payload: HermesStorageDownloadInput): Promise<void> {
  const params = new URLSearchParams({ key: payload.key });
  if (payload.instance_id) {
    params.set("instance_id", payload.instance_id);
  }
  const response = await fetch(`/api/hermes/storage/download?${params.toString()}`, {
    headers: buildHeaders()
  });
  if (!response.ok) {
    throw new Error(`GET /api/hermes/storage/download failed: ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = payload.key.split("/").pop() || "download.bin";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function saveHermesMemory(payload: HermesMemoryWriteInput): Promise<HermesActionResult> {
  return apiPost<HermesActionResult>("/api/hermes/memory/save", payload);
}

export async function writeHermesWikiRaw(payload: HermesWikiWriteInput): Promise<HermesActionResult> {
  return apiPost<HermesActionResult>("/api/hermes/wiki/raw", payload);
}
