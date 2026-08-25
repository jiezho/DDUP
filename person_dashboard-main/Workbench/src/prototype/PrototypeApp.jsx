import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBell,
  IconBolt,
  IconBook2,
  IconBrain,
  IconCalendarCheck,
  IconChartLine,
  IconCheck,
  IconChevronRight,
  IconCircle,
  IconClock,
  IconCode,
  IconCommand,
  IconDatabase,
  IconDots,
  IconExternalLink,
  IconFileText,
  IconFilter,
  IconFlag3,
  IconFlask2,
  IconFolders,
  IconHeartRateMonitor,
  IconHome,
  IconLanguage,
  IconLink,
  IconListCheck,
  IconMenu2,
  IconMessageCircle,
  IconMicroscope,
  IconMicrophone,
  IconNetwork,
  IconPaperclip,
  IconPlus,
  IconRadar2,
  IconRobot,
  IconSchool,
  IconSearch,
  IconSend,
  IconSettings,
  IconSparkles,
  IconTargetArrow,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import "./prototype.css";

const navGroups = [
  {
    label: "行动",
    items: [
      { id: "today", label: "今日", icon: IconHome },
      { id: "projects", label: "项目工作台", icon: IconFolders },
    ],
  },
  {
    label: "知识与研究",
    items: [
      { id: "context", label: "上下文知识库", icon: IconDatabase },
      { id: "research", label: "科研工作台", icon: IconMicroscope },
      { id: "ai-lab", label: "AI 应用实验室", icon: IconRobot },
      { id: "radar", label: "前沿雷达", icon: IconRadar2 },
    ],
  },
  {
    label: "成长与输出",
    items: [
      { id: "learning", label: "学习提升", icon: IconSchool },
      { id: "planning", label: "计划与复盘", icon: IconCalendarCheck },
    ],
  },
];

const initialProjects = [
  {
    id: "ai-workbench",
    name: "个人 AI 助手建设",
    type: "AI 应用",
    stage: "需求与原型",
    progress: 62,
    tone: "blue",
    next: "完成 8 个关键页面原型",
    due: "8月30日",
    docs: 18,
    knowledge: 46,
    discussions: 4,
    tasks: 12,
  },
  {
    id: "doctor-research",
    name: "Agent 可靠性研究",
    type: "博士科研",
    stage: "实验验证",
    progress: 48,
    tone: "cyan",
    next: "完成基线与失败样本分析",
    due: "9月06日",
    docs: 36,
    knowledge: 82,
    discussions: 7,
    tasks: 19,
  },
  {
    id: "energy-radar",
    name: "AI × 电力能源前沿跟踪",
    type: "前沿专题",
    stage: "持续观察",
    progress: 35,
    tone: "amber",
    next: "核验虚拟电厂新标准影响",
    due: "本周五",
    docs: 29,
    knowledge: 64,
    discussions: 3,
    tasks: 8,
  },
  {
    id: "academic-english",
    name: "12 周学术英语提升",
    type: "学习提升",
    stage: "第 4 周",
    progress: 33,
    tone: "indigo",
    next: "完成 5 分钟学术汇报录音",
    due: "今天",
    docs: 12,
    knowledge: 31,
    discussions: 2,
    tasks: 15,
  },
];

const pageMeta = {
  today: ["TODAY", "今日工作台", "把全部项目、学习与研究压缩成今天真正需要处理的事项。"],
  projects: ["PROJECT PORTFOLIO", "项目工作台", "建立不同类型项目，在同一处管理文档、知识、讨论、决策和推进节奏。"],
  context: ["PERSONAL CONTEXT", "个人上下文知识库", "融合全部授权项目与专业模块，保留来源、关系与权限边界。"],
  research: ["RESEARCH", "科研工作台", "围绕研究问题组织文献、假设、实验、证据和写作。"],
  "ai-lab": ["AI APPLICATION LAB", "AI 应用实验室", "从需求信号到原型、评测和继续或停止的决策闭环。"],
  radar: ["FRONTIER RADAR", "前沿雷达", "跟踪 AI、IT、电力能源与科研方法的重要变化。"],
  learning: ["LEARNING & GROWTH", "学习提升", "英语是首个方向，也可扩展科研方法、编程、专业技术与表达能力。"],
  planning: ["PLANNING & REVIEW", "计划与复盘", "让目标、项目、今日行动、总结和习惯形成反馈循环。"],
  runtime: ["AI RUNTIME GOVERNANCE", "AI 运行中心", "用统一接口隔离执行引擎，清楚查看运行、审批、数据范围与安全护栏。"],
};

function Badge({ children, tone = "neutral" }) {
  return <span className={`proto-badge proto-badge--${tone}`}>{children}</span>;
}

function Progress({ value, tone = "blue" }) {
  return (
    <span className="proto-progress" aria-label={`完成 ${value}%`}>
      <span className={`proto-progress__bar proto-progress__bar--${tone}`} style={{ width: `${value}%` }} />
    </span>
  );
}

