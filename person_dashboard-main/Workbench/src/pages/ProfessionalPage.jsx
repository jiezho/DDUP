import { useEffect, useMemo, useState } from "react";
import {
  IconArrowRight,
  IconBrain,
  IconCheck,
  IconFlask,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconTargetArrow,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import {
  createAiExperiment,
  createAiOpportunity,
  createResearchClaim,
  createResearchExperiment,
  createResearchQuestion,
  loadProfessionalWorkspace,
  loadProjectWorkspace,
  recordAiResult,
  recordResearchResult,
  searchContext,
  transitionAiOpportunity,
  transitionResearchQuestion,
} from "../lib/projects-api";

const questionStatus = { open: "待验证", testing: "验证中", answered: "已回答", archived: "已归档" };
const opportunityStatus = { draft: "草稿", exploring: "探索中", validated: "已验证", rejected: "已停止", archived: "已归档" };
const decisionLabel = { pending: "待决定", continue: "继续", stop: "停止", go: "Go" };

function safeError(error) {
  if (error?.code === "VERSION_CONFLICT") return "对象已被其他操作更新，请刷新后重试。";
  if (error?.code === "IDEMPOTENCY_CONFLICT") return "重复请求内容不一致，操作已安全停止。";
  return error?.message || "专业工作台暂时无法完成请求。";
}

function ProjectSelector({ label, projects, value, onChange }) {
  return (
    <label className="project-field professional-project-picker">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </label>
  );
}

function EmptyTemplate({ template }) {
  return (
    <div className="professional-empty">
      <IconTargetArrow aria-hidden="true" />
      <div>
        <strong>还没有{template}项目</strong>
        <p>先在项目工作台创建对应模板；专业对象会继续复用同一个项目、任务与来源真源。</p>
        <a href="/projects">前往项目工作台 <IconArrowRight aria-hidden="true" /></a>
      </div>
    </div>
  );
}

function ResearchExperimentForm({ questionId, onSaved }) {
  const [form, setForm] = useState({ title: "", method: "", variables: "", expected_outcome: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await createResearchExperiment(questionId, form);
      setForm({ title: "", method: "", variables: "", expected_outcome: "" });
      await onSaved("实验方案已保存；结果仍待人工记录。");
    } catch (error) { await onSaved(safeError(error), true); } finally { setBusy(false); }
  };
  return (
    <form aria-label="新建研究实验" className="professional-subform" onSubmit={submit}>
      <h4>增加验证实验</h4>
      <label className="project-field"><span>实验名称</span><input required maxLength="200" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="project-field"><span>方法</span><textarea required value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} /></label>
      <label className="project-field"><span>变量与边界</span><textarea required value={form.variables} onChange={(e) => setForm({ ...form, variables: e.target.value })} /></label>
      <label className="project-field"><span>预期结果</span><textarea required value={form.expected_outcome} onChange={(e) => setForm({ ...form, expected_outcome: e.target.value })} /></label>
      <button className="professional-action" disabled={busy} type="submit">{busy ? "保存中…" : "保存实验"}</button>
    </form>
  );
}

function ResearchResultForm({ experiment, onSaved }) {
  const [result, setResult] = useState("");
  const [decision, setDecision] = useState("continue");
  const [taskTitle, setTaskTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await recordResearchResult(experiment.id, experiment.version, {
        result_summary: result,
        decision,
        follow_up_task_title: taskTitle.trim() || null,
      });
      await onSaved("实验结果与继续/停止决定已保存；后续任务已回链原项目。 ");
    } catch (error) { await onSaved(safeError(error), true); } finally { setBusy(false); }
  };
  return (
    <form aria-label={`记录 ${experiment.title} 结果`} className="professional-result-form" onSubmit={submit}>
      <label className="project-field project-field--wide"><span>结果摘要</span><textarea required value={result} onChange={(e) => setResult(e.target.value)} /></label>
      <label className="project-field"><span>实验决定</span><select value={decision} onChange={(e) => setDecision(e.target.value)}><option value="continue">继续</option><option value="stop">停止</option></select></label>
      <label className="project-field"><span>后续任务（可选）</span><input maxLength="240" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} /></label>
      <button className="professional-action" disabled={busy} type="submit">记录结果</button>
    </form>
  );
}

