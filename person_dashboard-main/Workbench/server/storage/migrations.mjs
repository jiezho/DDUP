import { createHash } from 'node:crypto'

const migration001 = `
CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('local_owner', 'system_job', 'connector', 'runtime')),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES principals(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  classification TEXT NOT NULL CHECK (classification IN ('personal_local', 'public_demo')),
  default_ai_policy TEXT NOT NULL CHECK (default_ai_policy IN ('deny_ai', 'local_only', 'approved_cloud_metadata', 'approved_cloud_content')),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id)
) STRICT;

CREATE INDEX spaces_owner_status_idx ON spaces(owner_id, status, id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 2000),
  template_type TEXT NOT NULL CHECK (template_type IN ('general', 'research', 'ai_exploration', 'frontier_tracking', 'learning')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  start_date TEXT,
  target_date TEXT,
  context_policy TEXT NOT NULL CHECK (context_policy IN ('project_only', 'space_allowed')),
  color_token TEXT NOT NULL CHECK (color_token IN ('sky', 'cyan', 'blue', 'teal', 'indigo')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  CHECK (start_date IS NULL OR length(start_date) = 10),
  CHECK (target_date IS NULL OR length(target_date) = 10),
  CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date)
) STRICT;

CREATE INDEX projects_space_updated_idx ON projects(space_id, updated_at DESC, id DESC);
CREATE INDEX projects_space_status_idx ON projects(space_id, status, template_type, id) WHERE deleted_at IS NULL;

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  occurred_at TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES principals(id),
  actor_kind TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  request_id TEXT,
  run_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied', 'failed', 'succeeded')),
  reason_code TEXT,
  change_digest TEXT,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE
) STRICT;

CREATE INDEX audit_space_time_idx ON audit_events(space_id, occurred_at DESC, id DESC);
CREATE INDEX audit_request_idx ON audit_events(request_id) WHERE request_id IS NOT NULL;

CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version >= 1),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivering', 'delivered', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
) STRICT;

CREATE INDEX outbox_pending_idx ON outbox_events(status, next_attempt_at, created_at, id);

CREATE TABLE idempotency_keys (
  principal_id TEXT NOT NULL REFERENCES principals(id),
  command_scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (principal_id, command_scope, idempotency_key)
) STRICT, WITHOUT ROWID;

CREATE INDEX idempotency_expiry_idx ON idempotency_keys(expires_at);
`

const migration002 = `
CREATE UNIQUE INDEX projects_id_space_unique ON projects(id, space_id);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  target_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  FOREIGN KEY (project_id, space_id) REFERENCES projects(id, space_id),
  CHECK (target_date IS NULL OR length(target_date) = 10)
) STRICT;

CREATE UNIQUE INDEX milestones_id_space_project_unique ON milestones(id, space_id, project_id);
CREATE INDEX milestones_project_order_idx ON milestones(space_id, project_id, sort_order, id) WHERE deleted_at IS NULL;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  project_id TEXT,
  milestone_id TEXT,
  parent_task_id TEXT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  status TEXT NOT NULL CHECK (status IN ('inbox', 'planned', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at TEXT,
  due_date TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual', 'discussion', 'decision', 'ai_candidate', 'import')),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  FOREIGN KEY (project_id, space_id) REFERENCES projects(id, space_id),
  FOREIGN KEY (milestone_id, space_id, project_id) REFERENCES milestones(id, space_id, project_id),
  FOREIGN KEY (parent_task_id, space_id, project_id) REFERENCES tasks(id, space_id, project_id),
  CHECK (milestone_id IS NULL OR project_id IS NOT NULL),
  CHECK (parent_task_id IS NULL OR project_id IS NOT NULL),
  CHECK (due_date IS NULL OR length(due_date) = 10),
  CHECK ((status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done' AND completed_at IS NULL))
) STRICT;

CREATE UNIQUE INDEX tasks_id_space_project_unique ON tasks(id, space_id, project_id);
CREATE INDEX tasks_project_status_idx ON tasks(space_id, project_id, status, due_date, id) WHERE deleted_at IS NULL;
CREATE INDEX tasks_parent_idx ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL;
`

