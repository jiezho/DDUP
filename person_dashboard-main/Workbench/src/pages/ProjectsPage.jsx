import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconArchive,
  IconArrowRight,
  IconCalendarEvent,
  IconCheck,
  IconCirclePlus,
  IconEdit,
  IconFlag,
  IconFolderPlus,
  IconListCheck,
  IconMessageCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
  IconWritingSign,
  IconX,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import {
  createProject,
  createMilestone,
  createDiscussion,
  createDiscussionEntry,
  createTask,
  convertDiscussion,
  deleteProject,
  loadProjectWorkspace,
  loadProjectWorkItems,
  loadDiscussionEntries,
  transitionProject,
  transitionTask,
  updateMilestone,
  updateProject,
} from "../lib/projects-api";

const templates = [
  ["general", "通用项目"],
  ["research", "博士科研"],
  ["ai_exploration", "AI 应用探索"],
  ["frontier_tracking", "前沿跟踪"],
  ["learning", "学习提升"],
];

const statusLabels = {
  draft: "草稿",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
};

const transitionActions = {
  draft: [["activate", "启动项目", IconPlayerPlay]],
  active: [["pause", "暂停", IconPlayerPause]],
  paused: [
    ["activate", "继续", IconPlayerPlay],
    ["archive", "归档", IconArchive],
  ],
  completed: [
    ["reopen", "重新打开", IconPlayerPlay],
    ["archive", "归档", IconArchive],
  ],
  archived: [["reopen", "重新打开", IconRefresh]],
};

const taskStatusLabels = {
  inbox: "待梳理",
  planned: "已计划",
  in_progress: "进行中",
  blocked: "受阻",
  done: "已完成",
  cancelled: "已取消",
};

const taskActions = {
  inbox: [["plan", "纳入计划"], ["start", "开始"], ["cancel", "取消"]],
  planned: [["start", "开始"], ["cancel", "取消"]],
  in_progress: [["complete", "完成"], ["block", "标记受阻"], ["cancel", "取消"]],
  blocked: [["start", "解除受阻"], ["cancel", "取消"]],
  done: [["reopen", "重新打开"]],
  cancelled: [["reopen", "重新打开"]],
};

const emptyForm = {
  name: "",
  summary: "",
  template_type: "general",
  start_date: "",
  target_date: "",
  context_policy: "project_only",
  color_token: "sky",
};

function safeError(error) {
  if (error?.code === "VERSION_CONFLICT") return "项目已在其他操作中更新，请刷新后重试。";
  if (error?.code === "SESSION_REQUIRED") return "本地会话已过期，请重启工作台后继续。";
  return error?.message || "项目服务暂时不可用。";
}