function ResearchClaimForm({ question, experiments, project, spaceId, onSaved }) {
  const eligible = experiments.filter((item) => item.status !== "planned");
  const [form, setForm] = useState({ experiment_id: eligible[0]?.id || "", statement: "", evidence_direction: "supports", evidence_strength: "moderate" });
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!form.experiment_id && eligible[0]) setForm((current) => ({ ...current, experiment_id: eligible[0].id }));
  }, [eligible, form.experiment_id]);
  if (!eligible.length) return <p className="professional-hint">实验形成结果后，才能记录带固定来源范围的研究主张。</p>;
  const search = async () => {
    setBusy(true);
    try {
      const result = await searchContext({ spaceId, projectId: project.id, query, types: ["document"], limit: 8 });
      setHits(result.items.filter((item) => item.locator?.type === "char_range"));
      setSelected(null);
    } catch (error) { await onSaved(safeError(error), true); } finally { setBusy(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!selected) { await onSaved("请先搜索并选择一条固定来源证据。", true); return; }
    setBusy(true);
    try {
      await createResearchClaim(question.id, {
        ...form,
        evidence: {
          source_id: selected.source_id,
          source_version_id: selected.locator.source_version_id,
          document_id: selected.document_id,
          start_char: selected.locator.start,
          end_char: selected.locator.end,
        },
      });
      setForm({ ...form, statement: "" }); setQuery(""); setHits([]); setSelected(null);
      await onSaved("研究主张已绑定固定 SourceVersion 和字符范围；系统未自动判断事实正确性。 ");
    } catch (error) { await onSaved(safeError(error), true); } finally { setBusy(false); }
  };
  return (
    <form aria-label="记录研究主张" className="professional-subform" onSubmit={submit}>
      <h4>记录 Claim—Evidence</h4>
      <label className="project-field project-field--wide"><span>研究主张</span><textarea required value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} /></label>
      <label className="project-field"><span>关联实验</span><select value={form.experiment_id} onChange={(e) => setForm({ ...form, experiment_id: e.target.value })}>{eligible.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="project-field"><span>证据方向</span><select value={form.evidence_direction} onChange={(e) => setForm({ ...form, evidence_direction: e.target.value })}><option value="supports">支持</option><option value="challenges">反证</option><option value="mixed">混合</option></select></label>
      <label className="project-field"><span>证据强度</span><select value={form.evidence_strength} onChange={(e) => setForm({ ...form, evidence_strength: e.target.value })}><option value="weak">弱</option><option value="moderate">中</option><option value="strong">强</option></select></label>
      <div className="professional-evidence-search">
        <label className="project-field"><span>检索当前项目的受控来源</span><input required minLength="2" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <button aria-label="搜索研究证据" className="professional-secondary" disabled={busy || query.trim().length < 2} onClick={search} type="button"><IconSearch aria-hidden="true" /> 搜索</button>
      </div>
      {hits.length ? <div aria-label="研究证据结果" className="professional-evidence-results">{hits.map((hit) => (
        <label className={selected?.object_id === hit.object_id ? "is-selected" : ""} key={`${hit.object_id}-${hit.locator.start}`}>
          <input checked={selected?.object_id === hit.object_id && selected?.locator.start === hit.locator.start} name={`evidence-${question.id}`} onChange={() => setSelected(hit)} type="radio" />
          <span><strong>{hit.title}</strong><small>{hit.locator.quote}</small></span>
        </label>
      ))}</div> : null}
      <button className="professional-action" disabled={busy} type="submit">保存主张与证据</button>
    </form>
  );
}

