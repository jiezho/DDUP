import { useEffect, useMemo, useState } from "react";
import {
  IconCalendarCheck,
  IconCheck,
  IconPlayerPlay,
  IconRefresh,
  IconRotateClockwise,
  IconSparkles,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import { loadDaily, saveDailyPlan, saveDailyReview, transitionTask } from "../lib/projects-api";

const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const taskStatus = { inbox: "待梳理", planned: "已计划", in_progress: "进行中", blocked: "受阻", done: "已完成", cancelled: "已取消" };

function safeError(error) {
  if (error?.code === "VERSION_CONFLICT") return "内容已在其他操作中更新，请刷新后重试。";
  return error?.message || "今日服务暂时不可用。";
}

export function TodayPage() {
  const date = today();
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [focusIds, setFocusIds] = useState([]);
  const [review, setReview] = useState({ summary: "", wins: "", blockers: "", next_focus: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    setState((current) => ({ ...current, status: current.data ? "ready" : "loading", error: null }));
    try {
      const data = await loadDaily(date);
      setState({ status: "ready", data, error: null });
      setFocusIds(data.plan?.task_ids || []);
      setReview(data.review ? { summary: data.review.summary, wins: data.review.wins, blockers: data.review.blockers, next_focus: data.review.next_focus } : { summary: "", wins: "", blockers: "", next_focus: "" });
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error: safeError(error) }));
    }
  };

  useEffect(() => { void load(); }, [date]);

  const focusTasks = useMemo(
    () => focusIds.map((id) => state.data?.tasks.find((task) => task.id === id)).filter(Boolean),
    [focusIds, state.data],
  );

  const toggleFocus = (taskId) => {
    setFocusIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : current.length < 3 ? [...current, taskId] : current);
  };

  const persistFocus = async () => {
    setBusy(true); setNotice("");
    try {
      await saveDailyPlan(date, state.data.space.id, focusIds, state.data.plan?.version ?? null);
      setNotice("今日重点已保存；这里只引用项目任务，不复制任务状态。");
      await load();
    } catch (error) { setNotice(safeError(error)); } finally { setBusy(false); }
  };

  const runTask = async (task, action) => {
    setBusy(true); setNotice("");
    try {
      await transitionTask(task.id, task.version, action);
      setNotice("任务状态已同步回原项目。");
      await load();
    } catch (error) { setNotice(safeError(error)); } finally { setBusy(false); }
  };

  const persistReview = async (event) => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      await saveDailyReview(date, state.data.space.id, review, state.data.review?.version ?? null);
      setNotice("日终复盘已保存为你的明确记录，不由 AI 自动改写。");
      await load();
    } catch (error) { setNotice(safeError(error)); } finally { setBusy(false); }
  };

  return (
    <div className="page page--today">
      <PageHeader eyebrow="TODAY · LOCAL" title="今日" description={`${date} · 聚焦项目行动，完成后同步原任务；日终复盘只保存你的明确输入。`} />
      {notice ? <p aria-live="polite" className="today-notice">{notice}</p> : null}
      {state.status === "loading" ? <div className="today-state"><span className="project-spinner" />正在汇总今日行动…</div> : null}
      {state.status === "error" ? <div className="today-state"><p>{state.error}</p><button onClick={load} type="button"><IconRefresh />重试</button></div> : null}
      {state.status === "ready" ? (
        <>
          <section aria-label="今日重点" className="today-focus">
            <header><div><span>TOP 1–3</span><h2>今日重点</h2><p>从项目任务中选择最多 3 项。计划只保存引用，任务仍由项目工作台管理。</p></div><button disabled={busy} onClick={persistFocus} type="button"><IconCalendarCheck />保存今日重点</button></header>
            <div className="today-focus__selected">{focusTasks.length === 0 ? <p>尚未选择重点。</p> : focusTasks.map((task, index) => <article key={task.id}><span>{index + 1}</span><div><strong>{task.title}</strong><small>{task.project_name} · {taskStatus[task.status]}</small></div></article>)}</div>
          </section>
          <div className="today-grid">
            <section aria-label="候选任务" className="today-tasks">
              <div className="today-section-head"><div><IconSparkles /><strong>项目行动</strong></div><span>{state.data.tasks.length}</span></div>
              {state.data.tasks.length === 0 ? <div className="today-empty">当前没有可执行项目任务。先在项目工作台建立任务。</div> : state.data.tasks.map((task) => <article className={`today-task today-task--${task.status}`} key={task.id}><label><input checked={focusIds.includes(task.id)} disabled={!focusIds.includes(task.id) && focusIds.length >= 3} onChange={() => toggleFocus(task.id)} type="checkbox" /><span className="sr-only">选择 {task.title} 为今日重点</span></label><div><span>{taskStatus[task.status]}</span><strong>{task.title}</strong><small>{task.project_name}{task.due_date ? ` · ${task.due_date}` : " · 无截止日期"}</small></div><div className="today-task__actions">{task.status === "inbox" || task.status === "planned" ? <button disabled={busy} onClick={() => runTask(task, "start")} type="button"><IconPlayerPlay />开始</button> : null}{task.status === "in_progress" ? <button disabled={busy} onClick={() => runTask(task, "complete")} type="button"><IconCheck />完成</button> : null}{task.status === "blocked" ? <button disabled={busy} onClick={() => runTask(task, "start")} type="button"><IconRotateClockwise />解除受阻</button> : null}{task.status === "done" ? <button disabled={busy} onClick={() => runTask(task, "reopen")} type="button"><IconRotateClockwise />重新打开</button> : null}</div></article>)}
            </section>
            <section aria-label="日终复盘" className="today-review">
              <div className="today-section-head"><div><IconCalendarCheck /><strong>日终复盘</strong></div><span>{state.data.review ? `v${state.data.review.version}` : "未保存"}</span></div>
              <form aria-label="保存日终复盘" onSubmit={persistReview}><label><span>今日总结</span><textarea maxLength="10000" onChange={(event) => setReview({ ...review, summary: event.target.value })} rows="3" value={review.summary} /></label><label><span>完成与收获</span><textarea maxLength="10000" onChange={(event) => setReview({ ...review, wins: event.target.value })} rows="3" value={review.wins} /></label><label><span>阻塞与原因</span><textarea maxLength="10000" onChange={(event) => setReview({ ...review, blockers: event.target.value })} rows="3" value={review.blockers} /></label><label><span>明日第一步</span><textarea maxLength="10000" onChange={(event) => setReview({ ...review, next_focus: event.target.value })} rows="3" value={review.next_focus} /></label><button disabled={busy} type="submit"><IconCheck />保存复盘</button></form>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
