import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconBolt,
  IconCheck,
  IconClock,
  IconDatabase,
  IconPlayerStop,
  IconRefresh,
  IconRepeat,
  IconRobot,
  IconShieldCheck,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import {
  applyTaskCandidate,
  cancelAgentRun,
  createAgentRun,
  loadRunDetails,
  loadRuntimePackage,
  loadRuntimeWorkspace,
  requestTaskCandidateApproval,
  resolveTaskCandidateApproval,
  retryAgentRun,
  runtimeEventStreamUrl,
} from "../lib/projects-api";

const statusLabels = {
  queued: "等待启动",
  running: "运行中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const candidateStatusLabels = {
  pending: "候选",
  approved: "已批准",
  rejected: "已拒绝",
  applied: "已应用",
  failed: "失败",
};

const eventLabels = {
  "run.queued": "运行已排队",
  "run.started": "运行已启动",
  "run.succeeded": "运行已完成",
  "run.failed": "运行失败",
  "run.cancelled": "运行已取消",
  "context.scope.resolved": "上下文范围已解析",
  "tool.requested": "工具调用已请求",
  "tool.completed": "工具调用已完成",
  "candidate.created": "候选已生成",
  "checkpoint.created": "检查点已保存",
};

const streamEventTypes = Object.keys(eventLabels);

const emptyRunForm = {
  packageId: "",
  goal: "",
  candidateEnabled: false,
  projectId: "",
  title: "",
  description: "",
  priority: "normal",
  dueDate: "",
};

function safeError(error) {
  if (error?.code === "VERSION_CONFLICT") return "对象已更新，请刷新后重试。";
  if (error?.code === "RUN_RETRY_NOT_SAFE") return "该运行需要补充或重新确认输入，不能直接重试。";
  if (error?.code === "APPROVAL_EXPIRED") return "审批已过期，需要重新生成候选。";
  if (error?.code === "APPROVAL_SCOPE_MISMATCH") return "候选内容已变化，原审批不能继续使用。";
  return error?.message || "AI 运行服务暂时无法完成请求。";
}

function formatTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function shortId(value) {
  return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : "—";
}

