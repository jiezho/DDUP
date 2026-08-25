import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  IconBinaryTree,
  IconBriefcase2,
  IconFileText,
  IconFilter,
  IconInbox,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconUpload,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import { importMarkdownSource, loadContextLibrary, searchContext } from "../lib/projects-api";

const typeLabels = { project: "项目", task: "任务", capture: "捕获", document: "来源文档" };
const typeIcons = { project: IconBriefcase2, task: IconBinaryTree, capture: IconInbox, document: IconFileText };

function safeError(error) {
  if (error?.status === 413) return "文件超过本地导入上限（1 MiB）。";
  if (error?.code === "IDEMPOTENCY_CONFLICT") return "本次导入请求已变化，请重新选择文件后再试。";
  return error?.message || "上下文服务暂时不可用。";
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "大小未知";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

export function ContextLibraryPage() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get("q") || "";
  const [library, setLibrary] = useState({ status: "loading", space: null, projects: [], sources: [], error: null });
  const [query, setQuery] = useState(initialQuery);
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchState, setSearchState] = useState({ status: "idle", items: [], scope: null, baseline: null, error: null });
  const [file, setFile] = useState(null);
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const activeProjects = useMemo(
    () => library.projects.filter((project) => !["completed", "archived"].includes(project.status)),
    [library.projects],
  );

  const load = async () => {
    setLibrary((current) => ({ ...current, status: current.space ? "ready" : "loading", error: null }));
    try {
      const data = await loadContextLibrary();
      setLibrary({ status: "ready", space: data.space, projects: data.projects, sources: data.sources, error: null });
      return data;
    } catch (error) {
      setLibrary((current) => ({ ...current, status: "error", error: safeError(error) }));
      return null;
    }
  };

  const runSearch = async (event, explicitQuery = query, loaded = library) => {
    event?.preventDefault?.();
    const normalized = explicitQuery.trim();
    if (normalized.length < 2 || !loaded.space) return;
    setSearchState((current) => ({ ...current, status: "loading", error: null }));
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("q", normalized);
      return next;
    }, { replace: true });
    try {
      const data = await searchContext({
        spaceId: loaded.space.id,
        query: normalized,
        projectId,
        types: type === "all" ? [] : [type],
        from,
        to,
      });
      setSearchState({ status: "ready", items: data.items, scope: data.scope, baseline: data.baseline, error: null });
    } catch (error) {
      setSearchState({ status: "error", items: [], scope: null, baseline: null, error: safeError(error) });
    }
  };

  useEffect(() => {
    void (async () => {
      const loaded = await load();
      if (loaded && initialQuery.trim().length >= 2) await runSearch(null, initialQuery, loaded);
    })();
  }, []);

  const submitSource = async (event) => {
    event.preventDefault();
    if (!file || !library.space) return;
    setBusy(true);
    setNotice("");
    try {
      const content = await file.text();
      const response = await importMarkdownSource({
        space_id: library.space.id,
        project_id: sourceProjectId || null,
        filename: file.name,
        ...(title.trim() ? { title: title.trim() } : {}),
        content,
      });
      setNotice(response.data.deduplicated
        ? "相同内容已存在；已返回原来源，不创建重复版本。"
        : "Markdown 已写入受控来源目录，并建立可追溯 SourceVersion 与全文索引。");
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page--context-library">
      <PageHeader
        eyebrow="CONTEXT LIBRARY · LOCAL"
        title="个人上下文知识库"
        description="融合当前授权空间中的项目、任务、捕获与受控来源文档。当前提供可追踪的本地全文检索，问答将在引用验证完成后开放。"
      />

      <p className="context-boundary"><IconShieldCheck />检索过滤在正文返回前执行；Markdown 原文保存在内容哈希路径，界面与 API 不暴露本地绝对路径。</p>

      <div className="context-top-grid">
        <section aria-label="导入 Markdown 来源" className="context-import-panel">
          <header><span>SOURCE INTAKE</span><h2>受控 Markdown 导入</h2><p>只接收你明确选择的 `.md/.markdown` 文件，最大 1 MiB；不抓取网页、不解析 XLSX、不自动成为知识结论。</p></header>
          <form aria-label="导入 Markdown 来源" onSubmit={submitSource}>
            <label className="context-file-field"><span>Markdown 文件</span><input accept=".md,.markdown,text/markdown" onChange={(event) => setFile(event.target.files?.[0] || null)} ref={fileRef} required type="file" /><small>{file ? `${file.name} · ${formatBytes(file.size)}` : "尚未选择文件"}</small></label>
            <label><span>标题覆盖（可选）</span><input maxLength="200" onChange={(event) => setTitle(event.target.value)} placeholder="默认使用一级标题或文件名" value={title} /></label>
            <label><span>关联项目（可选）</span><select onChange={(event) => setSourceProjectId(event.target.value)} value={sourceProjectId}><option value="">全局来源</option>{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <button disabled={busy || !file} type="submit"><IconUpload />导入并建立索引</button>
          </form>
          {notice ? <p aria-live="polite" className="context-notice">{notice}</p> : null}
        </section>

        <section aria-label="来源清单" className="context-source-panel">
          <header><div><span>TRACEABLE SOURCES</span><h2>已就绪来源</h2></div><strong>{library.sources.length}</strong></header>
          {library.status === "loading" ? <div className="context-state"><span className="project-spinner" />正在读取来源…</div> : null}
          {library.status === "error" ? <div className="context-state"><p>{library.error}</p><button onClick={load} type="button"><IconRefresh />重试</button></div> : null}
          {library.status === "ready" && !library.sources.length ? <div className="context-state"><IconFileText /><strong>尚无受控来源</strong><p>缺失保持缺失，不用演示数据填充。</p></div> : null}
          {library.sources.length ? <div className="context-source-list">{library.sources.map((source) => {
            const project = library.projects.find((item) => item.id === source.project_id);
            return <article key={source.id}><IconFileText /><div><strong>{source.title}</strong><span>{source.original_filename} · {formatBytes(source.byte_size)}</span><small>{project ? `项目：${project.name}` : "全局来源"} · v{source.current_version_number} · {source.content_sha256.slice(0, 10)}…</small></div></article>;
          })}</div> : null}
        </section>
      </div>

      <section aria-label="统一上下文检索" className="context-search-panel">
        <header><div><span>AUTHORIZED FULL-TEXT</span><h2>统一检索基线</h2></div>{searchState.baseline ? <small>{searchState.baseline.engine === "sqlite_fts5_trigram" ? "SQLite FTS5 · trigram" : "短查询 · 有界匹配"} · 无语义召回/重排</small> : null}</header>
        <form aria-label="统一上下文检索" onSubmit={runSearch}>
          <label className="context-query"><IconSearch /><span className="sr-only">检索关键词</span><input aria-label="检索关键词" minLength="2" onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、任务、捕获与来源文档…" required value={query} /></label>
          <label><span>项目范围</span><select onChange={(event) => setProjectId(event.target.value)} value={projectId}><option value="">全部授权项目</option>{library.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label><span>对象类型</span><select onChange={(event) => setType(event.target.value)} value={type}><option value="all">全部类型</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>开始日期</span><input onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label>
          <label><span>结束日期</span><input onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label>
          <button disabled={searchState.status === "loading" || query.trim().length < 2} type="submit"><IconFilter />执行检索</button>
        </form>

        {searchState.status === "idle" ? <div className="context-search-empty"><IconSearch /><strong>输入至少两个字符开始检索</strong><p>结果只来自当前会话可见空间，并显示命中类型、范围和定位方式。</p></div> : null}
        {searchState.status === "loading" ? <div className="context-search-empty"><span className="project-spinner" />正在检索授权内容…</div> : null}
        {searchState.status === "error" ? <div className="context-search-empty"><p>{searchState.error}</p></div> : null}
        {searchState.status === "ready" && !searchState.items.length ? <div className="context-search-empty"><IconSearch /><strong>没有授权范围内的匹配结果</strong><p>系统不会用相似演示内容填补空结果。</p></div> : null}
        {searchState.items.length ? <div className="context-results">{searchState.items.map((item) => {
          const Icon = typeIcons[item.object_type] || IconFileText;
          const project = library.projects.find((candidate) => candidate.id === item.project_id);
          return <article key={`${item.object_type}-${item.object_id}`}><span className={`context-result-icon context-result-icon--${item.object_type}`}><Icon /></span><div><div className="context-result-title"><span>{typeLabels[item.object_type]}</span><strong>{item.title}</strong></div><p>{item.excerpt}</p><small>{project ? `项目：${project.name}` : "全局范围"} · {item.match.strategy === "fts5_trigram" ? "全文命中" : "短查询匹配"}{item.locator.type === "char_range" ? ` · 原文字符 ${item.locator.start}–${item.locator.end}` : " · 对象定位"}</small></div></article>;
        })}</div> : null}
        {searchState.scope ? <footer><IconShieldCheck /><span>{searchState.scope.reason}</span><code>{searchState.scope.applied.project_id ? "项目范围" : "全空间范围"} · {searchState.scope.applied.types.map((item) => typeLabels[item]).join(" / ")}</code></footer> : null}
      </section>
    </div>
  );
}