const migration003 = `
CREATE TABLE discussions (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'archived')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  FOREIGN KEY (project_id, space_id) REFERENCES projects(id, space_id)
) STRICT;

CREATE UNIQUE INDEX discussions_id_space_project_unique ON discussions(id, space_id, project_id);
CREATE INDEX discussions_project_status_idx ON discussions(space_id, project_id, status, updated_at DESC, id) WHERE deleted_at IS NULL;

CREATE TABLE discussion_entries (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  discussion_id TEXT NOT NULL,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('principal', 'assistant', 'runtime')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  run_id TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  FOREIGN KEY (discussion_id, space_id, project_id) REFERENCES discussions(id, space_id, project_id),
  CHECK ((author_kind = 'principal' AND run_id IS NULL) OR (author_kind <> 'principal' AND run_id IS NOT NULL))
) STRICT;

CREATE INDEX discussion_entries_order_idx ON discussion_entries(space_id, discussion_id, created_at, id) WHERE deleted_at IS NULL;

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  discussion_id TEXT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  statement TEXT NOT NULL CHECK (length(statement) BETWEEN 1 AND 20000),
  rationale TEXT NOT NULL DEFAULT '' CHECK (length(rationale) <= 20000),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'superseded', 'withdrawn')),
  supersedes_id TEXT REFERENCES decisions(id),
  decided_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  FOREIGN KEY (project_id, space_id) REFERENCES projects(id, space_id),
  FOREIGN KEY (discussion_id, space_id, project_id) REFERENCES discussions(id, space_id, project_id),
  CHECK ((status = 'accepted' AND decided_at IS NOT NULL) OR (status <> 'accepted' AND decided_at IS NULL))
) STRICT;

CREATE UNIQUE INDEX decisions_id_space_project_unique ON decisions(id, space_id, project_id);
CREATE INDEX decisions_project_status_idx ON decisions(space_id, project_id, status, decided_at DESC, id) WHERE deleted_at IS NULL;

CREATE TABLE decision_task_links (
  decision_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  PRIMARY KEY (decision_id, task_id),
  FOREIGN KEY (decision_id, space_id, project_id) REFERENCES decisions(id, space_id, project_id),
  FOREIGN KEY (task_id, space_id, project_id) REFERENCES tasks(id, space_id, project_id)
) STRICT, WITHOUT ROWID;
`

const migration004 = `
CREATE TABLE captures (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  project_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'link')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  canonical_uri TEXT,
  status TEXT NOT NULL CHECK (status IN ('inbox', 'processed', 'archived')),
  captured_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  FOREIGN KEY (project_id, space_id) REFERENCES projects(id, space_id),
  CHECK ((kind = 'text' AND length(body) BETWEEN 1 AND 20000 AND canonical_uri IS NULL)
    OR (kind = 'link' AND body = '' AND canonical_uri IS NOT NULL))
) STRICT;

CREATE INDEX captures_space_status_idx ON captures(space_id, status, captured_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX captures_project_idx ON captures(space_id, project_id, captured_at DESC, id DESC) WHERE project_id IS NOT NULL AND deleted_at IS NULL;
`

const migration005 = `
CREATE TABLE daily_plans (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  plan_date TEXT NOT NULL CHECK (length(plan_date) = 10),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  UNIQUE (space_id, plan_date)
) STRICT;

CREATE TABLE daily_plan_items (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  plan_id TEXT NOT NULL REFERENCES daily_plans(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 2),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  UNIQUE (plan_id, task_id),
  UNIQUE (plan_id, sort_order)
) STRICT;

CREATE INDEX daily_plan_items_task_idx ON daily_plan_items(space_id, task_id, plan_id);

CREATE TABLE daily_reviews (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  review_date TEXT NOT NULL CHECK (length(review_date) = 10),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 10000),
  wins TEXT NOT NULL DEFAULT '' CHECK (length(wins) <= 10000),
  blockers TEXT NOT NULL DEFAULT '' CHECK (length(blockers) <= 10000),
  next_focus TEXT NOT NULL DEFAULT '' CHECK (length(next_focus) <= 10000),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  UNIQUE (space_id, review_date)
) STRICT;
`

