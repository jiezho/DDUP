import { useEffect, useMemo, useState } from "react";
import {
  IconArchive,
  IconArrowBackUp,
  IconCheck,
  IconExternalLink,
  IconLink,
  IconNotebook,
  IconRefresh,
  IconSend,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import { createCapture, loadCaptureInbox, transitionCapture } from "../lib/projects-api";

const statusLabels = { inbox: "待整理", processed: "已处理", archived: "已归档" };

function safeError(error) {
  if (error?.code === "VERSION_CONFLICT") return "条目已被更新，请刷新后重试。";
  return error?.message || "收件箱服务暂时不可用。";
}

export function CaptureInboxPage() {
  const [view, setView] = useState("inbox");
  const [state, setState] = useState({ status: "loading", space: null, projects: [], captures: [], error: null });
  const [kind, setKind] = useState("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async (status = view) => {
    setState((current) => ({ ...current, status: current.space ? "ready" : "loading", error: null }));
    try {
      const result = await loadCaptureInbox(status);
      setState({ status: "ready", space: result.space, projects: result.projects, captures: result.captures, error: null });
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error: safeError(error) }));
    }
  };

  useEffect(() => { void load(view); }, [view]);

  const activeProjects = useMemo(
    () => state.projects.filter((project) => !["completed", "archived"].includes(project.status)),
    [state.projects],
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await createCapture({
        kind,
        space_id: state.space.id,
        project_id: projectId || null,
        title,
        ...(kind === "text" ? { body } : { canonical_uri: url }),
      });
      setTitle("");
      setBody("");
      setUrl("");
      setNotice("已进入本地收件箱；不会自动调用 AI、抓取网页或写入长期知识。");
      if (view !== "inbox") setView("inbox");
      else await load("inbox");
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (capture, action) => {
    setBusy(true);
    setNotice("");
    try {
      await transitionCapture(capture.id, capture.version, action);
      setNotice(action === "process" ? "条目已标记为处理完成。" : action === "archive" ? "条目已归档。" : "条目已重新放回待整理列表。");
      await load(view);
    } catch (error) {
      setNotice(safeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page--capture">
      <PageHeader eyebrow="QUICK CAPTURE" title="通用收件箱" description="先捕获，再整理。首版只接收虚构文本与 http/https 链接，不读取文件、不抓取网页、不自动进入长期知识。" />
      <section aria-label="快速捕获" className="capture-composer">
        <div className="capture-composer__intro"><span><IconSend />本地快速捕获</span><strong>把临时信息放到可追踪的入口</strong><p>条目可关联项目；内容仍保持“待整理”，需要后续人工处理。</p></div>
        <form onSubmit={submit}>
          <div className="capture-kind" role="group" aria-label="捕获类型"><button aria-pressed={kind === "text"} onClick={() => setKind("text")} type="button"><IconNotebook />文本</button><button aria-pressed={kind === "link"} onClick={() => setKind("link")} type="button"><IconLink />链接</button></div>
          <label><span>标题</span><input maxLength="200" onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
          {kind === "text" ? <label className="is-wide"><span>内容</span><textarea maxLength="20000" onChange={(event) => setBody(event.target.value)} required rows="4" value={body} /></label> : <label className="is-wide"><span>http/https 链接</span><input onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/..." required type="url" value={url} /></label>}
          <label><span>关联项目（可选）</span><select onChange={(event) => setProjectId(event.target.value)} value={projectId}><option value="">暂不关联</option>{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <button className="capture-submit" disabled={busy || !title.trim() || (kind === "text" ? !body.trim() : !url.trim())} type="submit"><IconSend />放入收件箱</button>
        </form>
      </section>

      {notice ? <p aria-live="polite" className="capture-notice">{notice}</p> : null}
      <section aria-label="收件箱条目" className="capture-inbox">
        <header><div><span>INBOX QUEUE</span><h2>捕获条目</h2></div><div className="capture-tabs" role="tablist" aria-label="收件箱状态">{Object.entries(statusLabels).map(([value, label]) => <button aria-selected={view === value} key={value} onClick={() => setView(value)} role="tab" type="button">{label}</button>)}</div></header>
        {state.status === "loading" ? <div className="capture-state"><span className="project-spinner" />正在读取本地收件箱…</div> : null}
        {state.status === "error" ? <div className="capture-state"><p>{state.error}</p><button onClick={() => load(view)} type="button"><IconRefresh />重试</button></div> : null}
        {state.status === "ready" && state.captures.length === 0 ? <div className="capture-state"><IconNotebook /><strong>这里还没有{statusLabels[view]}条目</strong><p>快速捕获只保存你明确提交的内容，不用模拟数据填充空状态。</p></div> : null}
        {state.status === "ready" && state.captures.length ? <div className="capture-list">{state.captures.map((capture) => {
          const project = state.projects.find((item) => item.id === capture.project_id);
          return <article key={capture.id}><div className="capture-card__type">{capture.kind === "text" ? <IconNotebook /> : <IconLink />}<span>{capture.kind === "text" ? "文本" : "链接"}</span></div><div className="capture-card__body"><strong>{capture.title}</strong>{capture.kind === "text" ? <p>{capture.body}</p> : <a href={capture.canonical_uri} rel="noreferrer" target="_blank">{capture.canonical_uri}<IconExternalLink /></a>}<small>{project ? `项目：${project.name}` : "暂未关联项目"} · {new Date(capture.captured_at).toLocaleString("zh-CN")}</small></div><div className="capture-card__actions">{view === "inbox" ? <><button disabled={busy} onClick={() => runAction(capture, "process")} type="button"><IconCheck />完成整理</button><button disabled={busy} onClick={() => runAction(capture, "archive")} type="button"><IconArchive />归档</button></> : <button disabled={busy} onClick={() => runAction(capture, "reopen")} type="button"><IconArrowBackUp />放回待整理</button>}</div></article>;
        })}</div> : null}
      </section>
    </div>
  );
}
