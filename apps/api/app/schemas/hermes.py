from __future__ import annotations

import base64

from pydantic import BaseModel, Field


class HermesCapabilitiesOut(BaseModel):
    model: str | None = None
    context_window: int | None = None
    platforms: list[str] = Field(default_factory=list)
    toolsets: list[str] = Field(default_factory=list)
    skills_count: int | None = None
    skill_hub_available: int | None = None
    max_subagents: int | None = None
    declared_count: int = 0
    summary_tags: list[str] = Field(default_factory=list)


class HermesMemoryFileOut(BaseModel):
    name: str
    relative_path: str
    updated_at: str
    size: int


class HermesMemorySummaryOut(BaseModel):
    files_count: int
    latest_updated_at: str | None = None
    recent_files: list[HermesMemoryFileOut] = Field(default_factory=list)


class HermesDeploymentOut(BaseModel):
    type: str
    host_label: str
    hermes_version: str
    data_path_present: bool


class HermesOutputsSummaryOut(BaseModel):
    entries_count: int
    latest_entry: dict | None = None


class HermesInstanceOut(BaseModel):
    id: str
    name: str
    status: str
    description: str = ""
    deployment: HermesDeploymentOut
    capabilities: HermesCapabilitiesOut
    specialization: list[str] = Field(default_factory=list)
    published_skills: list[str] = Field(default_factory=list)
    sub_agents_count: int = 0
    cron_jobs_count: int = 0
    memory: HermesMemorySummaryOut
    outputs: HermesOutputsSummaryOut
    data_assets_summary: dict[str, int] = Field(default_factory=dict)


class HermesInstanceDetailOut(HermesInstanceOut):
    sub_agents: list[dict] = Field(default_factory=list)
    cron_jobs: list[dict] = Field(default_factory=list)


class HermesInstancesResponse(BaseModel):
    items: list[HermesInstanceOut]
    total: int


class HermesSearchItemOut(BaseModel):
    source: str
    id: str
    title: str
    snippet: str
    instance_id: str | None = None
    access: str | None = None
    file_path: str | None = None


class HermesSearchResponse(BaseModel):
    query: str
    total: int
    items: list[HermesSearchItemOut]


class HermesRuntimeStatusOut(BaseModel):
    cron: dict
    archives: dict
    storage: dict
    isolation: dict = Field(default_factory=dict)
    lifecycle_tasks: list[dict] = Field(default_factory=list)


class HermesFeedbackItemOut(BaseModel):
    key: str
    level: str
    title: str
    description: str


class HermesTaskStatusOut(BaseModel):
    priority: str
    title: str
    description: str
    status: str


class HermesRecentActionOut(BaseModel):
    action: str
    resource_type: str
    resource_id: str
    created_at: str


class HermesOperationalJobOut(BaseModel):
    job_id: str
    owner: str
    schedule: str
    configured_status: str
    derived_status: str
    last_execution_status: str | None = None
    archive_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    last_archived_at: str | None = None
    last_success_at: str | None = None
    last_failure_at: str | None = None
    last_duration_ms: int | None = None
    latest_title: str | None = None
    last_failure_summary: str | None = None
    last_failure_message: str | None = None
    last_failure_hint: str | None = None


class HermesFeedbackMetricsOut(BaseModel):
    open_tasks: int = 0
    in_progress_tasks: int = 0
    recent_actions: int = 0
    active_instances: int = 0
    operational_jobs: int = 0
    stale_jobs: int = 0


class HermesFeedbackSummaryOut(BaseModel):
    focus: list[str] = Field(default_factory=list)
    pending: list[HermesTaskStatusOut] = Field(default_factory=list)
    feedback: list[HermesFeedbackItemOut] = Field(default_factory=list)
    recent_actions: list[HermesRecentActionOut] = Field(default_factory=list)
    operational_jobs: list[HermesOperationalJobOut] = Field(default_factory=list)
    metrics: HermesFeedbackMetricsOut = Field(default_factory=HermesFeedbackMetricsOut)


class HermesOpsCheckOut(BaseModel):
    environment: dict = Field(default_factory=dict)
    integrity: dict = Field(default_factory=dict)
    runtime: dict = Field(default_factory=dict)
    recommendations: list[dict] = Field(default_factory=list)


class HermesStorageObjectOut(BaseModel):
    key: str
    size: int
    last_modified: str | None = None


class HermesStorageListResponse(BaseModel):
    status: str
    total: int
    objects: list[HermesStorageObjectOut] = Field(default_factory=list)
    prefix: str = ""
    message: str | None = None


class HermesStoragePresignIn(BaseModel):
    key: str
    expires_days: int = 7


class HermesStoragePresignOut(BaseModel):
    status: str
    url: str | None = None
    expires_in: str | None = None
    key: str
    message: str | None = None


class HermesStorageUploadOut(BaseModel):
    status: str
    key: str | None = None
    url: str | None = None
    size_bytes: int = 0
    original_name: str | None = None
    message: str | None = None


class HermesStorageDeleteIn(BaseModel):
    key: str
    instance_id: str | None = None


class HermesStorageDeleteOut(BaseModel):
    status: str
    deleted: str | None = None
    message: str | None = None


class HermesRegisterInstanceIn(BaseModel):
    id: str
    name: str
    description: str = ""
    deployment_type: str = "docker"
    host: str = "localhost"
    hermes_version: str = "unknown"
    data_path: str = ""
    model: str | None = None
    context_window: int | None = None
    platforms: list[str] = Field(default_factory=list)
    toolsets: list[str] = Field(default_factory=list)
    skills_count: int | None = None
    skill_hub_available: int | None = None
    max_subagents: int | None = None
    specialization: list[str] = Field(default_factory=list)
    published_skills: list[str] = Field(default_factory=list)
    status: str = "active"


class HermesMemoryWriteIn(BaseModel):
    instance_id: str
    scope: str = "self"
    key: str
    content: str


class HermesWikiWriteIn(BaseModel):
    instance_id: str
    title: str
    content: str
    tags: list[str] = Field(default_factory=list)


class HermesArchiveWriteIn(BaseModel):
    instance_id: str
    job_id: str
    title: str
    summary: str
    content: str
    metadata: dict = Field(default_factory=dict)
    attachments: list["HermesArchiveAttachmentIn"] = Field(default_factory=list)


class HermesArchiveAttachmentIn(BaseModel):
    filename: str
    content_base64: str
    content_type: str | None = None

    def decoded_bytes(self) -> bytes:
        return base64.b64decode(self.content_base64.encode("utf-8"), validate=False)


class HermesActionResultOut(BaseModel):
    status: str
    message: str | None = None
    instance_id: str | None = None
    path: str | None = None
    scope: str | None = None
    created_paths: list[str] = Field(default_factory=list)