const migration006 = `
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  project_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('markdown_upload')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK (status IN ('ready', 'archived', 'failed')),
  current_version_number INTEGER NOT NULL CHECK (current_version_number >= 1),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  UNIQUE (id, space_id),
  FOREIGN KEY (project_id, space_id) REFERENCES projects(id, space_id)
) STRICT;

CREATE INDEX sources_space_updated_idx ON sources(space_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX sources_project_idx ON sources(space_id, project_id, updated_at DESC, id DESC) WHERE project_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE source_versions (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  project_id TEXT,
  source_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  media_type TEXT NOT NULL CHECK (media_type = 'text/markdown'),
  original_filename TEXT NOT NULL CHECK (
    length(original_filename) BETWEEN 1 AND 180
    AND instr(original_filename, '/') = 0
    AND instr(original_filename, char(92)) = 0
  ),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 1048576),
  storage_ref TEXT NOT NULL CHECK (length(storage_ref) BETWEEN 1 AND 300),
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  UNIQUE (source_id, version_number),
  UNIQUE (id, space_id),
  FOREIGN KEY (source_id, space_id) REFERENCES sources(id, space_id),
  FOREIGN KEY (project_id, space_id) REFERENCES projects(id, space_id)
) STRICT;

CREATE UNIQUE INDEX source_versions_ready_dedupe_idx
ON source_versions(space_id, COALESCE(project_id, ''), content_sha256)
WHERE status = 'ready';

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  project_id TEXT,
  source_id TEXT NOT NULL,
  source_version_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body_text TEXT NOT NULL CHECK (length(body_text) BETWEEN 1 AND 1000000),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  language TEXT NOT NULL CHECK (language IN ('und', 'zh', 'en', 'mixed')),
  indexed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  UNIQUE (source_id),
  UNIQUE (source_version_id),
  FOREIGN KEY (source_id, space_id) REFERENCES sources(id, space_id),
  FOREIGN KEY (source_version_id, space_id) REFERENCES source_versions(id, space_id),
  FOREIGN KEY (project_id, space_id) REFERENCES projects(id, space_id)
) STRICT;

CREATE INDEX documents_space_updated_idx ON documents(space_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX documents_project_idx ON documents(space_id, project_id, updated_at DESC, id DESC) WHERE project_id IS NOT NULL AND deleted_at IS NULL;

CREATE VIRTUAL TABLE context_search USING fts5(
  object_type UNINDEXED,
  object_id UNINDEXED,
  space_id UNINDEXED,
  project_id UNINDEXED,
  title,
  body,
  source_version_id UNINDEXED,
  updated_at UNINDEXED,
  tokenize='trigram'
);

INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
SELECT 'project', id, space_id, id, name, summary, NULL, updated_at FROM projects WHERE deleted_at IS NULL;
INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
SELECT 'task', id, space_id, project_id, title, description, NULL, updated_at FROM tasks WHERE deleted_at IS NULL;
INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
SELECT 'capture', id, space_id, project_id, title, CASE WHEN kind = 'text' THEN body ELSE canonical_uri END, NULL, updated_at FROM captures WHERE deleted_at IS NULL;

CREATE TRIGGER projects_context_ai AFTER INSERT ON projects BEGIN
  INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
  SELECT 'project', NEW.id, NEW.space_id, NEW.id, NEW.name, NEW.summary, NULL, NEW.updated_at WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER projects_context_au AFTER UPDATE ON projects BEGIN
  DELETE FROM context_search WHERE object_type = 'project' AND object_id = OLD.id;
  INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
  SELECT 'project', NEW.id, NEW.space_id, NEW.id, NEW.name, NEW.summary, NULL, NEW.updated_at WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER projects_context_ad AFTER DELETE ON projects BEGIN
  DELETE FROM context_search WHERE object_type = 'project' AND object_id = OLD.id;
END;

CREATE TRIGGER tasks_context_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
  SELECT 'task', NEW.id, NEW.space_id, NEW.project_id, NEW.title, NEW.description, NULL, NEW.updated_at WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER tasks_context_au AFTER UPDATE ON tasks BEGIN
  DELETE FROM context_search WHERE object_type = 'task' AND object_id = OLD.id;
  INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
  SELECT 'task', NEW.id, NEW.space_id, NEW.project_id, NEW.title, NEW.description, NULL, NEW.updated_at WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER tasks_context_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM context_search WHERE object_type = 'task' AND object_id = OLD.id;
END;

CREATE TRIGGER captures_context_ai AFTER INSERT ON captures BEGIN
  INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
  SELECT 'capture', NEW.id, NEW.space_id, NEW.project_id, NEW.title,
    CASE WHEN NEW.kind = 'text' THEN NEW.body ELSE NEW.canonical_uri END, NULL, NEW.updated_at
  WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER captures_context_au AFTER UPDATE ON captures BEGIN
  DELETE FROM context_search WHERE object_type = 'capture' AND object_id = OLD.id;
  INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
  SELECT 'capture', NEW.id, NEW.space_id, NEW.project_id, NEW.title,
    CASE WHEN NEW.kind = 'text' THEN NEW.body ELSE NEW.canonical_uri END, NULL, NEW.updated_at
  WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER captures_context_ad AFTER DELETE ON captures BEGIN
  DELETE FROM context_search WHERE object_type = 'capture' AND object_id = OLD.id;
END;

CREATE TRIGGER documents_context_ai AFTER INSERT ON documents BEGIN
  INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
  SELECT 'document', NEW.id, NEW.space_id, NEW.project_id, NEW.title, NEW.body_text, NEW.source_version_id, NEW.updated_at
  WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER documents_context_au AFTER UPDATE ON documents BEGIN
  DELETE FROM context_search WHERE object_type = 'document' AND object_id = OLD.id;
  INSERT INTO context_search(object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at)
  SELECT 'document', NEW.id, NEW.space_id, NEW.project_id, NEW.title, NEW.body_text, NEW.source_version_id, NEW.updated_at
  WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER documents_context_ad AFTER DELETE ON documents BEGIN
  DELETE FROM context_search WHERE object_type = 'document' AND object_id = OLD.id;
END;
`