function Section({ title, eyebrow, action, children, className = "" }) {
  return (
    <section className={`proto-panel ${className}`}>
      <div className="proto-panel__head">
        <div>
          {eyebrow ? <span className="proto-eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MiniAction({ icon: Icon, label, onClick, primary = false }) {
  return (
    <button className={`proto-action${primary ? " proto-action--primary" : ""}`} onClick={onClick} type="button">
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span>{label}</span>
    </button>
  );
}

export function PrototypeApp() {
  const [activePage, setActivePage] = useState("today");
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectTab, setProjectTab] = useState("总览");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projects, setProjects] = useState(initialProjects);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setMobileOpen(false);
        setSearchOpen(false);
        setCaptureOpen(false);
        setNewProjectOpen(false);
        setAssistantOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = (id) => {
    setActivePage(id);
    setSelectedProject(null);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const page = selectedProject ? "project-detail" : activePage;
  const meta = selectedProject
    ? ["PROJECT FOCUS", selectedProject.name, `${selectedProject.type} · ${selectedProject.stage}`]
    : pageMeta[activePage];

  return (
    <div className="prototype-root">
      <aside className={`proto-sidebar${mobileOpen ? " proto-sidebar--open" : ""}`}>
        <div className="proto-brand">
          <span className="proto-brand__mark"><img alt="" aria-hidden="true" src="/workbench-mark.svg" /></span>
          <span><strong>DDUP</strong><small>PERSONAL CONTEXT</small></span>
          <button aria-label="关闭导航" className="proto-icon-btn proto-sidebar__close" onClick={() => setMobileOpen(false)} type="button"><IconX /></button>
        </div>

        <nav className="proto-nav" aria-label="原型导航">
          {navGroups.map((group) => (
            <div className="proto-nav__group" key={group.label}>
              <span className="proto-nav__label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id && !selectedProject;
                return (
                  <button className={`proto-nav__item${active ? " is-active" : ""}`} key={item.id} onClick={() => navigate(item.id)} type="button">
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.id === "projects" ? <em>4</em> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="proto-sidebar__foot">
          <button className="proto-space" type="button">
            <span className="proto-space__dot" />
            <span><small>当前空间</small><strong>个人融合上下文</strong></span>
            <IconChevronRight aria-hidden="true" />
          </button>
          <button className={`proto-nav__item${activePage === "runtime" && !selectedProject ? " is-active" : ""}`} onClick={() => navigate("runtime")} type="button"><IconSettings /><span>AI 运行中心</span><em>POC</em></button>
        </div>
      </aside>

      {mobileOpen ? <button aria-label="关闭导航" className="proto-backdrop" onClick={() => setMobileOpen(false)} type="button" /> : null}

      <main className="proto-main">
        <header className="proto-topbar">
          <div className="proto-mobile-brand">
            <button aria-label="打开导航" className="proto-icon-btn" onClick={() => setMobileOpen(true)} type="button"><IconMenu2 /></button>
            <span className="proto-brand__mark"><img alt="" aria-hidden="true" src="/workbench-mark.svg" /></span>
            <strong>DDUP</strong>
          </div>
          <button className="proto-search-trigger" onClick={() => setSearchOpen(true)} type="button">
            <IconSearch aria-hidden="true" />
            <span>搜索全部项目与知识</span>
            <kbd><IconCommand /> K</kbd>
          </button>
          <div className="proto-topbar__actions">
            <button aria-label="通知" className="proto-icon-btn proto-notification" type="button"><IconBell /><span>3</span></button>
            <MiniAction icon={IconPlus} label="快速捕获" onClick={() => setCaptureOpen(true)} />
            <MiniAction icon={IconSparkles} label="问 AI" onClick={() => setAssistantOpen(true)} primary />
          </div>
        </header>

        <div className="proto-content">
          <div className="proto-page-head">
            {selectedProject ? (
              <button className="proto-back" onClick={() => setSelectedProject(null)} type="button"><IconArrowLeft /> 返回项目组合</button>
            ) : null}
            <span className="proto-eyebrow">{meta[0]}</span>
            <div className="proto-page-head__row">
              <div>
                <h1>{meta[1]}</h1>
                <p>{meta[2]}</p>
              </div>
              {page === "projects" ? <MiniAction icon={IconPlus} label="新建项目" onClick={() => setNewProjectOpen(true)} primary /> : null}
              {page === "project-detail" ? <MiniAction icon={IconSparkles} label="在本项目中问 AI" onClick={() => setAssistantOpen(true)} primary /> : null}
            </div>
          </div>

          {page === "today" ? <TodayPage projects={projects} onCapture={() => setCaptureOpen(true)} onOpenProject={setSelectedProject} onAsk={() => setAssistantOpen(true)} /> : null}
          {page === "projects" ? <ProjectsPage projects={projects} onNew={() => setNewProjectOpen(true)} onOpen={setSelectedProject} /> : null}
          {page === "project-detail" ? <ProjectDetail project={selectedProject} tab={projectTab} onTab={setProjectTab} onToast={showToast} /> : null}
          {page === "context" ? <ContextPage onAsk={() => setAssistantOpen(true)} /> : null}
          {page === "research" ? <ResearchPage onOpenProject={() => setSelectedProject(projects[1])} /> : null}
          {page === "ai-lab" ? <AiLabPage onOpenProject={() => setSelectedProject(projects[0])} /> : null}
          {page === "radar" ? <RadarPage onToast={showToast} /> : null}
          {page === "learning" ? <LearningPage onOpenProject={() => setSelectedProject(projects[3])} /> : null}
          {page === "planning" ? <PlanningPage onToast={showToast} /> : null}
          {page === "runtime" ? <RuntimePage onToast={showToast} /> : null}
        </div>
      </main>

      <nav className="proto-bottom-nav" aria-label="移动端导航">
        {[
          ["today", "今日", IconHome],
          ["projects", "项目", IconFolders],
          ["capture", "捕获", IconPlus],
          ["assistant", "问 AI", IconSparkles],
          ["context", "我的", IconDatabase],
        ].map(([id, label, Icon]) => (
          <button className={activePage === id ? "is-active" : ""} key={id} onClick={() => id === "capture" ? setCaptureOpen(true) : id === "assistant" ? setAssistantOpen(true) : navigate(id)} type="button">
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>

      <AssistantPanel open={assistantOpen} project={selectedProject} onClose={() => setAssistantOpen(false)} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={(id) => { setSearchOpen(false); navigate(id); }} />
      <CaptureDialog open={captureOpen} onClose={() => setCaptureOpen(false)} onSave={() => { setCaptureOpen(false); showToast("已保存到通用收件箱，可稍后关联项目"); }} />
      <NewProjectDialog open={newProjectOpen} onClose={() => setNewProjectOpen(false)} onCreate={(project) => { setProjects((items) => [project, ...items]); setNewProjectOpen(false); setActivePage("projects"); setProjectTab("总览"); setSelectedProject(project); showToast("项目已创建，正在建立项目知识空间"); }} />
      {toast ? <div className="proto-toast"><IconCheck />{toast}</div> : null}
    </div>
  );
}

function TodayPage({ projects, onCapture, onOpenProject, onAsk }) {
  const [tasks, setTasks] = useState([
    { id: 1, text: "完成项目工作台关键页原型", project: "个人 AI 助手建设", done: false },
    { id: 2, text: "复核 Agent 实验失败样本", project: "Agent 可靠性研究", done: false },
    { id: 3, text: "学术汇报口语练习 10 分钟", project: "12 周学术英语提升", done: true },
  ]);
  const done = tasks.filter((task) => task.done).length;

  return (
    <>
      <section className="proto-hero">
        <div className="proto-hero__copy">
          <span className="proto-eyebrow proto-eyebrow--light">TUESDAY · 8月18日</span>
          <h2>今天聚焦三件真正重要的事。</h2>
          <p>两个项目需要推进，一项研究等待判断，英语练习可在晚间完成。</p>
          <div className="proto-hero__actions">
            <MiniAction icon={IconPlus} label="快速捕获" onClick={onCapture} />
            <MiniAction icon={IconSparkles} label="让 AI 帮我规划" onClick={onAsk} primary />
          </div>
        </div>
        <div className="proto-orbit" aria-label="融合上下文状态">
          <span className="proto-orbit__ring" />
          <span className="proto-orbit__core"><IconBrain /></span>
          <span className="proto-orbit__node proto-orbit__node--one">项目</span>
          <span className="proto-orbit__node proto-orbit__node--two">科研</span>
          <span className="proto-orbit__node proto-orbit__node--three">学习</span>
        </div>
      </section>

      <div className="proto-metric-strip">
        {[ ["今日关键结果", `${done}/3`, "按计划推进"], ["活跃项目", "4", "1 项今日到期"], ["待确认", "3", "记忆与决策"], ["上下文对象", "1,284", "全部授权空间"] ].map(([label, value, hint], index) => (
          <div className={`proto-metric${index === 1 ? " is-accent" : ""}`} key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>
        ))}
      </div>

      <div className="proto-grid proto-grid--today">
        <Section title="今日关键结果" eyebrow="NEXT ACTIONS" action={<button className="proto-text-btn" type="button">查看全部 <IconArrowRight /></button>}>
          <div className="proto-task-list">
            {tasks.map((task) => (
              <button className={`proto-task${task.done ? " is-done" : ""}`} key={task.id} onClick={() => setTasks((items) => items.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))} type="button">
                {task.done ? <IconCheck /> : <IconCircle />}
                <span><strong>{task.text}</strong><small>{task.project}</small></span>
                <IconChevronRight />
              </button>
            ))}
          </div>
        </Section>

        <Section title="今日简报" eyebrow="BRIEFING" className="proto-panel--brief">
          <article className="proto-brief-feature">
            <Badge tone="blue">AI AGENT</Badge>
            <h3>多智能体评测从“完成任务”转向“过程可验证”</h3>
            <p>与你的 Agent 可靠性研究高度相关，已关联 3 个来源和 1 个项目讨论。</p>
            <button className="proto-text-btn" type="button">查看证据 <IconExternalLink /></button>
          </article>
          <div className="proto-brief-row"><span>电力能源</span><strong>虚拟电厂标准出现两项关键变化</strong><IconChevronRight /></div>
          <div className="proto-brief-row"><span>AI 应用</span><strong>本周新增 4 个企业知识助手需求信号</strong><IconChevronRight /></div>
        </Section>

        <Section title="项目与下一步" eyebrow="PROJECT FOCUS" className="proto-panel--wide">
          <div className="proto-project-row-list">
            {projects.slice(0, 3).map((project) => (
              <button className="proto-project-row" key={project.id} onClick={() => onOpenProject(project)} type="button">
                <span className={`proto-project-mark proto-project-mark--${project.tone}`} />
                <span className="proto-project-row__main"><strong>{project.name}</strong><small>{project.next}</small></span>
                <span className="proto-project-row__progress"><Progress value={project.progress} tone={project.tone} /><small>{project.progress}%</small></span>
                <Badge>{project.due}</Badge>
                <IconChevronRight />
              </button>
            ))}
          </div>
        </Section>

        <Section title="等待处理" eyebrow="REVIEW QUEUE">
          <div className="proto-review-list">
            <div><span className="proto-status-dot proto-status-dot--amber" /><p><strong>2 条记忆候选</strong><small>来自本周研究与学习记录</small></p><Badge tone="amber">待确认</Badge></div>
            <div><span className="proto-status-dot proto-status-dot--blue" /><p><strong>1 个项目决策</strong><small>飞书是否作为移动首入口</small></p><Badge tone="blue">待决定</Badge></div>
            <div><span className="proto-status-dot proto-status-dot--red" /><p><strong>1 项阻塞</strong><small>公司空间模型策略尚未明确</small></p><Badge tone="red">阻塞</Badge></div>
          </div>
        </Section>
      </div>
    </>
  );
}

function ProjectsPage({ projects, onNew, onOpen }) {
  const [filter, setFilter] = useState("全部");
  const filtered = filter === "全部" ? projects : projects.filter((project) => project.type.includes(filter));
  return (
    <>
      <div className="proto-toolbar">
        <div className="proto-filter-group">
          {["全部", "科研", "AI 应用", "学习"].map((item) => <button className={filter === item ? "is-active" : ""} key={item} onClick={() => setFilter(item)} type="button">{item}</button>)}
        </div>
        <button className="proto-filter-btn" type="button"><IconFilter /> 状态与空间</button>
      </div>
      <div className="proto-project-grid">
        {filtered.map((project) => (
          <button className="proto-project-card" key={project.id} onClick={() => onOpen(project)} type="button">
            <div className="proto-project-card__top"><span className={`proto-project-symbol proto-project-symbol--${project.tone}`}><IconFolders /></span><IconDots /></div>
            <Badge tone={project.tone === "amber" ? "amber" : "blue"}>{project.type}</Badge>
            <h2>{project.name}</h2>
            <p>{project.next}</p>
            <div className="proto-project-card__meta"><span>{project.stage}</span><span>{project.due}</span></div>
            <Progress value={project.progress} tone={project.tone} />
            <div className="proto-project-card__counts"><span><IconFileText />{project.docs}</span><span><IconBrain />{project.knowledge}</span><span><IconMessageCircle />{project.discussions}</span><span><IconListCheck />{project.tasks}</span></div>
          </button>
        ))}
        <button className="proto-project-card proto-project-card--new" onClick={onNew} type="button"><span><IconPlus /></span><strong>建立新项目</strong><small>空白、科研、AI 应用、学习或内容项目</small></button>
      </div>
    </>
  );
}

function ProjectDetail({ project, tab, onTab, onToast }) {
  const tabs = ["总览", "文档", "知识", "讨论", "决策", "任务"];
  return (
    <>
      <div className="proto-project-summary">
        <div><Badge tone="blue">{project.type}</Badge><span>{project.stage}</span><span>个人本地空间</span></div>
        <div className="proto-project-summary__progress"><span>项目进度</span><Progress value={project.progress} tone={project.tone} /><strong>{project.progress}%</strong></div>
      </div>
      <div className="proto-tabs" role="tablist">
        {tabs.map((item) => <button aria-selected={tab === item} className={tab === item ? "is-active" : ""} key={item} onClick={() => onTab(item)} role="tab" type="button">{item}</button>)}
      </div>
      {tab === "总览" ? <ProjectOverview project={project} onToast={onToast} /> : null}
      {tab === "文档" ? <ProjectDocuments /> : null}
      {tab === "知识" ? <ProjectKnowledge /> : null}
      {tab === "讨论" ? <ProjectDiscussions onToast={onToast} /> : null}
      {tab === "决策" ? <ProjectDecisions /> : null}
      {tab === "任务" ? <ProjectTasks /> : null}
    </>
  );
}

function ProjectOverview({ project, onToast }) {
  return (
    <div className="proto-grid proto-grid--project">
      <Section title="项目焦点" eyebrow="FOCUS" className="proto-panel--accent-edge">
        <div className="proto-focus-block"><span>目标</span><h3>完成可演示、可评审的个人上下文智能工作台 MVP</h3></div>
        <div className="proto-focus-block"><span>成功标准</span><p>项目文档与知识可讨论；全局问答能跨模块引用；移动端高频动作在三步内完成。</p></div>
        <div className="proto-focus-block"><span>当前下一步</span><p><IconArrowRight /> {project.next}</p></div>
      </Section>
      <Section title="下一里程碑" eyebrow="MILESTONE">
        <div className="proto-milestone"><span className="proto-milestone__date">AUG<br /><strong>30</strong></span><div><Badge tone="blue">原型评审</Badge><h3>完成关键页面与移动适配</h3><p>剩余 4 项任务 · 1 项阻塞</p></div></div>
        <Progress value={72} />
      </Section>
      <Section title="待讨论与待决策" eyebrow="DISCUSS & DECIDE" className="proto-panel--wide">
        <div className="proto-discussion-list">
          <article><span className="proto-discussion-icon"><IconMessageCircle /></span><div><Badge tone="amber">待决策</Badge><h3>移动端是否优先采用飞书机器人？</h3><p>3 条观点 · 关联《移动端接入比较》与 2 个风险</p></div><button onClick={() => onToast("已打开讨论，结论可转为决策记录")} type="button">进入讨论 <IconArrowRight /></button></article>
          <article><span className="proto-discussion-icon"><IconAlertTriangle /></span><div><Badge tone="red">阻塞</Badge><h3>公司受限空间允许使用哪些模型？</h3><p>需要确认部署边界后才能完成上下文策略</p></div><button onClick={() => onToast("已标记为需要负责人确认")} type="button">请求确认 <IconArrowRight /></button></article>
        </div>
      </Section>
      <Section title="项目知识" eyebrow="PROJECT CONTEXT">
        <div className="proto-context-count"><strong>{project.knowledge}</strong><span>知识对象</span></div>
        <div className="proto-pill-cloud"><span>上下文包</span><span>混合检索</span><span>项目讨论</span><span>权限策略</span><span>移动入口</span></div>
        <button className="proto-text-btn" type="button">打开项目知识库 <IconArrowRight /></button>
      </Section>
      <Section title="最近动态" eyebrow="ACTIVITY">
        <div className="proto-timeline"><div><IconFileText /><p><strong>更新产品 Spec</strong><small>12 分钟前 · 产品设计</small></p></div><div><IconMessageCircle /><p><strong>新增 2 条讨论回复</strong><small>1 小时前 · 移动端方案</small></p></div><div><IconCheck /><p><strong>完成信息架构评审</strong><small>昨天 · 里程碑</small></p></div></div>
      </Section>
    </div>
  );
}

function ProjectDocuments() {
  return <Section title="项目文档" eyebrow="18 DOCUMENTS" action={<MiniAction icon={IconPlus} label="新建文档" />}><div className="proto-doc-table">{[["产品需求与设计 V1.1","需求","今天 10:42","已评审"],["UI 原型与功能 Spec","设计","今天 09:20","编写中"],["移动端接入比较","调研","昨天","待决策"],["上下文权限模型","架构","8月16日","待评审"]].map((row) => <button key={row[0]} type="button"><IconFileText /><span><strong>{row[0]}</strong><small>{row[1]}</small></span><time>{row[2]}</time><Badge tone={row[3] === "待决策" ? "amber" : "blue"}>{row[3]}</Badge><IconChevronRight /></button>)}</div></Section>;
}

function ProjectKnowledge() {
  return <div className="proto-grid"><Section title="项目知识图" eyebrow="46 OBJECTS" className="proto-panel--wide"><div className="proto-knowledge-map"><span className="node node--main">项目工作台</span><span className="node node--a">上下文库</span><span className="node node--b">科研</span><span className="node node--c">AI Lab</span><span className="node node--d">学习提升</span><i className="line line--a" /><i className="line line--b" /><i className="line line--c" /><i className="line line--d" /></div></Section><Section title="待复核" eyebrow="KNOWLEDGE HEALTH"><div className="proto-review-list"><div><span className="proto-status-dot proto-status-dot--amber" /><p><strong>项目与计划边界</strong><small>存在 2 条相似定义</small></p></div><div><span className="proto-status-dot proto-status-dot--blue" /><p><strong>全局上下文范围</strong><small>已补充权限说明</small></p></div></div></Section></div>;
}

function ProjectDiscussions({ onToast }) {
  return <Section title="项目讨论" eyebrow="4 OPEN TOPICS" action={<MiniAction icon={IconPlus} label="发起讨论" primary />}><div className="proto-thread-list">{[["移动端首入口选择","飞书机器人、PWA 与微信合规入口之间如何排序？",6,"待决策"],["上下文默认检索范围","全部授权内容是否默认参与问答？",4,"已形成共识"],["项目与专业工作台关系","科研和 AI Lab 是否应共享项目对象？",3,"已决定"]].map(([title,desc,count,status]) => <article key={title}><div className="proto-avatar-stack"><span>我</span><span>AI</span></div><div><Badge tone={status === "待决策" ? "amber" : "blue"}>{status}</Badge><h3>{title}</h3><p>{desc}</p><small><IconMessageCircle /> {count} 条回复 · 关联 2 个文档</small></div><div className="proto-thread-actions"><button onClick={() => onToast("讨论已生成候选决策，等待确认")} type="button">形成决策</button><button type="button">查看讨论</button></div></article>)}</div></Section>;
}

function ProjectDecisions() {
  return <Section title="决策记录" eyebrow="12 DECISIONS"><div className="proto-decision-list">{[["专业工作台复用统一项目对象","已决定","避免双份项目数据","8月18日"],["个人上下文采用逻辑融合","已决定","跨模块发现，保留权限边界","8月18日"],["首版不做个人微信自动化","有效","稳定性与合规风险","8月17日"]].map(([title,status,reason,date]) => <article key={title}><span className="proto-decision-check"><IconCheck /></span><div><h3>{title}</h3><p>{reason}</p><small>{date} · 依据 3 项</small></div><Badge tone="blue">{status}</Badge><IconChevronRight /></article>)}</div></Section>;
}

function ProjectTasks() {
  const columns = { "待开始": ["完成移动底栏","补充空状态"], "进行中": ["项目详情页原型","编写 Spec"], "阻塞": ["确认公司模型边界"], "已完成": ["信息架构","天蓝色视觉令牌"] };
  return <div className="proto-kanban">{Object.entries(columns).map(([title,items]) => <section key={title}><header><span>{title}</span><Badge>{items.length}</Badge></header>{items.map((item) => <article key={item}><strong>{item}</strong><small>个人 AI 助手建设</small><div><span className="proto-avatar">我</span><time>8月30日</time></div></article>)}</section>)}</div>;
}

function ContextPage({ onAsk }) {
  const [scope, setScope] = useState("全部授权内容");
  return (
    <>
      <div className="proto-context-hero">
        <div><span className="proto-eyebrow">UNIFIED CONTEXT INDEX</span><h2>一个入口，理解所有项目与学习。</h2><p>源内容仍保留在各自空间；融合层只建立可重建索引、关系与权限感知上下文。</p></div>
        <button onClick={onAsk} type="button"><IconSparkles /> 在全部上下文中提问</button>
      </div>
      <div className="proto-scope-bar"><span>检索范围</span>{["全部授权内容","当前项目","公开知识","个人本地","公司受限"].map((item) => <button className={scope === item ? "is-active" : ""} key={item} onClick={() => setScope(item)} type="button">{item}{item === "公司受限" ? <IconAlertTriangle /> : null}</button>)}</div>
      <div className="proto-metric-strip proto-metric-strip--compact">{[["上下文对象","1,284"],["项目","4"],["知识关系","3,912"],["待复核","17"]].map(([label,value]) => <div className="proto-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="proto-grid">
        <Section title="跨项目知识网络" eyebrow="RELATION MAP" className="proto-panel--wide"><div className="proto-network"><span className="hub"><IconBrain />个人上下文</span><span className="sat sat--one">项目工作台<small>4 项目</small></span><span className="sat sat--two">科研<small>82 对象</small></span><span className="sat sat--three">AI Lab<small>46 对象</small></span><span className="sat sat--four">学习<small>31 对象</small></span><span className="sat sat--five">计划<small>24 对象</small></span></div></Section>
        <Section title="最近形成的知识" eyebrow="RECENT KNOWLEDGE"><div className="proto-knowledge-list">{[["专业工作台应复用项目对象","决策","个人 AI 助手建设"],["过程可验证是 Agent 评测关键","结论","Agent 可靠性研究"],["学术汇报中的高频衔接表达","学习卡","学术英语提升"]].map(([title,type,project]) => <button key={title} type="button"><span className="proto-knowledge-icon"><IconNetwork /></span><span><strong>{title}</strong><small>{type} · {project}</small></span><IconChevronRight /></button>)}</div></Section>
      </div>
    </>
  );
}

function ResearchPage({ onOpenProject }) {
  return <div className="proto-grid proto-grid--research"><Section title="研究项目" eyebrow="2 ACTIVE" className="proto-panel--wide" action={<button className="proto-text-btn" onClick={onOpenProject} type="button">打开项目 <IconArrowRight /></button>}><div className="proto-research-hero"><div><Badge tone="blue">实验验证</Badge><h2>Agent 可靠性研究</h2><p>研究多步 Agent 在工具调用、信息缺失与失败恢复中的可靠性边界。</p><Progress value={48} tone="cyan" /></div><div className="proto-research-stats"><span><strong>36</strong>论文</span><span><strong>7</strong>假设</span><span><strong>14</strong>实验</span><span><strong>4</strong>支持结论</span></div></div></Section><Section title="Claim—Evidence" eyebrow="EVIDENCE HEALTH"><div className="proto-evidence-bars"><div><span>已支持</span><i><b style={{width:"68%"}} /></i><strong>4</strong></div><div><span>部分支持</span><i><b style={{width:"42%"}} /></i><strong>2</strong></div><div><span>无证据</span><i><b style={{width:"18%"}} /></i><strong>1</strong></div></div></Section><Section title="最近实验" eyebrow="EXPERIMENTS"><div className="proto-experiment-list"><article><span><IconFlask2 /></span><div><Badge tone="red">失败分析</Badge><h3>EXP-014 · 上下文截断压力测试</h3><p>发现长上下文下工具选择准确率显著下降，待定位机制。</p></div></article><article><span><IconCheck /></span><div><Badge tone="blue">已完成</Badge><h3>EXP-013 · 审批门消融</h3><p>审批门降低高风险误写入，但增加 11% 交互耗时。</p></div></article></div></Section><Section title="文献矩阵" eyebrow="LITERATURE"><div className="proto-matrix"><div className="proto-matrix__head"><span>论文</span><span>任务</span><span>评测</span><span>局限</span></div>{[["AgentBench","工具 Agent","成功率","过程不可解释"],["τ-bench","真实工作流","任务通过","领域有限"],["SWE-bench","软件工程","Issue 解决","成本高"]].map(row => <div key={row[0]}>{row.map(cell => <span key={cell}>{cell}</span>)}</div>)}</div></Section></div>;
}

function AiLabPage({ onOpenProject }) {
  const stages = [
    ["需求信号", [["研究资料自动归档","12 个信号","高频"],["跨项目经验复用","8 个信号","高价值"]]],
    ["验证中", [["个人 AI 助手建设","访谈 6/10","核心项目"],["论文证据检查器","样本 28","待评测"]]],
    ["原型与评测", [["飞书捕获机器人","P95 3.2s","可用"],["上下文范围解释器","准确率 92%","评审中"]]],
    ["已决定", [["个人微信自动化","终止","合规风险"],["本地 Markdown 事实源","继续","已确认"]]],
  ];
  return <><div className="proto-lab-summary"><div><IconBolt /><span><small>本月新增信号</small><strong>24</strong></span></div><div><IconCode /><span><small>验证中机会</small><strong>5</strong></span></div><div><IconChartLine /><span><small>原型评测</small><strong>3</strong></span></div><button onClick={onOpenProject} type="button">打开核心项目 <IconArrowRight /></button></div><div className="proto-lab-board">{stages.map(([stage,cards],index) => <section key={stage}><header><span>{stage}</span><Badge>{cards.length}</Badge></header>{cards.map(([title,metric,status]) => <article key={title}><Badge tone={index === 3 ? "neutral" : index === 0 ? "amber" : "blue"}>{status}</Badge><h3>{title}</h3><p>{metric}</p><div><span className="proto-avatar">AI</span><IconChevronRight /></div></article>)}</section>)}</div></>;
}

function RadarPage({ onToast }) {
  const [domain, setDomain] = useState("全部");
  const signals = [
    { domain:"AI", title:"Agent 评测开始强调过程可验证与可恢复", source:"官方论文 · 3 个一手来源", impact:"高", tone:"blue" },
    { domain:"电力能源", title:"虚拟电厂互操作标准进入公开征求意见阶段", source:"标准组织 · 2 个一手来源", impact:"高", tone:"amber" },
    { domain:"IT", title:"本地优先同步框架新增细粒度权限模型", source:"项目发布 · 1 个一手来源", impact:"中", tone:"cyan" },
    { domain:"科研", title:"开放同行评议数据集扩展到跨学科研究", source:"研究机构 · 2 个一手来源", impact:"中", tone:"indigo" },
  ];
  return <><div className="proto-domain-tabs">{["全部","AI","IT","电力能源","科研"].map(item => <button className={domain===item?"is-active":""} key={item} onClick={()=>setDomain(item)} type="button">{item}</button>)}</div><div className="proto-grid proto-grid--radar"><Section title="重要信号" eyebrow="VERIFIED SIGNALS" className="proto-panel--wide">{signals.filter(s=>domain==="全部"||s.domain===domain).map(signal => <article className="proto-signal" key={signal.title}><span className={`proto-signal__mark proto-signal__mark--${signal.tone}`}><IconRadar2 /></span><div><Badge tone={signal.tone === "amber" ? "amber" : "blue"}>{signal.domain}</Badge><h3>{signal.title}</h3><p>{signal.source}</p></div><div className="proto-signal__impact"><small>个人影响</small><strong>{signal.impact}</strong><button onClick={()=>onToast("已加入关注，并关联到前沿专题项目")} type="button">关注</button></div></article>)}</Section><Section title="本周雷达" eyebrow="WEEKLY OVERVIEW"><div className="proto-radar-ring"><div><strong>17</strong><span>有效信号</span></div><i className="r1" /><i className="r2" /><i className="r3" /><i className="r4" /></div><div className="proto-radar-legend"><span><i className="blue" />高影响 4</span><span><i className="cyan" />观察中 8</span><span><i className="gray" />低相关 5</span></div></Section></div></>;
}

function LearningPage({ onOpenProject }) {
  const [track, setTrack] = useState("英语");
  const tracks = [["英语",IconLanguage,"第 4 周","33%"],["科研方法",IconMicroscope,"规划中","12%"],["编程与 AI",IconCode,"持续学习","46%"],["专业技术",IconBolt,"待建立","0%"]];
  return <><div className="proto-learning-tracks">{tracks.map(([name,Icon,status,progress]) => <button className={track===name?"is-active":""} key={name} onClick={()=>setTrack(name)} type="button"><span><Icon /></span><div><strong>{name}</strong><small>{status}</small></div><em>{progress}</em></button>)}<button className="proto-learning-track--new" type="button"><IconPlus /><span>新方向</span></button></div>{track === "英语" ? <div className="proto-grid proto-grid--learning"><Section title="今日学习" eyebrow="ENGLISH · DAY 23" className="proto-panel--wide"><div className="proto-learning-plan">{[["日常口语","讨论周末安排","10 min",IconMicrophone],["学术阅读","精读 Agent 评测论文摘要","15 min",IconBook2],["表达复习","12 个高频衔接表达","5 min",IconBrain]].map(([title,desc,time,Icon],index) => <button key={title} type="button"><span className={index===0?"is-primary":""}><Icon /></span><div><strong>{title}</strong><small>{desc}</small></div><Badge>{time}</Badge><IconArrowRight /></button>)}</div></Section><Section title="本周进展" eyebrow="WEEK 4"><div className="proto-learning-score"><strong>78</strong><span>本周完成度</span></div><div className="proto-sparkbars">{[48,72,54,86,68,92,40].map((v,i)=><i key={i} style={{height:`${v}%`}} />)}</div><button className="proto-text-btn" onClick={onOpenProject} type="button">打开学习项目 <IconArrowRight /></button></Section><Section title="能力地图" eyebrow="SKILL MAP"><div className="proto-skill-list">{[["日常口语",68],["学术阅读",74],["学术写作",52],["听力理解",61]].map(([name,value])=><div key={name}><span>{name}</span><Progress value={value} /><strong>{value}%</strong></div>)}</div></Section><Section title="近期错误" eyebrow="REVIEW QUEUE"><div className="proto-error-list"><div><Badge tone="amber">表达</Badge><p><strong>on the other hand</strong><small>对比关系使用不自然 · 需复习</small></p></div><div><Badge tone="blue">发音</Badge><p><strong>methodology</strong><small>重音位置 · 再练 2 次</small></p></div></div></Section></div> : <LearningEmpty track={track} />}</>;
}

function LearningEmpty({ track }) {
  return <div className="proto-learning-empty"><span><IconSchool /></span><h2>建立“{track}”学习方向</h2><p>复用目标、知识地图、资源、计划、实践、反馈与评估模型。</p><div><button type="button">使用推荐模板</button><button type="button">自定义方向</button></div></div>;
}

function PlanningPage({ onToast }) {
  const [habits, setHabits] = useState([true,true,false,true]);
  return <div className="proto-grid proto-grid--planning"><Section title="本季度目标" eyebrow="Q3 GOALS" className="proto-panel--wide"><div className="proto-goal-list">{[["完成个人 AI 助手 MVP","4 个关联项目",62],["形成博士研究可投稿结果","1 个研究项目",48],["提升学术英语表达","1 个学习项目",33]].map(([title,meta,value])=><button key={title} type="button"><span className="proto-goal-icon"><IconTargetArrow /></span><div><strong>{title}</strong><small>{meta}</small><Progress value={value} /></div><em>{value}%</em><IconChevronRight /></button>)}</div></Section><Section title="今日总结" eyebrow="DAILY REVIEW"><textarea aria-label="今日收获" placeholder="今天最重要的进展是什么？" /><div className="proto-review-prompts"><button type="button">完成了什么</button><button type="button">主要阻塞</button><button type="button">明日第一步</button></div><MiniAction icon={IconCheck} label="保存今日总结" onClick={()=>onToast("今日总结已保存，并生成 1 条经验候选")} primary /></Section><Section title="习惯与作息" eyebrow="LOW-SENSITIVITY TRACKING"><div className="proto-habits">{[["深度工作",IconBrain],["英语练习",IconLanguage],["健身 30 分钟",IconHeartRateMonitor],["23:30 前休息",IconClock]].map(([name,Icon],i)=><button className={habits[i]?"is-done":""} key={name} onClick={()=>setHabits(items=>items.map((v,n)=>n===i?!v:v))} type="button"><Icon /><span>{name}</span>{habits[i]?<IconCheck />:<IconCircle />}</button>)}</div></Section><Section title="本周时间去向" eyebrow="TIME ALLOCATION"><div className="proto-time-chart"><span style={{"--size":"38%"}}>科研 38%</span><span style={{"--size":"28%"}}>项目 28%</span><span style={{"--size":"18%"}}>学习 18%</span><span style={{"--size":"16%"}}>其他 16%</span></div><p className="proto-caption">科研时间符合计划；项目沟通比上周增加 6%。</p></Section></div>;
}

function RuntimePage({ onToast }) {
  const runtimes = [
    { name: "Native RAG", role: "轻量问答", status: "可用", tone: "green", detail: "单步检索与带引用回答" },
    { name: "DeepSeek Harness", role: "研究执行器", status: "隔离 POC", tone: "blue", detail: "独立进程 · 白名单工具 · 只读起步" },
    { name: "Hermes Agent", role: "移动网关 / 备选执行器", status: "候选，未连接", tone: "amber", detail: "只评估消息入口、对照任务与技能候选" },
  ];
  const runs = [
    ["科研证据审计：Agent 失败恢复", "Harness · 研究只读", "等待确认", "62%"],
    ["今日项目阻塞汇总", "Native RAG · 全局授权", "已完成", "100%"],
    ["飞书移动闭环验证", "Hermes · 候选 POC", "未开始", "0%"],
  ];
  return <>
    <section className="proto-runtime-callout">
      <div><span className="proto-eyebrow proto-eyebrow--light">LOOSELY COUPLED BY DESIGN</span><h2>产品真源与执行引擎分开。</h2><p>Workbench 持有项目、知识、权限与审批；运行时只拿本次任务需要的最小上下文。</p></div>
      <Badge tone="blue">一个任务 · 一个主运行时</Badge>
    </section>
    <div className="proto-runtime-flow" aria-label="Agent 运行时松耦合链路">
      {["Workbench 控制面", "Runtime Gateway", "Adapter 契约", "可替换执行器"].map((item,index)=><div key={item}><span>{index+1}</span><strong>{item}</strong><small>{["业务与知识真源","路由与统一事件","审批、取消、健康","Native / Harness / Hermes"][index]}</small>{index<3?<IconArrowRight />:null}</div>)}
    </div>
    <div className="proto-runtime-grid">
      <Section title="运行时状态" eyebrow="RUNTIME REGISTRY" className="proto-panel--wide">
        <div className="proto-runtime-cards">{runtimes.map(runtime=><article key={runtime.name}><div><span className={`proto-status-dot proto-status-dot--${runtime.tone}`} /><Badge tone={runtime.tone === "green" ? "green" : runtime.tone === "amber" ? "amber" : "blue"}>{runtime.status}</Badge></div><h3>{runtime.name}</h3><strong>{runtime.role}</strong><p>{runtime.detail}</p><button onClick={()=>onToast(runtime.name === "Hermes Agent" ? "Hermes 仍为候选：先完成飞书移动闭环评估" : `已打开 ${runtime.name} 能力说明`)} type="button">查看边界 <IconChevronRight /></button></article>)}</div>
      </Section>
      <Section title="当前运行" eyebrow="RUN ACTIVITY"><div className="proto-runtime-runs">{runs.map(([title,meta,status,progress])=><article key={title}><span className="proto-runtime-run__icon"><IconBolt /></span><div><strong>{title}</strong><small>{meta}</small><Progress value={Number.parseInt(progress,10)} /></div><span><Badge tone={status === "等待确认" ? "amber" : status === "已完成" ? "green" : "neutral"}>{status}</Badge><em>{progress}</em></span></article>)}</div></Section>
      <Section title="安全护栏" eyebrow="GUARDRAILS"><div className="proto-runtime-guards">{[["数据范围","2 个项目 · 公司空间已排除",IconDatabase],["工具权限","只读检索 + 草稿生成",IconSettings],["执行隔离","独立进程 · 沙箱策略待验收",IconNetwork],["长期记忆","仅生成候选，禁止自动双写",IconBrain]].map(([title,desc,Icon])=><div key={title}><span><Icon /></span><p><strong>{title}</strong><small>{desc}</small></p><IconCheck /></div>)}</div></Section>
      <Section title="Hermes 实际作用评估" eyebrow="OPTIONAL BRANCH" className="proto-panel--wide"><div className="proto-hermes-eval">{[["移动消息网关","高价值候选","飞书/企业微信会话、审批与投递"],["备选 Agent Runtime","中价值候选","仅在专项任务对照胜出时保留"],["技能自学习","谨慎试验","先成为候选技能，经评测后再发布"],["第二套个人记忆","不采用","个人上下文知识库保持唯一真源"]].map(([title,status,desc],index)=><article key={title}><span>{index+1}</span><div><strong>{title}</strong><small>{desc}</small></div><Badge tone={index===0?"blue":index===3?"amber":"neutral"}>{status}</Badge></article>)}</div></Section>
    </div>
  </>;
}

function AssistantPanel({ open, onClose, project }) {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState(false);
  const contextLabel = project ? project.name : "全部授权上下文";
  return <aside className={`proto-assistant${open ? " is-open" : ""}`} aria-hidden={!open}><header><div><span className="proto-assistant__mark"><IconSparkles /></span><span><strong>AI 助手</strong><small>权限感知上下文</small></span></div><button aria-label="关闭 AI 助手" className="proto-icon-btn" onClick={onClose} type="button"><IconX /></button></header><div className="proto-assistant__runtime"><span><IconBolt />研究执行器</span><Badge tone="blue">Harness · 隔离 POC</Badge></div><div className="proto-assistant__scope"><span>当前范围</span><button type="button"><IconDatabase />{contextLabel}<IconChevronRight /></button></div><div className="proto-assistant__body">{!asked ? <><div className="proto-assistant__welcome"><span><IconBrain /></span><h3>今天想推进什么？</h3><p>我会先显示使用的项目、来源和权限范围，再给出结论。</p></div><div className="proto-suggestions">{["汇总所有项目的阻塞项","这个研究结论有哪些证据？","为今天剩余时间安排优先级"].map(item=><button key={item} onClick={()=>setQuery(item)} type="button">{item}<IconArrowRight /></button>)}</div></> : <div className="proto-answer"><Badge tone="blue">带来源回答</Badge><h3>建议先处理公司空间模型边界，再完成项目详情交互。</h3><p>该阻塞同时影响“个人 AI 助手建设”和“Agent 可靠性研究”。页面原型可继续并行，不依赖模型策略。</p><ol><li><span>[1]</span>项目讨论：公司受限空间允许使用哪些模型</li><li><span>[2]</span>产品 Spec：上下文权限模型</li><li><span>[3]</span>项目任务：完成项目详情页原型</li></ol><div className="proto-answer__actions"><button type="button">转为任务</button><button type="button">保存为知识</button></div></div>}</div><form className="proto-composer" onSubmit={(e)=>{e.preventDefault();if(query.trim())setAsked(true);}}><textarea aria-label="向 AI 提问" onChange={e=>setQuery(e.target.value)} placeholder="向全部授权上下文提问…" value={query} /><div><span><button aria-label="添加附件" type="button"><IconPaperclip /></button><button aria-label="语音输入" type="button"><IconMicrophone /></button></span><button aria-label="发送" disabled={!query.trim()} type="submit"><IconSend /></button></div></form></aside>;
}

function SearchDialog({ open, onClose, onNavigate }) {
  const [query, setQuery] = useState("");
  if (!open) return null;
  const results = query ? [["项目","个人 AI 助手建设","项目工作台"],["决策","专业工作台复用统一项目对象","个人 AI 助手建设"],["知识","上下文范围解释","个人上下文知识库"],["学习","学术英语提升计划","学习提升"]] : [];
  return <div className="proto-modal-layer"><button aria-label="关闭搜索" className="proto-modal-backdrop" onClick={onClose} type="button" /><section className="proto-search-modal"><header><IconSearch /><input autoFocus onChange={e=>setQuery(e.target.value)} placeholder="搜索全部项目、知识、讨论和任务…" value={query} /><kbd>ESC</kbd></header>{results.length ? <div className="proto-search-results"><span>全部授权上下文 · {results.length} 个结果</span>{results.map(([type,title,source],i)=><button key={title} onClick={()=>onNavigate(i===0?"projects":i===3?"learning":"context")} type="button"><span className="proto-search-result__icon">{type.slice(0,1)}</span><span><strong>{title}</strong><small>{type} · {source} · 为什么命中：标题与关系</small></span><IconArrowRight /></button>)}</div> : <div className="proto-search-empty"><IconCommand /><p>输入关键词，或搜索“本周所有项目的阻塞”</p><small>支持全文、语义、关系和项目范围检索</small></div>}</section></div>;
}

function CaptureDialog({ open, onClose, onSave }) {
  const [type, setType] = useState("灵感");
  if (!open) return null;
  return <div className="proto-modal-layer"><button aria-label="关闭捕获" className="proto-modal-backdrop" onClick={onClose} type="button" /><section className="proto-dialog"><header><div><span className="proto-eyebrow">QUICK CAPTURE</span><h2>快速捕获</h2></div><button aria-label="关闭" className="proto-icon-btn" onClick={onClose} type="button"><IconX /></button></header><div className="proto-type-grid">{[["灵感",IconBolt],["文档",IconFileText],["链接",IconLink],["任务",IconListCheck],["语音",IconMicrophone]].map(([item,Icon])=><button className={type===item?"is-active":""} key={item} onClick={()=>setType(item)} type="button"><Icon />{item}</button>)}</div><label className="proto-field"><span>内容</span><textarea autoFocus placeholder="记录想法、粘贴链接或描述下一步…" /></label><label className="proto-field"><span>关联项目（可稍后设置）</span><select defaultValue=""><option value="">通用收件箱</option><option>个人 AI 助手建设</option><option>Agent 可靠性研究</option><option>12 周学术英语提升</option></select></label><footer><button onClick={onClose} type="button">取消</button><button className="is-primary" onClick={onSave} type="button">保存到收件箱</button></footer></section></div>;
}

function NewProjectDialog({ open, onClose, onCreate }) {
  const [template, setTemplate] = useState("空白项目");
  const [name, setName] = useState("");
  if (!open) return null;
  const templates = [["空白项目",IconFolders],["科研项目",IconMicroscope],["AI 应用",IconRobot],["学习提升",IconSchool]];
  const create = () => {
    if (!name.trim()) return;
    onCreate({ id:`project-${Date.now()}`,name:name.trim(),type:template,stage:"刚刚建立",progress:4,tone:"blue",next:"明确项目目标与成功标准",due:"待设置",docs:0,knowledge:0,discussions:0,tasks:1 });
    setName("");
  };
  return <div className="proto-modal-layer"><button aria-label="关闭新建项目" className="proto-modal-backdrop" onClick={onClose} type="button" /><section className="proto-dialog proto-dialog--wide"><header><div><span className="proto-eyebrow">NEW PROJECT</span><h2>建立新项目</h2></div><button aria-label="关闭" className="proto-icon-btn" onClick={onClose} type="button"><IconX /></button></header><div className="proto-template-grid">{templates.map(([item,Icon])=><button className={template===item?"is-active":""} key={item} onClick={()=>setTemplate(item)} type="button"><span><Icon /></span><strong>{item}</strong><small>{item==="科研项目"?"文献、假设、实验、证据":item==="AI 应用"?"需求、原型、评测、决策":item==="学习提升"?"知识地图、计划、实践、评估":"文档、知识、讨论、任务"}</small></button>)}</div><label className="proto-field"><span>项目名称</span><input autoFocus onChange={e=>setName(e.target.value)} placeholder="例如：企业知识助手 MVP" value={name} /></label><footer><button onClick={onClose} type="button">取消</button><button className="is-primary" disabled={!name.trim()} onClick={create} type="button">建立项目空间</button></footer></section></div>;
}