function ResearchWorkspace({ project, data, spaceId, reload }) {
  const [form, setForm] = useState({ title: "", problem_statement: "", hypothesis: "", success_criteria: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await createResearchQuestion(project.id, form);
      setForm({ title: "", problem_statement: "", hypothesis: "", success_criteria: "" });
      await reload("研究问题已保存为当前项目的专业对象。");
    } catch (error) { await reload(safeError(error), true); } finally { setBusy(false); }
  };
  const transition = async (question, action) => {
    setBusy(true);
    try { await transitionResearchQuestion(question.id, question.version, action); await reload("研究问题状态已更新。"); }
    catch (error) { await reload(safeError(error), true); } finally { setBusy(false); }
  };
  return (
    <section aria-label="科研工作台" className="professional-workspace">
      <form aria-label="新建研究问题" className="professional-create-form" onSubmit={submit}>
        <div className="professional-section-heading"><IconBrain aria-hidden="true" /><div><h2>研究问题与假设</h2><p>所有记录留在当前 Project；实验结果可生成一个回链任务。</p></div></div>
        <label className="project-field"><span>研究问题</span><input required maxLength="200" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="project-field project-field--wide"><span>问题描述</span><textarea required value={form.problem_statement} onChange={(e) => setForm({ ...form, problem_statement: e.target.value })} /></label>
        <label className="project-field"><span>假设</span><textarea required value={form.hypothesis} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} /></label>
        <label className="project-field"><span>成功标准</span><textarea required value={form.success_criteria} onChange={(e) => setForm({ ...form, success_criteria: e.target.value })} /></label>
        <button className="professional-action" disabled={busy} type="submit">保存研究问题</button>
      </form>
      <div className="professional-card-list">{data.questions.map((question) => {
        const experiments = data.experiments.filter((item) => item.research_question_id === question.id);
        const claims = data.claims.filter((item) => item.research_question_id === question.id);
        return <article className="professional-card" key={question.id}>
          <header><div><span className={`professional-status professional-status--${question.status}`}>{questionStatus[question.status]}</span><h3>{question.title}</h3></div>
            <div className="professional-inline-actions">
              {question.status === "open" ? <button disabled={busy} onClick={() => transition(question, "start_testing")} type="button">开始验证</button> : null}
              {question.status === "testing" ? <button disabled={busy} onClick={() => transition(question, "answer")} type="button">标记已回答</button> : null}
              {question.status !== "archived" ? <button disabled={busy} onClick={() => transition(question, "archive")} type="button">归档</button> : <button disabled={busy} onClick={() => transition(question, "reopen")} type="button">重新打开</button>}
            </div></header>
          <dl className="professional-details"><div><dt>问题</dt><dd>{question.problem_statement}</dd></div><div><dt>假设</dt><dd>{question.hypothesis}</dd></div><div><dt>成功标准</dt><dd>{question.success_criteria}</dd></div></dl>
          <ResearchExperimentForm questionId={question.id} onSaved={reload} />
          {experiments.map((experiment) => <section className="professional-experiment" key={experiment.id}><div><strong>{experiment.title}</strong><span>{decisionLabel[experiment.decision]}</span></div><p>{experiment.method}</p>{experiment.status === "planned" ? <ResearchResultForm experiment={experiment} onSaved={reload} /> : <p className="professional-result"><IconCheck aria-hidden="true" /> {experiment.result_summary}</p>}</section>)}
          <ResearchClaimForm experiments={experiments} onSaved={reload} project={project} question={question} spaceId={spaceId} />
          {claims.length ? <div aria-label="研究主张列表" className="professional-claims">{claims.map((claim) => <article key={claim.id}><strong>{claim.statement}</strong><span>{claim.evidence_direction} · {claim.evidence_strength} · 原文字符 {claim.start_char}–{claim.end_char} · {claim.evidence_integrity === "valid" ? "证据复核通过" : "证据已失效"}</span></article>)}</div> : null}
        </article>;
      })}</div>
    </section>
  );
}

