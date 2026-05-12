import { apiGet } from "./api";

export type HermesOverview = {
  repo_root: string;
  instances_count: number;
  online_instances_count: number;
  skills_count: number;
  shared_memory_files_count: number;
  outputs_entries_count: number;
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
  capabilities: string[];
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
  items: { source: string; id: string; title: string; snippet: string; instance_id?: string | null }[];
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

export async function searchHermesLibrary(query: string): Promise<HermesSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: "12" });
  return apiGet<HermesSearchResponse>(`/api/hermes/search?${params.toString()}`);
}
