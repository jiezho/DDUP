import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { IconSearch } from "@tabler/icons-react";
import { searchVault } from "../lib/api";
import { layerLabel } from "../lib/format";
import { searchCurrentContext } from "../lib/projects-api";

const localWorkbench = import.meta.env.VITE_WORKBENCH_HOSTED !== "true";
const contextTypeLabel = { project: "项目", task: "任务", capture: "捕获", document: "来源" };

export function SearchPalette({ open, onClose, onOpenDocument, onOpenContextResult }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setResults([]);
    setActiveIndex(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setActiveIndex(0);

    const timer = window.setTimeout(async () => {
      try {
        if (localWorkbench && query.trim().length < 2) {
          if (!cancelled) setResults([]);
          return;
        }
        const response = localWorkbench
          ? await searchCurrentContext(query.trim(), { limit: 12 })
          : await searchVault(query);
        if (!cancelled) setResults(localWorkbench ? response.items ?? [] : response.data?.items ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Enter" && results[activeIndex]) {
        event.preventDefault();
        if (localWorkbench) onOpenContextResult(results[activeIndex], query);
        else onOpenDocument(results[activeIndex]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, onOpenDocument, onOpenContextResult, query, results, activeIndex]);

  if (!open) return null;

  const showEmpty = !loading && results.length === 0;

  return (
    <>
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        aria-label="关闭搜索"
        className="palette-backdrop"
        onClick={onClose}
        type="button"
      />
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
      >
        <div className="palette__input-row">
          <IconSearch aria-hidden="true" />
          <input
            ref={inputRef}
            className="palette__input"
            type="text"
            placeholder={localWorkbench ? "搜索项目、任务、捕获与来源文档" : "搜索素材、Wiki、脚本与档案"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索输入框"
          />
        </div>

        <div className="palette__results">
          {showEmpty && (
            <div className="palette__empty">
              {query
                ? `没有匹配「${query}」的内容`
                : localWorkbench ? "输入至少两个字符，搜索当前授权上下文" : "输入关键词，搜索素材、Wiki、脚本与档案"}
            </div>
          )}

          {results.map((item, index) => (
            <button
              key={localWorkbench ? `${item.object_type}-${item.object_id}` : item.id}
              className={`palette__item${index === activeIndex ? " palette__item--active" : ""}`}
              onClick={() => localWorkbench ? onOpenContextResult(item, query) : onOpenDocument(item)}
              type="button"
            >
              <span className="badge">{localWorkbench ? contextTypeLabel[item.object_type] : layerLabel(item.layer)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="palette__item-title">{item.title}</div>
                {item.excerpt && (
                  <div className="palette__item-snippet">{item.excerpt}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