function AiExperimentForm({ opportunityId, onSaved }) {
  const [form, setForm] = useState({ title: "", evaluation_method: "", metric_name: "", baseline_value: "", target_value: "" });
  const submit = async (event) => {
    event.preventDefault();
    try {
      await createAiExperiment(opportunityId, { ...form, baseline_value: form.baseline_value === "" ? null : Number(form.baseline_value), target_value: Number(form.target_value) });
      setForm({ title: "", evaluation_method: "", metric_name: "", baseline_value: "", target_value: "" });
      await onSaved("AI 评测方案已保存；不会自动调用模型或外部服务。");
    } catch (error) { await onSaved(safeError(error), true); }
  };
  return <form aria-label="新建 AI 评测" className="professional-subform" onSubmit={submit}><h4>增加评测</h4>
    <label className="project-field"><span>评测名称</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
    <label className="project-field project-field--wide"><span>评测方法</span><textarea required value={form.evaluation_method} onChange={(e) => setForm({ ...form, evaluation_method: e.target.value })} /></label>
    <label className="project-field"><span>指标</span><input required value={form.metric_name} onChange={(e) => setForm({ ...form, metric_name: e.target.value })} /></label>
    <label className="project-field"><span>基线值（可选）</span><input inputMode="decimal" type="number" step="any" value={form.baseline_value} onChange={(e) => setForm({ ...form, baseline_value: e.target.value })} /></label>
    <label className="project-field"><span>目标值</span><input required inputMode="decimal" type="number" step="any" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} /></label>
    <button className="professional-action" type="submit">保存评测</button></form>;
}

function AiResultForm({ experiment, onSaved }) {
  const [form, setForm] = useState({ observed_value: "", evidence_summary: "", decision: "go", follow_up_task_title: "" });
  const submit = async (event) => {
    event.preventDefault();
    try {
      await recordAiResult(experiment.id, experiment.version, { ...form, observed_value: Number(form.observed_value), follow_up_task_title: form.follow_up_task_title.trim() || null });
      await onSaved("指标结果和 Go/Stop 决定已持久化；后续任务已回链原项目。");
    } catch (error) { await onSaved(safeError(error), true); }
  };
  return <form aria-label={`记录 ${experiment.title} 结果`} className="professional-result-form" onSubmit={submit}>
    <label className="project-field"><span>实测值</span><input required inputMode="decimal" type="number" step="any" value={form.observed_value} onChange={(e) => setForm({ ...form, observed_value: e.target.value })} /></label>
    <label className="project-field"><span>决定</span><select value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}><option value="go">Go</option><option value="stop">Stop</option></select></label>
    <label className="project-field project-field--wide"><span>证据摘要</span><textarea required value={form.evidence_summary} onChange={(e) => setForm({ ...form, evidence_summary: e.target.value })} /></label>
    <label className="project-field project-field--wide"><span>后续任务（可选）</span><input maxLength="240" value={form.follow_up_task_title} onChange={(e) => setForm({ ...form, follow_up_task_title: e.target.value })} /></label>
    <button className="professional-action" type="submit">记录 Go/Stop</button></form>;
}

