import { useCallback, useEffect, useMemo, useState } from "react";
import { IconBook2, IconCheck, IconRefresh, IconRadar2, IconSearch, IconTargetArrow } from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import {
  createLearningCheckin,
  createLearningPractice,
  createLearningRoutine,
  createLearningTrack,
  createRadarSignal,
  createRadarTopic,
  loadGrowthWorkspace,
  loadProjectWorkspace,
  recordLearningPractice,
  reviewRadarTopic,
  searchContext,
} from "../lib/projects-api";

const domainLabels = { ai: "AI", it: "IT", energy: "电力能源", research_methods: "科研方法", custom: "自定义" };
const maturityLabels = { emerging: "萌芽", experimental: "实验期", early_adoption: "早期采用", maturing: "成熟中", established: "已成熟" };
const dispositionLabels = { track: "持续关注", validate: "进入验证", ignore: "暂时忽略" };
const categoryLabels = { english: "英语", research_methods: "科研方法", programming_ai: "编程与 AI", professional: "专业技术", custom: "自定义" };

function safeError(error) {
  if (error?.code === "VERSION_CONFLICT") return "对象已经更新，请刷新后重试。";
  if (error?.code === "RELATION_CONFLICT") return error.message || "相同记录已经存在，未重复写入。";
  return error?.message || "成长工作台暂时无法完成请求。";
}

function ProjectSelector({ label, projects, value, onChange }) {
  return <label className="project-field professional-project-picker"><span>{label}</span><select onChange={(event) => onChange(event.target.value)} value={value}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>;
}

function EmptyProject({ name }) {
  return <div className="professional-empty"><IconTargetArrow aria-hidden="true" /><div><strong>还没有{name}项目</strong><p>先在项目工作台创建对应模板；这里不会创建第二套项目或任务。</p><a href="/projects">前往项目工作台</a></div></div>;
}

function RadarSignalForm({ project, spaceId, topic, reload }) {
  const [summary, setSummary] = useState("");
  const [classification, setClassification] = useState("primary_fact");
  const [publishedOn, setPublishedOn] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    setBusy(true);
    try {
      const result = await searchContext({ spaceId, projectId: project.id, query, types: ["document"], limit: 8 });
      setHits(result.items.filter((item) => item.locator?.type === "char_range"));
      setSelected(null);
    } catch (error) { await reload(safeError(error), true); } finally { setBusy(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!selected) { await reload("请先选择一条当前项目的固定来源证据。", true); return; }
    setBusy(true);
    try {
      await createRadarSignal(topic.id, { summary, classification, published_on: publishedOn || null,
        evidence: { source_id: selected.source_id, source_version_id: selected.locator.source_version_id,
          document_id: selected.document_id, start_char: selected.locator.start, end_char: selected.locator.end } });
      setSummary(""); setQuery(""); setHits([]); setSelected(null);
      await reload("前沿信号已绑定固定来源版本与字符范围。 ");
    } catch (error) { await reload(safeError(error), true); } finally { setBusy(false); }
  };
  return <form aria-label={`为 ${topic.title} 增加前沿信号`} className="professional-subform" onSubmit={submit}>
    <h4>增加可核验信号</h4>
    <label className="project-field project-field--wide"><span>信号摘要</span><textarea required value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
    <label className="project-field"><span>内容标记</span><select value={classification} onChange={(e) => setClassification(e.target.value)}><option value="primary_fact">一手事实</option><option value="secondary_report">二手转述</option><option value="opinion">观点</option><option value="inference">人工推断</option></select></label>
    <label className="project-field"><span>发布日期（可选）</span><input type="date" value={publishedOn} onChange={(e) => setPublishedOn(e.target.value)} /></label>
    <div className="professional-evidence-search"><label className="project-field"><span>检索当前项目的受控来源</span><input minLength="2" required value={query} onChange={(e) => setQuery(e.target.value)} /></label><button aria-label="搜索前沿证据" className="professional-secondary" disabled={busy || query.trim().length < 2} onClick={search} type="button"><IconSearch aria-hidden="true" /> 搜索</button></div>
    {hits.length ? <div aria-label="前沿证据结果" className="professional-evidence-results">{hits.map((hit) => <label className={selected?.object_id === hit.object_id ? "is-selected" : ""} key={`${hit.object_id}-${hit.locator.start}`}><input checked={selected?.object_id === hit.object_id && selected?.locator.start === hit.locator.start} name={`radar-evidence-${topic.id}`} onChange={() => setSelected(hit)} type="radio" /><span><strong>{hit.title}</strong><small>{hit.locator.quote}</small></span></label>)}</div> : null}
    <button className="professional-action" disabled={busy} type="submit">保存信号与证据</button>
  </form>;
}