export function RuntimePage() {
  const [workspace, setWorkspace] = useState({
    status: "loading",
    space: null,
    projects: [],
    runtimes: [],
    runs: [],
    candidates: [],
    approvals: [],
    contextPackages: [],
    error: null,
  });
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [detail, setDetail] = useState({ status: "idle", run: null, events: [], checkpoints: [], error: null });
  const [runForm, setRunForm] = useState(emptyRunForm);
  const [packageDetail, setPackageDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [streamStatus, setStreamStatus] = useState("idle");

  const load = async ({ keepSelection = true } = {}) => {
    setWorkspace((current) => ({ ...current, status: "loading", error: null }));
    try {
      const data = await loadRuntimeWorkspace();
      setWorkspace({ status: "ready", ...data, error: null });
      setSelectedRunId((current) => {
        if (keepSelection && data.runs.some((run) => run.id === current)) return current;
        return data.runs[0]?.id || null;
      });
      setRunForm((current) => ({
        ...current,
        packageId: data.contextPackages.some((item) => item.id === current.packageId)
          ? current.packageId
          : data.contextPackages[0]?.id || "",
      }));
    } catch (error) {
      setWorkspace((current) => ({ ...current, status: "error", error: safeError(error) }));
    }
  };

  const loadDetail = async (runId = selectedRunId) => {
    if (!runId || !workspace.space) {
      setDetail({ status: "idle", run: null, events: [], checkpoints: [], error: null });
      return;
    }
    setDetail((current) => ({ ...current, status: "loading", error: null }));
    try {
      const data = await loadRunDetails(runId, workspace.space.id);
      setDetail({ status: "ready", ...data, error: null });
    } catch (error) {
      setDetail({ status: "error", run: null, events: [], checkpoints: [], error: safeError(error) });
    }
  };

  useEffect(() => {
    void load({ keepSelection: false });
  }, []);

  useEffect(() => {
    void loadDetail();
  }, [selectedRunId, workspace.space?.id]);

  useEffect(() => {
    let active = true;
    if (!runForm.packageId || !workspace.space) {
      setPackageDetail(null);
      return () => { active = false; };
    }
    void loadRuntimePackage(runForm.packageId, workspace.space.id)
      .then((data) => {
        if (!active) return;
        setPackageDetail(data);
        const allowedProjects = data.items
          .filter((item) => item.included && item.object_type === "project")
          .map((item) => item.object_id);
        setRunForm((current) => ({
          ...current,
          projectId: allowedProjects.includes(current.projectId) ? current.projectId : allowedProjects[0] || "",
        }));
      })
      .catch((error) => {
        if (active) setNotice(safeError(error));
      });
    return () => { active = false; };
  }, [runForm.packageId, workspace.space?.id]);

  useEffect(() => {
    if (!detail.run || detail.run.terminal || !workspace.space) {
      setStreamStatus("idle");
      return undefined;
    }
    const lastSeq = detail.events.at(-1)?.seq || 0;
    const stream = new EventSource(runtimeEventStreamUrl(detail.run.id, workspace.space.id, lastSeq));
    setStreamStatus("connecting");
    const onEvent = (event) => {
      const parsed = JSON.parse(event.data);
      setStreamStatus("live");
      setDetail((current) => {
        if (current.events.some((item) => item.seq === parsed.seq)) return current;
        return {
          ...current,
          events: [...current.events, { ...parsed, type: event.type }].sort((left, right) => left.seq - right.seq),
        };
      });
      if (["run.succeeded", "run.failed", "run.cancelled"].includes(event.type)) {
        stream.close();
        void load().then(() => loadDetail(detail.run.id));
      }
    };
    streamEventTypes.forEach((type) => stream.addEventListener(type, onEvent));
    stream.onerror = () => {
      setStreamStatus("reconnecting");
    };
    return () => {
      streamEventTypes.forEach((type) => stream.removeEventListener(type, onEvent));
      stream.close();
    };
  }, [detail.run?.id, detail.run?.terminal, workspace.space?.id]);

  const approvalByCandidate = useMemo(
    () => new Map(workspace.approvals.map((approval) => [approval.subject_id, approval])),
    [workspace.approvals],
  );
  const includedProjectIds = useMemo(
    () => new Set((packageDetail?.items || []).filter((item) => item.included && item.object_type === "project").map((item) => item.object_id)),
    [packageDetail],
  );
  const allowedProjects = useMemo(
    () => workspace.projects.filter((project) => includedProjectIds.has(project.id)),
    [includedProjectIds, workspace.projects],
  );
  const nativeRuntime = workspace.runtimes.find((runtime) => runtime.runtime_key === "native-v1");
  const harnessRuntime = workspace.runtimes.find((runtime) => runtime.runtime_key === "deepseek-harness-poc");
  const hermesRuntime = workspace.runtimes.find((runtime) => runtime.runtime_key === "hermes-candidate");
  const pendingCount = workspace.candidates.filter((candidate) => ["pending", "approved"].includes(candidate.status)).length;

  const submitRun = async (event) => {
    event.preventDefault();
    const selectedPackage = workspace.contextPackages.find((item) => item.id === runForm.packageId);
    if (!selectedPackage || !workspace.space) return;
    setBusy(true);
    setNotice("");
    try {
      const payload = {
        space_id: workspace.space.id,
        context_package_id: selectedPackage.id,
        context_package_version: selectedPackage.version,
        goal: runForm.goal,
        budget: { max_steps: 3, max_tool_calls: runForm.candidateEnabled ? 1 : 0 },
        ...(runForm.candidateEnabled ? {
          task_candidate: {
            project_id: runForm.projectId,
            title: runForm.title,
            description: runForm.description,
            priority: runForm.priority,
            due_date: runForm.dueDate || null,
          },
        } : {}),
      };
      const response = await createAgentRun(payload);
      setNotice(runForm.candidateEnabled
        ? "运行已完成，任务仍是待确认候选，尚未写入项目。"
        : "确定性运行已完成并保存事件与检查点；没有生成模型回答。");
      setRunForm((current) => ({ ...current, goal: "", title: "", description: "", dueDate: "" }));
      await load();
      setSelectedRunId(response.data.id);
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  const runCommand = async (action) => {
    if (!detail.run || !workspace.space) return;
    setBusyId(detail.run.id);
    setNotice("");
    try {
      const response = action === "cancel"
        ? await cancelAgentRun(detail.run.id, workspace.space.id, detail.run.version)
        : await retryAgentRun(detail.run.id, workspace.space.id, detail.run.version);
      setNotice(action === "cancel" ? "已请求取消并保存终止检查点。" : "已从原运行的固定范围创建一次新运行。原记录保持不变。");
      await load();
      setSelectedRunId(response.data.id);
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusyId(null);
    }
  };

  const candidateCommand = async (candidate, action) => {
    const approval = approvalByCandidate.get(candidate.id);
    setBusyId(candidate.id);
    setNotice("");
    try {
      if (action === "request") await requestTaskCandidateApproval(candidate.id, workspace.space.id);
      if (action === "approve" || action === "reject") {
        await resolveTaskCandidateApproval(approval.id, workspace.space.id, approval.version, action);
      }
      if (action === "apply") {
        await applyTaskCandidate(candidate.id, approval.id, workspace.space.id, candidate.version);
      }
      setNotice({
        request: "已建立 24 小时有效的 L2 审批，批准本身不会写入任务。",
        approve: "候选已批准，但仍未写入项目；请再次选择应用。",
        reject: "候选已拒绝，不会写入项目。",
        apply: "候选已通过审批范围复核，并作为项目任务写入一次。",
      }[action]);
      await load();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page page--runtime">
      <PageHeader
        eyebrow="AI RUNTIME GOVERNANCE"
        title="AI 运行中心"
          description="集中查看运行任务、上下文范围、过程记录、恢复节点与候选审批。"
        aside={<span className={`runtime-live runtime-live--${nativeRuntime?.connected ? "ready" : "offline"}`}><IconRobot />{nativeRuntime?.connected ? "Native 已连接" : "Runtime 未连接"}</span>}
      />

      <section aria-label="运行摘要" className="runtime-summary">
        <div><span>运行总数</span><strong>{workspace.status === "ready" ? workspace.runs.length : "—"}</strong></div>
        <div><span>正在运行</span><strong>{workspace.status === "ready" ? workspace.runs.filter((run) => run.status === "running").length : "—"}</strong></div>
        <div><span>待确认</span><strong>{workspace.status === "ready" ? pendingCount : "—"}</strong></div>
        <div><span>安全边界</span><strong>本地 · 单 Runtime</strong></div>
      </section>

      <p className="runtime-boundary"><IconShieldCheck />Runtime 只能读取显式上下文篮；记忆和输出只能形成候选，批准与应用由 Workbench 分离控制。</p>
      <section aria-label="运行时准备状态" className="runtime-readiness">
        <article><span>当前执行器</span><strong>Native</strong><small>{nativeRuntime?.connected ? "已连接并通过本地验证" : "当前不可用"}</small></article>
        <article><span>隔离 POC</span><strong>DeepSeek Harness</strong><small>{harnessRuntime?.readiness === "client_preflight_passed_server_missing" ? "客户端预检通过 · 服务端未安装" : "尚未连接"}</small></article>
        <article><span>备选评估</span><strong>Hermes</strong><small>{hermesRuntime?.connected ? "连接状态可用" : "保持候选 · 未接入"}</small></article>
      </section>
      {notice ? <p aria-live="polite" className="runtime-notice">{notice}</p> : null}

      {workspace.status === "error" ? (
        <div className="runtime-state"><IconAlertTriangle /><strong>运行服务未就绪</strong><p>{workspace.error}</p><button onClick={() => load()} type="button"><IconRefresh />重新连接</button></div>
      ) : null}

      <section className="runtime-launcher" aria-labelledby="runtime-launcher-title">
        <header><div><span>NEW NATIVE RUN</span><h2 id="runtime-launcher-title">启动确定性运行</h2><p>选择已经明确确认的上下文篮。任务候选需要项目本身也在篮中。</p></div><IconBolt /></header>
        <form aria-label="启动确定性运行" onSubmit={submitRun}>
          <label><span>上下文篮</span><select onChange={(event) => setRunForm({ ...runForm, packageId: event.target.value })} required value={runForm.packageId}><option value="">请选择</option>{workspace.contextPackages.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
          <label className="runtime-field--goal"><span>本次目标</span><input maxLength="2000" onChange={(event) => setRunForm({ ...runForm, goal: event.target.value })} placeholder="明确描述要验证或推进的目标" required value={runForm.goal} /></label>
          <label className="runtime-candidate-toggle"><input checked={runForm.candidateEnabled} disabled={!allowedProjects.length} onChange={(event) => setRunForm({ ...runForm, candidateEnabled: event.target.checked })} type="checkbox" /><span>同时生成一个待确认任务候选</span><small>{allowedProjects.length ? "候选不会直接写入项目" : "当前篮未包含项目，不能创建任务候选"}</small></label>
          {runForm.candidateEnabled ? <div className="runtime-candidate-fields">
            <label><span>目标项目</span><select onChange={(event) => setRunForm({ ...runForm, projectId: event.target.value })} required value={runForm.projectId}>{allowedProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label className="runtime-field--wide"><span>任务标题</span><input maxLength="240" onChange={(event) => setRunForm({ ...runForm, title: event.target.value })} required value={runForm.title} /></label>
            <label><span>优先级</span><select onChange={(event) => setRunForm({ ...runForm, priority: event.target.value })} value={runForm.priority}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option></select></label>
            <label><span>目标日期</span><input onChange={(event) => setRunForm({ ...runForm, dueDate: event.target.value })} type="date" value={runForm.dueDate} /></label>
            <label className="runtime-field--wide"><span>任务说明</span><textarea maxLength="20000" onChange={(event) => setRunForm({ ...runForm, description: event.target.value })} rows="3" value={runForm.description} /></label>
          </div> : null}
          <button disabled={busy || !runForm.packageId || !runForm.goal.trim() || (runForm.candidateEnabled && (!runForm.projectId || !runForm.title.trim()))} type="submit"><IconSparkles />{busy ? "启动中…" : "启动运行"}</button>
        </form>
      </section>

      <div className="runtime-layout">
        <section className="runtime-run-list" aria-labelledby="runtime-history-title">
          <header><div><span>RUN HISTORY</span><h2 id="runtime-history-title">运行历史</h2></div><button aria-label="刷新运行历史" onClick={() => load()} type="button"><IconRefresh /></button></header>
          {workspace.status === "loading" ? <div className="runtime-state runtime-state--compact"><span className="project-spinner" />读取运行记录…</div> : null}
          {workspace.status === "ready" && !workspace.runs.length ? <div className="runtime-state runtime-state--compact"><IconClock /><strong>尚无运行记录</strong><p>完成上方确定性运行后，这里显示真实历史。</p></div> : null}
          <div className="runtime-run-items">{workspace.runs.map((run) => <button className={run.id === selectedRunId ? "is-selected" : ""} key={run.id} onClick={() => setSelectedRunId(run.id)} type="button"><span className={`runtime-status runtime-status--${run.status}`}>{statusLabels[run.status]}</span><strong>{run.goal}</strong><small><span>{formatTime(run.created_at)}</span><code>{shortId(run.id)}</code></small>{run.retry_of_run_id ? <em><IconRepeat />重试自 {shortId(run.retry_of_run_id)}</em> : null}</button>)}</div>
        </section>

        <section className="runtime-detail" aria-labelledby="runtime-detail-title">
          <header><div><span>RUN INSPECTOR</span><h2 id="runtime-detail-title">运行详情</h2></div>{detail.run && !detail.run.terminal ? <span className={`runtime-stream runtime-stream--${streamStatus}`}>SSE {streamStatus === "live" ? "已连接" : "连接中"}</span> : null}</header>
          {!selectedRunId ? <div className="runtime-state"><IconDatabase /><strong>选择一条运行</strong><p>事件和检查点只显示当前授权空间中的记录。</p></div> : null}
          {detail.status === "loading" ? <div className="runtime-state"><span className="project-spinner" />读取事件与检查点…</div> : null}
          {detail.status === "error" ? <div className="runtime-state"><IconAlertTriangle /><strong>详情不可用</strong><p>{detail.error}</p></div> : null}
          {detail.status === "ready" && detail.run ? <>
            <div className="runtime-detail__summary"><div><span>状态</span><strong className={`runtime-status runtime-status--${detail.run.status}`}>{statusLabels[detail.run.status]}</strong></div><div><span>Runtime</span><strong>{detail.run.runtime_key}</strong></div><div><span>上下文</span><code>{detail.run.context_digest.slice(0, 12)}…</code></div><div><span>版本</span><strong>v{detail.run.version}</strong></div></div>
            {detail.run.error_code ? <p className="runtime-error"><IconAlertTriangle /><span><strong>{detail.run.error_code}</strong>失败只保留安全错误码；原运行不会被覆盖。</span></p> : null}
            <div className="runtime-detail__actions">{detail.run.status === "running" ? <button disabled={busyId === detail.run.id} onClick={() => runCommand("cancel")} type="button"><IconPlayerStop />取消运行</button> : null}{detail.run.retryable ? <button disabled={busyId === detail.run.id} onClick={() => runCommand("retry")} type="button"><IconRepeat />安全重试</button> : null}</div>
            <div className="runtime-detail__columns">
              <div><h3>事件时间线 <span>{detail.events.length}</span></h3><ol className="runtime-events">{detail.events.map((event) => <li key={event.id || `${event.run_id}:${event.seq}`}><span>{event.seq}</span><div><strong>{eventLabels[event.type] || event.type}</strong><small>{formatTime(event.occurred_at)}</small></div></li>)}</ol></div>
              <div><h3>检查点 <span>{detail.checkpoints.length}</span></h3><div className="runtime-checkpoints">{detail.checkpoints.map((checkpoint) => <article key={checkpoint.id}><IconDatabase /><div><strong>{statusLabels[checkpoint.run_status]}</strong><small>事件 #{checkpoint.event_seq} · Run v{checkpoint.run_version}</small><code>{checkpoint.context_digest.slice(0, 12)}…</code></div></article>)}{!detail.checkpoints.length ? <p>尚无检查点。</p> : null}</div></div>
            </div>
          </> : null}
        </section>
      </div>

      <section className="runtime-approvals" aria-labelledby="runtime-approvals-title">
        <header><div><span>GOVERNED CANDIDATES</span><h2 id="runtime-approvals-title">待确认与候选</h2><p>申请审批、作出决定和应用是三个独立动作；只有最后一步会创建项目任务。</p></div><strong>{pendingCount}</strong></header>
        {!workspace.candidates.length ? <div className="runtime-state runtime-state--compact"><IconShieldCheck /><strong>没有待确认候选</strong><p>这里不会填充模拟审批。</p></div> : null}
        <div className="runtime-candidate-list">{workspace.candidates.map((candidate) => {
          const approval = approvalByCandidate.get(candidate.id);
          const project = workspace.projects.find((item) => item.id === candidate.project_id);
          const effectiveApproval = approval?.effective_status || approval?.status;
          return <article key={candidate.id}><div className="runtime-candidate-card__head"><span className={`runtime-status runtime-status--${candidate.status}`}>{candidateStatusLabels[candidate.status]}</span><code>{shortId(candidate.id)}</code></div><h3>{candidate.proposal.title}</h3><p>{candidate.proposal.description || "没有补充说明。"}</p><dl><div><dt>项目</dt><dd>{project?.name || shortId(candidate.project_id)}</dd></div><div><dt>优先级</dt><dd>{candidate.proposal.priority}</dd></div><div><dt>日期</dt><dd>{candidate.proposal.due_date || "未设置"}</dd></div><div><dt>审批</dt><dd>{effectiveApproval || "未申请"}</dd></div></dl><div className="runtime-candidate-card__actions">
            {candidate.status === "pending" && !approval ? <button disabled={busyId === candidate.id} onClick={() => candidateCommand(candidate, "request")} type="button"><IconShieldCheck />申请 L2 审批</button> : null}
            {candidate.status === "pending" && effectiveApproval === "pending" ? <><button disabled={busyId === candidate.id} onClick={() => candidateCommand(candidate, "approve")} type="button"><IconCheck />批准范围</button><button className="is-reject" disabled={busyId === candidate.id} onClick={() => candidateCommand(candidate, "reject")} type="button"><IconX />拒绝</button></> : null}
            {candidate.status === "approved" && effectiveApproval === "approved" ? <button disabled={busyId === candidate.id} onClick={() => candidateCommand(candidate, "apply")} type="button"><IconCheck />应用为项目任务</button> : null}
          </div>{approval ? <small className="runtime-candidate-card__expiry">审批有效期：{formatTime(approval.expires_at)}</small> : null}</article>;
        })}</div>
      </section>
    </div>
  );
}