function AiWorkspace({ project, data, reload }) {
  const [form, setForm] = useState({ title: "", problem_statement: "", target_user: "", value_hypothesis: "", feasibility_hypothesis: "" });
  const submit = async (event) => {
    event.preventDefault();
    try { await createAiOpportunity(project.id, form); setForm({ title: "", problem_statement: "", target_user: "", value_hypothesis: "", feasibility_hypothesis: "" }); await reload("AI 机会卡已保存。 "); }
    catch (error) { await reload(safeError(error), true); }
  };
  const transition = async (item, action) => {
    try { await transitionAiOpportunity(item.id, item.version, action); await reload("机会卡状态已更新。 "); }
    catch (error) { await reload(safeError(error), true); }
  };
  return <section aria-label="AI 应用实验室" className="professional-workspace">
    <form aria-label="新建 AI 机会卡" className="professional-create-form" onSubmit={submit}>
      <div className="professional-section-heading"><IconRobot aria-hidden="true" /><div><h2>AI 应用机会与评测</h2><p>只记录假设、指标和人工决定；不自动调用模型。</p></div></div>
      <label className="project-field"><span>机会名称</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="project-field project-field--wide"><span>问题描述</span><textarea required value={form.problem_statement} onChange={(e) => setForm({ ...form, problem_statement: e.target.value })} /></label>
      <label className="project-field"><span>目标用户</span><textarea required value={form.target_user} onChange={(e) => setForm({ ...form, target_user: e.target.value })} /></label>
      <label className="project-field"><span>价值假设</span><textarea required value={form.value_hypothesis} onChange={(e) => setForm({ ...form, value_hypothesis: e.target.value })} /></label>
      <label className="project-field project-field--wide"><span>可行性假设</span><textarea required value={form.feasibility_hypothesis} onChange={(e) => setForm({ ...form, feasibility_hypothesis: e.target.value })} /></label>
      <button className="professional-action" type="submit">保存机会卡</button>
    </form>
    <div className="professional-card-list">{data.opportunities.map((opportunity) => {
      const experiments = data.experiments.filter((item) => item.opportunity_id === opportunity.id);
      return <article className="professional-card" key={opportunity.id}><header><div><span className={`professional-status professional-status--${opportunity.status}`}>{opportunityStatus[opportunity.status]}</span><h3>{opportunity.title}</h3></div><div className="professional-inline-actions">
        {opportunity.status === "draft" ? <button onClick={() => transition(opportunity, "start_exploring")} type="button">开始探索</button> : null}
        {opportunity.status === "exploring" ? <><button onClick={() => transition(opportunity, "validate")} type="button">验证通过</button><button onClick={() => transition(opportunity, "reject")} type="button">停止</button></> : null}
        {opportunity.status !== "archived" ? <button onClick={() => transition(opportunity, "archive")} type="button">归档</button> : <button onClick={() => transition(opportunity, "reopen")} type="button">重新打开</button>}
      </div></header><dl className="professional-details"><div><dt>问题</dt><dd>{opportunity.problem_statement}</dd></div><div><dt>目标用户</dt><dd>{opportunity.target_user}</dd></div><div><dt>价值假设</dt><dd>{opportunity.value_hypothesis}</dd></div><div><dt>可行性</dt><dd>{opportunity.feasibility_hypothesis}</dd></div></dl>
      <AiExperimentForm onSaved={reload} opportunityId={opportunity.id} />
      {experiments.map((experiment) => <section className="professional-experiment" key={experiment.id}><div><strong>{experiment.title}</strong><span>{decisionLabel[experiment.decision]}</span></div><p>{experiment.metric_name} · 目标 {experiment.target_value}{experiment.baseline_value == null ? "" : ` · 基线 ${experiment.baseline_value}`}</p>{experiment.status === "planned" ? <AiResultForm experiment={experiment} onSaved={reload} /> : <p className="professional-result"><IconCheck aria-hidden="true" /> 实测 {experiment.observed_value} · {experiment.evidence_summary}</p>}</section>)}
      </article>;
    })}</div>
  </section>;
}