function RadarReviewForm({ topic, reload }) {
  const [form, setForm] = useState({ maturity: topic.maturity, limitations: topic.limitations, impact_summary: topic.impact_summary, disposition: topic.disposition, next_review_date: topic.next_review_date || "", follow_up_task_title: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await reviewRadarTopic(topic.id, topic.version, { ...form, next_review_date: form.next_review_date || null, follow_up_task_title: form.follow_up_task_title.trim() || null });
      await reload("前沿专题复核完成；可选后续任务已回链原项目。 ");
    } catch (error) { await reload(safeError(error), true); } finally { setBusy(false); }
  };
  return <form aria-label={`复核 ${topic.title}`} className="professional-result-form" onSubmit={submit}>
    <label className="project-field"><span>成熟度</span><select value={form.maturity} onChange={(e) => setForm({ ...form, maturity: e.target.value })}>{Object.entries(maturityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="project-field"><span>处置</span><select value={form.disposition} onChange={(e) => setForm({ ...form, disposition: e.target.value })}>{Object.entries(dispositionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="project-field"><span>下次复查</span><input type="date" value={form.next_review_date} onChange={(e) => setForm({ ...form, next_review_date: e.target.value })} /></label>
    <label className="project-field project-field--wide"><span>主要限制</span><textarea required value={form.limitations} onChange={(e) => setForm({ ...form, limitations: e.target.value })} /></label>
    <label className="project-field project-field--wide"><span>影响评估</span><textarea required value={form.impact_summary} onChange={(e) => setForm({ ...form, impact_summary: e.target.value })} /></label>
    <label className="project-field"><span>后续任务（可选）</span><input maxLength="240" value={form.follow_up_task_title} onChange={(e) => setForm({ ...form, follow_up_task_title: e.target.value })} /></label>
    <button className="professional-action" disabled={busy} type="submit">保存复核决定</button>
  </form>;
}

function RadarWorkspace({ project, data, spaceId, reload }) {
  const [form, setForm] = useState({ title: "", domain: "ai", synthesis: "", maturity: "emerging", limitations: "", impact_summary: "", disposition: "track", next_review_date: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await createRadarTopic(project.id, { ...form, next_review_date: form.next_review_date || null });
      setForm({ title: "", domain: "ai", synthesis: "", maturity: "emerging", limitations: "", impact_summary: "", disposition: "track", next_review_date: "" });
      await reload("前沿专题已保存；当前只使用人工输入和受控来源。 ");
    } catch (error) { await reload(safeError(error), true); } finally { setBusy(false); }
  };
  return <section aria-label="前沿雷达工作台" className="professional-workspace">
    <form aria-label="新建前沿专题" className="professional-create-form" onSubmit={submit}>
      <div className="professional-section-heading"><IconRadar2 aria-hidden="true" /><div><h2>前沿专题与影响判断</h2><p>手工聚合信号，强制区分事实、转述、观点与推断。</p></div></div>
      <label className="project-field"><span>专题名称</span><input required maxLength="200" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="project-field"><span>领域</span><select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>{Object.entries(domainLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="project-field project-field--wide"><span>当前综合判断</span><textarea required value={form.synthesis} onChange={(e) => setForm({ ...form, synthesis: e.target.value })} /></label>
      <label className="project-field"><span>成熟度</span><select value={form.maturity} onChange={(e) => setForm({ ...form, maturity: e.target.value })}>{Object.entries(maturityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="project-field"><span>处置</span><select value={form.disposition} onChange={(e) => setForm({ ...form, disposition: e.target.value })}>{Object.entries(dispositionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="project-field"><span>下次复查</span><input type="date" value={form.next_review_date} onChange={(e) => setForm({ ...form, next_review_date: e.target.value })} /></label>
      <label className="project-field"><span>主要限制</span><textarea required value={form.limitations} onChange={(e) => setForm({ ...form, limitations: e.target.value })} /></label>
      <label className="project-field"><span>影响评估</span><textarea required value={form.impact_summary} onChange={(e) => setForm({ ...form, impact_summary: e.target.value })} /></label>
      <button className="professional-action" disabled={busy} type="submit">保存前沿专题</button>
    </form>
    <div className="professional-card-list">{data.topics.map((topic) => {
      const signals = data.signals.filter((signal) => signal.topic_id === topic.id);
      return <article className="professional-card" key={topic.id}><header><div><span className="professional-status professional-status--testing">{domainLabels[topic.domain]} · {maturityLabels[topic.maturity]}</span><h3>{topic.title}</h3></div><strong>{dispositionLabels[topic.disposition]}</strong></header><p>{topic.synthesis}</p><dl className="professional-details"><div><dt>限制</dt><dd>{topic.limitations}</dd></div><div><dt>影响</dt><dd>{topic.impact_summary}</dd></div><div><dt>复查</dt><dd>{topic.next_review_date || "未设置"}</dd></div></dl><RadarSignalForm project={project} reload={reload} spaceId={spaceId} topic={topic} />{signals.length ? <div className="professional-claims" aria-label="前沿信号列表">{signals.map((signal) => <article key={signal.id}><strong>{signal.summary}</strong><span>{signal.classification} · 原文字符 {signal.start_char}–{signal.end_char} · {signal.evidence_integrity === "valid" ? "证据复核通过" : "证据已失效"}</span></article>)}</div> : null}<RadarReviewForm reload={reload} topic={topic} /></article>;
    })}</div>
  </section>;
}

function PracticeForm({ track, reload }) {
  const [form, setForm] = useState({ title: "", practice_type: "reading", planned_for: "", instructions: "" });
  const submit = async (event) => { event.preventDefault(); try { await createLearningPractice(track.id, { ...form, planned_for: form.planned_for || null }); setForm({ title: "", practice_type: "reading", planned_for: "", instructions: "" }); await reload("练习计划已保存。 "); } catch (error) { await reload(safeError(error), true); } };
  return <form aria-label={`为 ${track.title} 新建练习`} className="professional-subform" onSubmit={submit}><h4>计划练习</h4><label className="project-field"><span>练习名称</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label className="project-field"><span>练习类型</span><select value={form.practice_type} onChange={(e) => setForm({ ...form, practice_type: e.target.value })}><option value="reading">阅读</option><option value="writing">写作</option><option value="speaking">口语文本练习</option><option value="exercise">习题</option><option value="project">项目实践</option><option value="review">复盘</option></select></label><label className="project-field"><span>计划日期</span><input type="date" value={form.planned_for} onChange={(e) => setForm({ ...form, planned_for: e.target.value })} /></label><label className="project-field project-field--wide"><span>练习要求</span><textarea required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label><button className="professional-action" type="submit">保存练习</button></form>;
}

function PracticeResultForm({ practice, reload }) {
  const [form, setForm] = useState({ reflection: "", feedback: "", self_rating: "", decision: "continue", follow_up_task_title: "" });
  const submit = async (event) => { event.preventDefault(); try { await recordLearningPractice(practice.id, practice.version, { ...form, self_rating: form.self_rating ? Number(form.self_rating) : null, follow_up_task_title: form.follow_up_task_title.trim() || null }); await reload("练习复盘已保存；可选后续任务已回链原项目。 "); } catch (error) { await reload(safeError(error), true); } };
  return <form aria-label={`复盘 ${practice.title}`} className="professional-result-form" onSubmit={submit}><label className="project-field project-field--wide"><span>练习反思</span><textarea required value={form.reflection} onChange={(e) => setForm({ ...form, reflection: e.target.value })} /></label><label className="project-field project-field--wide"><span>反馈与调整</span><textarea required value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} /></label><label className="project-field"><span>自评（可选）</span><select value={form.self_rating} onChange={(e) => setForm({ ...form, self_rating: e.target.value })}><option value="">未评分</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="project-field"><span>下一决定</span><select value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}><option value="continue">继续</option><option value="adjust">调整</option><option value="complete">达成</option></select></label><label className="project-field"><span>后续任务（可选）</span><input maxLength="240" value={form.follow_up_task_title} onChange={(e) => setForm({ ...form, follow_up_task_title: e.target.value })} /></label><button className="professional-action" type="submit">保存练习复盘</button></form>;
}

function RoutineForm({ track, reload }) {
  const [form, setForm] = useState({ title: "", cadence: "weekly", target_count: 1 });
  const submit = async (event) => { event.preventDefault(); try { await createLearningRoutine(track.id, { ...form, target_count: Number(form.target_count) }); setForm({ title: "", cadence: "weekly", target_count: 1 }); await reload("轻量学习习惯已保存；它不会替代项目任务。 "); } catch (error) { await reload(safeError(error), true); } };
  return <form aria-label={`为 ${track.title} 新建习惯`} className="professional-subform" onSubmit={submit}><h4>建立轻量习惯</h4><label className="project-field"><span>习惯名称</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label className="project-field"><span>周期</span><select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}><option value="daily">每日</option><option value="weekly">每周</option></select></label><label className="project-field"><span>目标次数</span><input min="1" max="100" type="number" value={form.target_count} onChange={(e) => setForm({ ...form, target_count: e.target.value })} /></label><button className="professional-action" type="submit">保存学习习惯</button></form>;
}

function CheckinForm({ routine, reload }) {
  const [form, setForm] = useState({ local_date: "", completed_count: 0, note: "" });
  const submit = async (event) => { event.preventDefault(); try { await createLearningCheckin(routine.id, { ...form, completed_count: Number(form.completed_count) }); setForm({ local_date: "", completed_count: 0, note: "" }); await reload("打卡已记录；同一习惯同一天不会重复写入。 "); } catch (error) { await reload(safeError(error), true); } };
  return <form aria-label={`记录 ${routine.title} 打卡`} className="growth-checkin-form" onSubmit={submit}><label className="project-field"><span>日期</span><input required type="date" value={form.local_date} onChange={(e) => setForm({ ...form, local_date: e.target.value })} /></label><label className="project-field"><span>完成次数</span><input min="0" max="100" required type="number" value={form.completed_count} onChange={(e) => setForm({ ...form, completed_count: e.target.value })} /></label><label className="project-field"><span>备注</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label><button className="professional-action" type="submit">记录打卡</button></form>;
}

function LearningWorkspace({ project, data, reload }) {
  const [form, setForm] = useState({ title: "", category: "english", focus: "academic_reading", goal: "", baseline: "", success_criteria: "" });
  const submit = async (event) => { event.preventDefault(); try { await createLearningTrack(project.id, form); setForm({ title: "", category: "english", focus: "academic_reading", goal: "", baseline: "", success_criteria: "" }); await reload("学习方向已保存；目标、基线和成功标准保持可复核。 "); } catch (error) { await reload(safeError(error), true); } };
  const changeCategory = (category) => setForm({ ...form, category, focus: category === "english" ? "academic_reading" : "general" });
  return <section aria-label="学习提升工作台" className="professional-workspace">
    <form aria-label="新建学习方向" className="professional-create-form" onSubmit={submit}><div className="professional-section-heading"><IconBook2 aria-hidden="true" /><div><h2>学习方向与能力闭环</h2><p>从目标和基线出发，经练习、反馈、调整与轻量习惯形成证据。</p></div></div><label className="project-field"><span>方向名称</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label className="project-field"><span>类别</span><select value={form.category} onChange={(e) => changeCategory(e.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="project-field"><span>英语重点</span><select disabled={form.category !== "english"} value={form.focus} onChange={(e) => setForm({ ...form, focus: e.target.value })}><option value="academic_reading">学术阅读</option><option value="academic_writing">学术写作</option><option value="daily_speaking">日常口语文本练习</option><option value="general">通用</option></select></label><label className="project-field project-field--wide"><span>学习目标</span><textarea required value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></label><label className="project-field"><span>当前基线</span><textarea required value={form.baseline} onChange={(e) => setForm({ ...form, baseline: e.target.value })} /></label><label className="project-field"><span>成功标准</span><textarea required value={form.success_criteria} onChange={(e) => setForm({ ...form, success_criteria: e.target.value })} /></label><button className="professional-action" type="submit">保存学习方向</button></form>
    <div className="professional-card-list">{data.tracks.map((track) => {
      const practices = data.practices.filter((practice) => practice.track_id === track.id);
      const routines = data.routines.filter((routine) => routine.track_id === track.id);
      return <article className="professional-card" key={track.id}><header><div><span className="professional-status professional-status--open">{categoryLabels[track.category]}</span><h3>{track.title}</h3></div><strong>{track.status === "active" ? "进行中" : track.status}</strong></header><dl className="professional-details"><div><dt>目标</dt><dd>{track.goal}</dd></div><div><dt>基线</dt><dd>{track.baseline}</dd></div><div><dt>成功标准</dt><dd>{track.success_criteria}</dd></div></dl><PracticeForm reload={reload} track={track} />{practices.map((practice) => <section className="professional-experiment" key={practice.id}><div><strong>{practice.title}</strong><span>{practice.status === "planned" ? "待练习" : practice.decision}</span></div><p>{practice.instructions}</p>{practice.status === "planned" ? <PracticeResultForm practice={practice} reload={reload} /> : <p className="professional-result"><IconCheck aria-hidden="true" /> {practice.reflection} · {practice.feedback}</p>}</section>)}<RoutineForm reload={reload} track={track} />{routines.map((routine) => { const checkins = data.checkins.filter((item) => item.routine_id === routine.id); return <section className="growth-routine" key={routine.id}><div><strong>{routine.title}</strong><span>{routine.cadence === "daily" ? "每日" : "每周"}目标 {routine.target_count} 次 · 已记录 {checkins.length} 天</span></div><CheckinForm reload={reload} routine={routine} />{checkins.map((item) => <small key={item.id}>{item.local_date} · 完成 {item.completed_count} 次{item.note ? ` · ${item.note}` : ""}</small>)}</section>; })}</article>;
    })}</div>
  </section>;
}

export function GrowthPage() {
  const [base, setBase] = useState(null);
  const [radarProjectId, setRadarProjectId] = useState("");
  const [learningProjectId, setLearningProjectId] = useState("");
  const [radarData, setRadarData] = useState({ topics: [], signals: [] });
  const [learningData, setLearningData] = useState({ tracks: [], practices: [], routines: [], checkins: [] });
  const [notice, setNotice] = useState({ text: "", error: false });
  const [loading, setLoading] = useState(true);
  const radarProjects = useMemo(() => base?.projects.filter((item) => item.template_type === "frontier_tracking") || [], [base]);
  const learningProjects = useMemo(() => base?.projects.filter((item) => item.template_type === "learning") || [], [base]);
  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const workspace = await loadProjectWorkspace(); setBase(workspace);
      setRadarProjectId((current) => current || workspace.projects.find((item) => item.template_type === "frontier_tracking")?.id || "");
      setLearningProjectId((current) => current || workspace.projects.find((item) => item.template_type === "learning")?.id || "");
    } catch (error) { setNotice({ text: safeError(error), error: true }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadBase(); }, [loadBase]);
  const reloadRadar = useCallback(async (message = "", error = false) => { if (radarProjectId) { const workspace = await loadGrowthWorkspace(radarProjectId); setRadarData(workspace.radar); } if (message) setNotice({ text: message, error }); }, [radarProjectId]);
  const reloadLearning = useCallback(async (message = "", error = false) => { if (learningProjectId) { const workspace = await loadGrowthWorkspace(learningProjectId); setLearningData(workspace.learning); } if (message) setNotice({ text: message, error }); }, [learningProjectId]);
  useEffect(() => { reloadRadar().catch((error) => setNotice({ text: safeError(error), error: true })); }, [reloadRadar]);
  useEffect(() => { reloadLearning().catch((error) => setNotice({ text: safeError(error), error: true })); }, [reloadLearning]);
  const radarProject = radarProjects.find((item) => item.id === radarProjectId);
  const learningProject = learningProjects.find((item) => item.id === learningProjectId);
  return <div className="page page--wide professional-page growth-page">
    <PageHeader eyebrow="GROWTH WORKBENCH" title="前沿与学习" description="把可核验信号、学习练习和轻量习惯连接回同一个项目、来源与任务真源。" actions={<button className="secondary-button" onClick={async () => { await loadBase(); await Promise.all([reloadRadar(), reloadLearning()]); }} type="button"><IconRefresh aria-hidden="true" /> 刷新</button>} />
    <div className="professional-boundary"><IconRadar2 aria-hidden="true" /><span>当前首版只保存人工输入和受控本地来源；不抓取外部资讯、不评分发音、不自动生成学习结论。</span></div>
    {notice.text ? <div aria-live="polite" className={`professional-notice${notice.error ? " is-error" : ""}`} role="status">{notice.text}</div> : null}
    <div className="professional-summary"><div><span>前沿专题</span><strong>{radarData.topics.length}</strong></div><div><span>固定来源信号</span><strong>{radarData.signals.length}</strong></div><div><span>学习方向</span><strong>{learningData.tracks.length}</strong></div><div><span>习惯打卡</span><strong>{learningData.checkins.length}</strong></div></div>
    {loading ? <p>正在加载成长工作台…</p> : <>
      <section className="professional-domain"><div className="professional-domain__header"><div><span>// WP3 · FRONTIER RADAR</span><h2>科技前沿雷达</h2></div>{radarProjects.length ? <ProjectSelector label="当前前沿项目" projects={radarProjects} value={radarProjectId} onChange={setRadarProjectId} /> : null}</div>{radarProject ? <RadarWorkspace data={radarData} project={radarProject} reload={reloadRadar} spaceId={base.space.id} /> : <EmptyProject name="前沿跟踪" />}</section>
      <section className="professional-domain"><div className="professional-domain__header"><div><span>// WP4 / WP5 · LEARNING LOOP</span><h2>学习提升与轻量习惯</h2></div>{learningProjects.length ? <ProjectSelector label="当前学习项目" projects={learningProjects} value={learningProjectId} onChange={setLearningProjectId} /> : null}</div>{learningProject ? <LearningWorkspace data={learningData} project={learningProject} reload={reloadLearning} /> : <EmptyProject name="学习提升" />}</section>
    </>}
  </div>;
}