const migration007 = `
CREATE TABLE context_packages (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  purpose TEXT NOT NULL CHECK (length(purpose) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES principals(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES principals(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES principals(id),
  UNIQUE (id, space_id)
) STRICT;

CREATE INDEX context_packages_space_status_idx
ON context_packages(space_id, status, updated_at DESC, id DESC)
WHERE deleted_at IS NULL;

CREATE TABLE context_package_items (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('project', 'task', 'capture', 'document')),
  object_id TEXT NOT NULL,
  source_version_id TEXT,
  start_char INTEGER,
  end_char INTEGER,
  added_at TEXT NOT NULL,
  added_by TEXT NOT NULL REFERENCES principals(id),
  FOREIGN KEY (package_id, space_id) REFERENCES context_packages(id, space_id),
  CHECK (
    (object_type = 'document' AND source_version_id IS NOT NULL AND start_char >= 0 AND end_char > start_char)
    OR
    (object_type <> 'document' AND source_version_id IS NULL AND start_char IS NULL AND end_char IS NULL)
  )
) STRICT;

CREATE UNIQUE INDEX context_package_items_identity_idx
ON context_package_items(
  package_id,
  object_type,
  object_id,
  COALESCE(source_version_id, ''),
  COALESCE(start_char, -1),
  COALESCE(end_char, -1)
);

CREATE INDEX context_package_items_package_idx
ON context_package_items(space_id, package_id, added_at, id);
`

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex')
}

export const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: 1,
    name: 'foundation_identity_space_project_audit',
    sql: migration001,
    checksum: checksum(migration001),
  }),
  Object.freeze({
    version: 2,
    name: 'project_milestones_and_tasks',
    sql: migration002,
    checksum: checksum(migration002),
  }),
  Object.freeze({
    version: 3,
    name: 'discussion_decision_task_flow',
    sql: migration003,
    checksum: checksum(migration003),
  }),
  Object.freeze({
    version: 4,
    name: 'text_and_link_capture_inbox',
    sql: migration004,
    checksum: checksum(migration004),
  }),
  Object.freeze({
    version: 5,
    name: 'daily_focus_and_review',
    sql: migration005,
    checksum: checksum(migration005),
  }),
  Object.freeze({
    version: 6,
    name: 'source_document_and_context_search',
    sql: migration006,
    checksum: checksum(migration006),
  }),
  Object.freeze({
    version: 7,
    name: 'explicit_context_packages',
    sql: migration007,
    checksum: checksum(migration007),
  }),
])