export function ProfessionalPage() {
  const [state, setState] = useState({ status: "loading", space: null, projects: [], error: null });
  const [researchId, setResearchId] = useState("");
  const [aiId, setAiId] = useState("");
  const [researchData, setResearchData] = useState({ questions: [], experiments: [], claims: [] });
  const [aiData, setAiData] = useState({ opportunities: [], experiments: [] });
  const [notice, setNotice] = useState({ text: "", error: false });
  const researchProjects = useMemo(() => state.projects.filter((item) => item.template_type === "research" && item.status !== "archived"), [state.projects]);
  const aiProjects = useMemo(() => state.projects.filter((item) => item.template_type === "ai_exploration" && item.status !== "archived"), [state.projects]);
  const researchProject = researchProjects.find((item) => item.id === researchId) || null;
  const aiProject = aiProjects.find((item) => item.id === aiId) || null;

  const loadBase = async () => {
    try {
      const workspace = await loadProjectWorkspace();
      setState({ status: "ready", space: workspace.space, projects: workspace.projects, error: null });
      setResearchId((current) => current || workspace.projects.find((item) => item.template_type === "research" && item.status !== "archived")?.id || "");
      setAiId((current) => current || workspace.projects.find((item) => item.template_type === "ai_exploration" && item.status !== "archived")?.id || "");
    } catch (error) { setState({ status: "error", space: null, projects: [], error: safeError(error) }); }
  };
  useEffect(() => { loadBase(); }, []);
  const loadResearch = async () => { if (!researchId) return; const value = await loadProfessionalWorkspace(researchId); setResearchData(value.research); };
  const loadAi = async () => { if (!aiId) return; const value = await loadProfessionalWorkspace(aiId); setAiData(value.ai_lab); };
  useEffect(() => { loadResearch().catch((error) => setNotice({ text: safeError(error), error: true })); }, [researchId]);
  useEffect(() => { loadAi().catch((error) => setNotice({ text: safeError(error), error: true })); }, [aiId]);
  const refreshResearch = async (text, error = false) => { setNotice({ text, error }); if (!error) await loadResearch(); };
  const refreshAi = async (text, error = false) => { setNotice({ text, error }); if (!error) await loadAi(); };

  return <div className="page professional-page">
    <PageHeader eyebrow="PROFESSIONAL WORKBENCH" title="专业工作台" description="科研与 AI 应用探索复用同一个项目、任务、来源、权限和审计真源。" aside={<button className="professional-secondary" onClick={() => Promise.all([loadBase(), loadResearch(), loadAi()])} type="button"><IconRefresh aria-hidden="true" /> 刷新</button>} />
    <div className="professional-boundary"><IconFlask aria-hidden="true" /><p><strong>当前是本地首版。</strong> 仅保存你的明确输入与固定证据范围，不调用外部模型，不自动把结果写入知识真源。</p></div>
    {notice.text ? <div aria-live="polite" className={`project-notice${notice.error ? " project-notice--error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}</div> : null}
    {state.status === "loading" ? <div className="project-state"><span className="project-spinner" /><strong>正在加载专业工作台</strong></div> : null}
    {state.status === "error" ? <div className="project-state project-state--error"><strong>{state.error}</strong><button onClick={loadBase} type="button">重试</button></div> : null}
    {state.status === "ready" ? <>
      <div className="professional-summary"><div><span>科研项目</span><strong>{researchProjects.length}</strong></div><div><span>研究问题</span><strong>{researchData.questions.length}</strong></div><div><span>AI 探索项目</span><strong>{aiProjects.length}</strong></div><div><span>AI 评测</span><strong>{aiData.experiments.length}</strong></div></div>
      <section className="professional-area"><div className="professional-area-head"><div><span className="eyebrow">WP1 · RESEARCH</span><h2>科研项目工作台</h2></div>{researchProjects.length ? <ProjectSelector label="当前科研项目" onChange={setResearchId} projects={researchProjects} value={researchId} /> : null}</div>{researchProject ? <ResearchWorkspace data={researchData} project={researchProject} reload={refreshResearch} spaceId={state.space.id} /> : <EmptyTemplate template="博士科研" />}</section>
      <section className="professional-area"><div className="professional-area-head"><div><span className="eyebrow">WP2 · AI LAB</span><h2>AI 应用实验室</h2></div>{aiProjects.length ? <ProjectSelector label="当前 AI 探索项目" onChange={setAiId} projects={aiProjects} value={aiId} /> : null}</div>{aiProject ? <AiWorkspace data={aiData} project={aiProject} reload={refreshAi} /> : <EmptyTemplate template="AI 应用探索" />}</section>
    </> : null}
  </div>;
}