export function ProjectsPage() {
  const [workspace, setWorkspace] = useState({ status: "loading", space: null, projects: [], error: null });
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [notice, setNotice] = useState("");
  const nameInput = useRef(null);

  const load = async () => {
    setWorkspace((current) => ({ ...current, status: "loading", error: null }));
    try {
      const result = await loadProjectWorkspace();
      setWorkspace({ status: "ready", space: result.space, projects: result.projects, error: null });
    } catch (error) {
      setWorkspace({ status: "error", space: null, projects: [], error: safeError(error) });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (formOpen) nameInput.current?.focus();
  }, [formOpen]);

  const activeCount = useMemo(
    () => workspace.projects.filter((project) => project.status === "active").length,
    [workspace.projects],
  );
  const selectedProject = useMemo(
    () => workspace.projects.find((project) => project.id === selectedProjectId) || null,
    [selectedProjectId, workspace.projects],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
    setNotice("");
  };

  const openEdit = (project) => {
    setEditing(project);
    setForm({
      name: project.name,
      summary: project.summary,
      template_type: project.template_type,
      start_date: project.start_date || "",
      target_date: project.target_date || "",
      context_policy: project.context_policy,
      color_token: project.color_token,
    });
    setFormOpen(true);
    setNotice("");
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      if (editing) {
        await updateProject(editing.id, editing.version, {
          name: form.name,
          summary: form.summary,
          start_date: form.start_date || null,
          target_date: form.target_date || null,
          context_policy: form.context_policy,
          color_token: form.color_token,
        });
        setNotice("项目资料已更新。所有写入均已记录审计。")
      } else {
        await createProject({
          ...form,
          space_id: workspace.space.id,
          start_date: form.start_date || null,
          target_date: form.target_date || null,
        });
        setNotice("项目已创建并持久化。刷新或重启后仍会保留。")
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setSaving(false);
    }
  };

  const runTransition = async (project, action) => {
    setBusyId(project.id);
    setNotice("");
    try {
      await transitionProject(project.id, project.version, action);
      setNotice("项目状态已更新。")
      await load();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (project) => {
    if (pendingDeleteId !== project.id) {
      setPendingDeleteId(project.id);
      setNotice("请再次确认：项目将移入可恢复区，30 天内可以恢复。")
      return;
    }
    setBusyId(project.id);
    try {
      await deleteProject(project.id, project.version);
      if (selectedProjectId === project.id) setSelectedProjectId(null);
      setPendingDeleteId(null);
      setNotice("项目已移入可恢复区。")
      await load();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page page--projects">
      <PageHeader
        eyebrow="PROJECT WORKBENCH"
        title="项目工作台"
        description="围绕项目汇聚知识、讨论、决策和行动；当前切片已启用真实本地持久化。"
        aside={
          <button className="project-primary-action" onClick={openCreate} type="button">
            <IconFolderPlus aria-hidden="true" /> 新建项目
          </button>
        }
      />

      <section aria-label="项目运行摘要" className="project-summary-strip">
        <div><span>空间</span><strong>{workspace.space?.name || "—"}</strong></div>
        <div><span>全部项目</span><strong>{workspace.status === "ready" ? workspace.projects.length : "—"}</strong></div>
        <div><span>进行中</span><strong>{workspace.status === "ready" ? activeCount : "—"}</strong></div>
        <div><span>数据模式</span><strong>{workspace.status === "ready" ? "本地持久化" : "检测中"}</strong></div>
      </section>

      {notice ? <p aria-live="polite" className="project-notice">{notice}</p> : null}

      {formOpen ? (
        <section aria-label={editing ? "编辑项目" : "新建项目"} className="project-editor">
          <div className="project-editor__head">
            <div><span>{editing ? "EDIT PROJECT" : "CREATE PROJECT"}</span><h2>{editing ? "编辑项目资料" : "建立新的项目空间"}</h2></div>
            <button aria-label="关闭项目表单" disabled={saving} onClick={closeForm} type="button"><IconX /></button>
          </div>
          <form onSubmit={submit}>
            <label className="project-field project-field--wide">
              <span>项目名称</span>
              <input maxLength="120" onChange={(event) => setForm({ ...form, name: event.target.value })} ref={nameInput} required value={form.name} />
            </label>
            <label className="project-field project-field--wide">
              <span>目标与说明</span>
              <textarea maxLength="2000" onChange={(event) => setForm({ ...form, summary: event.target.value })} rows="3" value={form.summary} />
            </label>
            <label className="project-field">
              <span>项目模板</span>
              <select disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, template_type: event.target.value })} value={form.template_type}>
                {templates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="project-field"><span>开始日期</span><input onChange={(event) => setForm({ ...form, start_date: event.target.value })} type="date" value={form.start_date} /></label>
            <label className="project-field"><span>目标日期</span><input min={form.start_date || undefined} onChange={(event) => setForm({ ...form, target_date: event.target.value })} type="date" value={form.target_date} /></label>
            <label className="project-field">
              <span>上下文范围</span>
              <select onChange={(event) => setForm({ ...form, context_policy: event.target.value })} value={form.context_policy}>
                <option value="project_only">仅当前项目</option>
                <option value="space_allowed">允许本空间授权内容</option>
              </select>
            </label>
            <div className="project-editor__actions">
              <button disabled={saving} onClick={closeForm} type="button">取消</button>
              <button className="is-primary" disabled={saving || !form.name.trim()} type="submit">{saving ? "保存中…" : editing ? "保存修改" : "创建项目"}</button>
            </div>
          </form>
        </section>
      ) : null}

      {workspace.status === "loading" ? <div aria-live="polite" className="project-state"><span className="project-spinner" />正在读取本地项目…</div> : null}
      {workspace.status === "error" ? (
        <div className="project-state project-state--error"><strong>项目服务未就绪</strong><p>{workspace.error}</p><button onClick={load} type="button"><IconRefresh />重新连接</button></div>
      ) : null}
      {workspace.status === "ready" && workspace.projects.length === 0 ? (
        <div className="project-state project-state--empty"><IconFolderPlus /><strong>建立第一个项目</strong><p>从通用、科研、AI 应用或学习模板开始。这里只显示真实保存的数据，不填充模拟项目。</p><button onClick={openCreate} type="button">新建项目 <IconArrowRight /></button></div>
      ) : null}

      {workspace.status === "ready" && workspace.projects.length > 0 ? (
        <section aria-label="项目列表" className="project-grid">
          {workspace.projects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="project-card__top"><span className={`project-status project-status--${project.status}`}>{statusLabels[project.status]}</span><span>v{project.version}</span></div>
              <div className={`project-card__mark project-card__mark--${project.color_token}`} />
              <h2>{project.name}</h2>
              <p>{project.summary || "尚未填写项目说明。"}</p>
              <dl><div><dt>模板</dt><dd>{templates.find(([value]) => value === project.template_type)?.[1]}</dd></div><div><dt>目标日期</dt><dd>{project.target_date || "未设置"}</dd></div><div><dt>上下文</dt><dd>{project.context_policy === "project_only" ? "仅项目" : "授权空间"}</dd></div></dl>
              <div className="project-card__actions">
                <button className="is-work-items" disabled={busyId === project.id} onClick={() => setSelectedProjectId(project.id)} type="button"><IconListCheck />打开工作项</button>
                <button disabled={busyId === project.id} onClick={() => openEdit(project)} type="button"><IconEdit />编辑</button>
                {(transitionActions[project.status] || []).map(([action, label, Icon]) => <button disabled={busyId === project.id} key={action} onClick={() => runTransition(project, action)} type="button"><Icon />{label}</button>)}
                <button className={pendingDeleteId === project.id ? "is-confirm" : ""} disabled={busyId === project.id} onClick={() => remove(project)} type="button"><IconTrash />{pendingDeleteId === project.id ? "确认移入" : "移入恢复区"}</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {selectedProject ? (
        <WorkItemsPanel key={selectedProject.id} onClose={() => setSelectedProjectId(null)} project={selectedProject} />
      ) : null}
    </div>
  );
}

function WorkItemsPanel({ project, onClose }) {
  const [state, setState] = useState({ status: "loading", milestones: [], tasks: [], discussions: [], decisions: [], error: null });
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskMilestone, setTaskMilestone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const readOnly = ["completed", "archived"].includes(project.status);

  const loadItems = async () => {
    setState((current) => ({ ...current, status: current.status === "loading" ? "loading" : "ready", error: null }));
    try {
      const data = await loadProjectWorkItems(project.id);
      setState({ status: "ready", ...data, error: null });
    } catch (error) {
      setState({ status: "error", milestones: [], tasks: [], discussions: [], decisions: [], error: safeError(error) });
    }
  };

  useEffect(() => {
    void loadItems();
  }, [project.id]);

  const submitMilestone = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await createMilestone(project.id, {
        title: milestoneTitle,
        target_date: milestoneDate || null,
        sort_order: state.milestones.length,
      });
      setMilestoneTitle("");
      setMilestoneDate("");
      setNotice("里程碑已保存并写入审计记录。");
      await loadItems();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitTask = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await createTask(project.id, {
        title: taskTitle,
        description: "",
        priority: taskPriority,
        due_at: null,
        due_date: taskDueDate || null,
        milestone_id: taskMilestone || null,
        parent_task_id: null,
      });
      setTaskTitle("");
      setTaskDueDate("");
      setTaskMilestone("");
      setNotice("任务已保存，可继续安排状态。");
      await loadItems();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  const runTaskAction = async (task, action) => {
    setBusy(true);
    setNotice("");
    try {
      await transitionTask(task.id, task.version, action);
      setNotice("任务状态已更新。");
      await loadItems();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  const advanceMilestone = async (milestone) => {
    const next = milestone.status === "planned" ? "active" : milestone.status === "active" ? "completed" : null;
    if (!next) return;
    setBusy(true);
    setNotice("");
    try {
      await updateMilestone(milestone.id, milestone.version, { status: next });
      setNotice(next === "active" ? "里程碑已启动。" : "里程碑已完成。");
      await loadItems();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={`${project.name} 工作项`} className="work-items-panel">
      <header className="work-items-panel__head">
        <div>
          <span>PROJECT FOCUS</span>
          <h2>{project.name}</h2>
          <p>里程碑与任务共享项目边界、版本控制和审计链。</p>
        </div>
        <button aria-label="关闭工作项面板" onClick={onClose} type="button"><IconX /></button>
      </header>

      {notice ? <p aria-live="polite" className="work-items-notice">{notice}</p> : null}
      {readOnly ? <p className="work-items-readonly">该项目已{project.status === "archived" ? "归档" : "完成"}。重新打开项目后才能新增或调整工作项。</p> : null}

      {!readOnly ? (
        <div className="work-item-composers">
          <form aria-label="新建里程碑" onSubmit={submitMilestone}>
            <div className="work-item-composer__title"><IconFlag /><strong>新建里程碑</strong></div>
            <label><span>里程碑名称</span><input maxLength="160" onChange={(event) => setMilestoneTitle(event.target.value)} placeholder="例如：完成开题报告" required value={milestoneTitle} /></label>
            <label><span>目标日期</span><input onChange={(event) => setMilestoneDate(event.target.value)} type="date" value={milestoneDate} /></label>
            <button disabled={busy || !milestoneTitle.trim()} type="submit"><IconCirclePlus />保存里程碑</button>
          </form>
          <form aria-label="新建任务" onSubmit={submitTask}>
            <div className="work-item-composer__title"><IconListCheck /><strong>新建任务</strong></div>
            <label className="is-wide"><span>任务名称</span><input maxLength="240" onChange={(event) => setTaskTitle(event.target.value)} placeholder="明确一个可执行行动" required value={taskTitle} /></label>
            <label><span>优先级</span><select onChange={(event) => setTaskPriority(event.target.value)} value={taskPriority}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option></select></label>
            <label><span>目标日期</span><input onChange={(event) => setTaskDueDate(event.target.value)} type="date" value={taskDueDate} /></label>
            <label className="is-wide"><span>关联里程碑</span><select onChange={(event) => setTaskMilestone(event.target.value)} value={taskMilestone}><option value="">不关联</option>{state.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></label>
            <button disabled={busy || !taskTitle.trim()} type="submit"><IconCirclePlus />保存任务</button>
          </form>
        </div>
      ) : null}

      {state.status === "loading" ? <div className="work-items-loading"><span className="project-spinner" />正在读取工作项…</div> : null}
      {state.status === "error" ? <div className="work-items-loading is-error"><p>{state.error}</p><button onClick={loadItems} type="button"><IconRefresh />重试</button></div> : null}
      {state.status === "ready" ? (
        <>
        <div className="work-item-columns">
          <section aria-label="里程碑列表" className="work-item-column">
            <div className="work-item-column__head"><div><IconFlag /><strong>里程碑</strong></div><span>{state.milestones.length}</span></div>
            {state.milestones.length === 0 ? <p className="work-item-empty">暂无里程碑，可先建立阶段目标。</p> : state.milestones.map((milestone) => (
              <article className="milestone-row" key={milestone.id}>
                <div><span className={`milestone-state milestone-state--${milestone.status}`}>{milestone.status === "planned" ? "待启动" : milestone.status === "active" ? "进行中" : milestone.status === "completed" ? "已完成" : "已取消"}</span><strong>{milestone.title}</strong><small><IconCalendarEvent />{milestone.target_date || "未设置日期"}</small></div>
                {!readOnly && ["planned", "active"].includes(milestone.status) ? <button disabled={busy} onClick={() => advanceMilestone(milestone)} type="button">{milestone.status === "planned" ? "启动" : "完成"}<IconArrowRight /></button> : null}
              </article>
            ))}
          </section>
          <section aria-label="任务列表" className="work-item-column">
            <div className="work-item-column__head"><div><IconListCheck /><strong>任务</strong></div><span>{state.tasks.length}</span></div>
            {state.tasks.length === 0 ? <p className="work-item-empty">暂无任务，将目标拆成下一步行动。</p> : state.tasks.map((task) => {
              const milestone = state.milestones.find((item) => item.id === task.milestone_id);
              return (
                <article className={`task-row task-row--${task.status}`} key={task.id}>
                  <div className="task-row__body"><span className="task-state">{taskStatusLabels[task.status]}</span><strong>{task.title}</strong><small>{milestone ? `里程碑：${milestone.title}` : "未关联里程碑"}{task.due_date ? ` · ${task.due_date}` : ""}</small></div>
                  {!readOnly ? <div className="task-row__actions">{(taskActions[task.status] || []).map(([action, label]) => <button disabled={busy} key={action} onClick={() => runTaskAction(task, action)} type="button">{action === "complete" ? <IconCheck /> : null}{label}</button>)}</div> : null}
                </article>
              );
            })}
          </section>
        </div>
        <DiscussionDecisionPanel
          decisions={state.decisions}
          discussions={state.discussions}
          milestones={state.milestones}
          onRefresh={loadItems}
          project={project}
          readOnly={readOnly}
        />
        </>
      ) : null}
    </section>
  );
}

function DiscussionDecisionPanel({ project, milestones, discussions, decisions, readOnly, onRefresh }) {
  const [discussionTitle, setDiscussionTitle] = useState("");
  const [selectedId, setSelectedId] = useState(discussions[0]?.id || null);
  const [entries, setEntries] = useState([]);
  const [entryBody, setEntryBody] = useState("");
  const [decisionTitle, setDecisionTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [rationale, setRationale] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = discussions.find((item) => item.id === selectedId) || null;

  const refreshEntries = async (discussionId) => {
    try {
      setEntries(await loadDiscussionEntries(discussionId));
    } catch (error) {
      setNotice(safeError(error));
    }
  };

  useEffect(() => {
    if (selectedId) void refreshEntries(selectedId);
    else setEntries([]);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId && discussions[0]) setSelectedId(discussions[0].id);
  }, [discussions, selectedId]);

  const addDiscussion = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await createDiscussion(project.id, { title: discussionTitle });
      setDiscussionTitle("");
      setSelectedId(response.data.id);
      setDecisionTitle(response.data.title);
      setNotice("聚焦讨论已建立。当前只记录人工输入，不调用 AI。");
      await onRefresh();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  const addEntry = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setNotice("");
    try {
      await createDiscussionEntry(selected.id, { body: entryBody });
      setEntryBody("");
      setNotice("讨论记录已保存并保留来源关系。");
      await Promise.all([refreshEntries(selected.id), onRefresh()]);
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  const convert = async (event) => {
    event.preventDefault();
    if (!selected || !confirmed) return;
    setBusy(true);
    setNotice("");
    try {
      await convertDiscussion(selected.id, {
        decision_title: decisionTitle,
        statement,
        rationale,
        task_title: taskTitle,
        task_priority: taskPriority,
        task_due_date: taskDueDate || null,
        milestone_id: milestoneId || null,
      });
      setConfirmed(false);
      setNotice("已按你的明确确认形成正式决策，并在同一事务创建后续任务。");
      await onRefresh();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  const chooseDiscussion = (discussion) => {
    setSelectedId(discussion.id);
    setDecisionTitle(discussion.title);
    setStatement("");
    setRationale("");
    setTaskTitle("");
    setConfirmed(false);
    setNotice("");
  };

  return (
    <section aria-label="讨论与决策" className="discussion-decision-panel">
      <div className="discussion-decision-panel__head"><div><IconMessageCircle /><strong>讨论 → 决策 → 任务</strong></div><span>人工确认闭环</span></div>
      {notice ? <p aria-live="polite" className="work-items-notice">{notice}</p> : null}
      {!readOnly ? (
        <form aria-label="新建讨论" className="discussion-create" onSubmit={addDiscussion}>
          <label><span>聚焦问题</span><input maxLength="200" onChange={(event) => setDiscussionTitle(event.target.value)} placeholder="例如：下一阶段采用哪条研究路线？" required value={discussionTitle} /></label>
          <button disabled={busy || !discussionTitle.trim()} type="submit"><IconCirclePlus />建立讨论</button>
        </form>
      ) : null}
      <div className="discussion-decision-grid">
        <div className="discussion-list" role="list" aria-label="讨论列表">
          {discussions.length === 0 ? <p className="work-item-empty">暂无讨论。围绕一个需要取舍的问题开始。</p> : discussions.map((discussion) => (
            <button aria-pressed={selectedId === discussion.id} className={selectedId === discussion.id ? "is-selected" : ""} key={discussion.id} onClick={() => chooseDiscussion(discussion)} role="listitem" type="button">
              <span>{discussion.status === "open" ? "讨论中" : "已形成决策"}</span><strong>{discussion.title}</strong>
            </button>
          ))}
        </div>
        <div className="discussion-focus">
          {!selected ? <p className="work-item-empty">选择一个讨论查看记录和决策。</p> : (
            <>
              <div className="discussion-focus__title"><div><span>{selected.status === "open" ? "OPEN DISCUSSION" : "RESOLVED"}</span><h3>{selected.title}</h3></div><small>{entries.length} 条记录</small></div>
              <div className="discussion-entries">{entries.length === 0 ? <p>尚无讨论记录。</p> : entries.map((entry) => <article key={entry.id}><span>本人记录</span><p>{entry.body}</p></article>)}</div>
              {!readOnly && selected.status === "open" ? (
                <>
                  <form aria-label="追加讨论记录" className="discussion-entry-form" onSubmit={addEntry}><label><span>补充观点或依据</span><textarea maxLength="20000" onChange={(event) => setEntryBody(event.target.value)} required rows="3" value={entryBody} /></label><button disabled={busy || !entryBody.trim()} type="submit">保存记录</button></form>
                  <form aria-label="形成决策与任务" className="decision-conversion" onSubmit={convert}>
                    <div className="decision-conversion__title"><IconWritingSign /><div><strong>形成正式决定与下一步</strong><p>这是人工确认写入，不代表 AI 已评估或批准。</p></div></div>
                    <label><span>决策标题</span><input maxLength="200" onChange={(event) => setDecisionTitle(event.target.value)} required value={decisionTitle} /></label>
                    <label className="is-wide"><span>决定内容</span><textarea maxLength="20000" onChange={(event) => setStatement(event.target.value)} required rows="3" value={statement} /></label>
                    <label className="is-wide"><span>原因与取舍</span><textarea maxLength="20000" onChange={(event) => setRationale(event.target.value)} rows="2" value={rationale} /></label>
                    <label><span>后续任务</span><input maxLength="240" onChange={(event) => setTaskTitle(event.target.value)} required value={taskTitle} /></label>
                    <label><span>优先级</span><select onChange={(event) => setTaskPriority(event.target.value)} value={taskPriority}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option></select></label>
                    <label><span>任务日期</span><input onChange={(event) => setTaskDueDate(event.target.value)} type="date" value={taskDueDate} /></label>
                    <label><span>关联里程碑</span><select onChange={(event) => setMilestoneId(event.target.value)} value={milestoneId}><option value="">不关联</option>{milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></label>
                    <label className="decision-confirm is-wide"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>我已核对决定和后续任务，确认写入长期项目记录。</span></label>
                    <button disabled={busy || !confirmed || !decisionTitle.trim() || !statement.trim() || !taskTitle.trim()} type="submit"><IconCheck />确认形成决策并创建任务</button>
                  </form>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="decision-list"><div className="work-item-column__head"><div><IconWritingSign /><strong>已确认决策</strong></div><span>{decisions.length}</span></div>{decisions.length === 0 ? <p className="work-item-empty">暂无已确认决策。</p> : decisions.map((decision) => <article key={decision.id}><span>已接受</span><div><strong>{decision.title}</strong><p>{decision.statement}</p><small>{decision.rationale || "未填写原因与取舍"}</small></div></article>)}</div>
    </section>
  );
}
