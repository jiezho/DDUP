import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  IconBrandTiktok,
  IconBrain,
  IconBooks,
  IconBulb,
  IconBriefcase2,
  IconChartBar,
  IconClipboardList,
  IconCommand,
  IconHome,
  IconLibrary,
  IconInbox,
  IconMenu2,
  IconRadar2,
  IconRobot,
  IconSearch,
  IconSettings,
  IconSocial,
  IconStack2,
  IconTopologyStar3,
  IconX,
} from "@tabler/icons-react";

const localWorkbench = import.meta.env.VITE_WORKBENCH_HOSTED !== "true";

const primaryNavigation = [
  { to: "/", label: localWorkbench ? "今日" : "总览", icon: IconHome, end: true },
  ...(localWorkbench
    ? [{ to: "/projects", label: "项目工作台", icon: IconBriefcase2 }]
    : []),
  ...(localWorkbench
    ? [{ to: "/inbox", label: "通用收件箱", icon: IconInbox }]
    : []),
  ...(localWorkbench
    ? [{ to: "/context", label: "上下文知识库", icon: IconBrain }]
    : []),
  ...(localWorkbench
    ? [{ to: "/runtime", label: "AI 运行中心", icon: IconRobot }]
    : []),
  { to: "/graph", label: "知识星图", icon: IconTopologyStar3 },
  { to: "/wiki", label: "Wiki 层", icon: IconLibrary },
  { to: "/materials", label: "素材层", icon: IconStack2 },
  { to: "/books", label: "书架", icon: IconBooks },
  { to: "/daily-hot", label: "每日热点", icon: IconRadar2 },
  ...(localWorkbench
    ? [{ to: "/social-insights", label: "社媒洞察", icon: IconSocial }]
    : []),
  { to: "/topics", label: "灵感库", icon: IconBulb },
  { to: "/content", label: "内容中心", icon: IconClipboardList },
];

const mediaNavigation = [
  { to: "/douyin", label: "抖音数据", icon: IconBrandTiktok },
];

const mobileNavigation = [
  { to: "/", label: "今日", icon: IconHome, end: true },
  { to: "/projects", label: "项目", icon: IconBriefcase2 },
  { to: "/inbox", label: "捕获", icon: IconInbox },
  { to: "/runtime", label: "问 AI", icon: IconRobot },
  { to: "/context", label: "知识", icon: IconBrain },
];

export function AppShell({ children, onOpenSearch, sync }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  const [networkNotice, setNetworkNotice] = useState(() =>
    typeof navigator !== "undefined" && !navigator.onLine
      ? "当前离线：可继续浏览已加载页面和编辑本机草稿，提交操作会等待你恢复网络后手动重试。"
      : "",
  );
  const asideRef = useRef(null);
  const menuButtonRef = useRef(null);
  const mainRef = useRef(null);
  const previousPathRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setMobileLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...asideRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hidden && element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    asideRef.current?.querySelector('a[href], button:not([disabled])')?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
    if (previousPathRef.current && previousPathRef.current !== location.pathname) {
      mainRef.current?.focus();
    }
    previousPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    let clearRecovered;
    const offline = () => setNetworkNotice("当前离线：可继续浏览已加载页面和编辑本机草稿，提交操作会等待你恢复网络后手动重试。");
    const online = () => {
      setNetworkNotice("网络已恢复。请检查本机草稿后手动提交，系统不会自动重放写操作。");
      clearRecovered = window.setTimeout(() => setNetworkNotice(""), 6000);
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.clearTimeout(clearRecovered);
    };
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      {networkNotice ? <div aria-live="polite" className="network-notice" role="status">{networkNotice}</div> : null}
      <header className="mobile-header">
        <button
          aria-controls="workbench-navigation"
          aria-expanded={mobileOpen}
          aria-label="打开导航"
          className="icon-button"
          onClick={() => setMobileOpen(true)}
          ref={menuButtonRef}
          type="button"
        >
          <IconMenu2 aria-hidden="true" />
        </button>
        <span className="mobile-header__brand">
          <img alt="" aria-hidden="true" src="/workbench-mark.svg" />
          <span>DDUP</span>
        </span>
        <button
          aria-label="搜索"
          className="icon-button"
          onClick={onOpenSearch}
          type="button"
        >
          <IconSearch aria-hidden="true" />
        </button>
      </header>

      {mobileOpen ? (
        <button
          aria-label="关闭导航"
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        aria-hidden={mobileLayout && !mobileOpen ? "true" : undefined}
        aria-label={mobileOpen ? "完整导航" : undefined}
        aria-modal={mobileOpen ? "true" : undefined}
        className={`sidebar${mobileOpen ? " sidebar--open" : ""}`}
        id="workbench-navigation"
        inert={mobileLayout && !mobileOpen ? "" : undefined}
        ref={asideRef}
        role={mobileOpen ? "dialog" : undefined}
      >
        <div className="sidebar__top">
          <div className="sidebar__brand-row">
            <NavLink className="sidebar__brand" onClick={() => setMobileOpen(false)} to="/">
              <img alt="" aria-hidden="true" src="/workbench-mark.svg" />
              <span>DDUP</span>
            </NavLink>
            <button
              aria-label="关闭导航"
              className="icon-button sidebar__close"
              onClick={() => setMobileOpen(false)}
              type="button"
            >
              <IconX aria-hidden="true" />
            </button>
          </div>
          <div className="sidebar__tag">{"Good Good Study  Day Day Up"}</div>

          <nav aria-label="主要导航" className="sidebar__nav">
            {primaryNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  className={({ isActive }) =>
                    `sidebar__nav-item${isActive ? " sidebar__nav-item--active" : ""}`
                  }
                  end={item.end}
                  key={item.to}
                  onClick={() => setMobileOpen(false)}
                  to={item.to}
                >
                  <Icon aria-hidden="true" className="sidebar__nav-icon" stroke={1.7} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
            <div className="sidebar__nav-group">
              <div className="sidebar__nav-group-label">
                <IconChartBar aria-hidden="true" className="sidebar__nav-icon" stroke={1.7} />
                <span>媒体数据</span>
              </div>
              <div className="sidebar__nav-children">
                {mediaNavigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      className={({ isActive }) =>
                        `sidebar__nav-item sidebar__nav-item--child${isActive ? " sidebar__nav-item--active" : ""}`
                      }
                      key={item.to}
                      onClick={() => setMobileOpen(false)}
                      to={item.to}
                    >
                      <Icon aria-hidden="true" className="sidebar__nav-icon" stroke={1.7} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>

        <div className="sidebar__bottom">
          <div className={`sidebar__sync sidebar__sync--${sync?.status || "connecting"}`}>
            <span aria-hidden="true" />
            <span>{sync?.status === "watching" ? "文件已实时同步" : sync?.status === "rebuilding" || sync?.status === "pending" ? "正在同步文件" : "正在连接文件同步"}</span>
          </div>
          <NavLink
            className="sidebar__settings"
            onClick={() => setMobileOpen(false)}
            to="/system"
          >
            <IconSettings aria-hidden="true" stroke={1.6} />
            <span>系统状态</span>
          </NavLink>
        </div>
      </aside>

      <main className="app-main" id="main-content" ref={mainRef} tabIndex="-1">{children}</main>

      {localWorkbench ? (
        <nav aria-label="移动端主要导航" className="mobile-bottom-nav">
          {mobileNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                className={({ isActive }) => `mobile-bottom-nav__item${isActive ? " mobile-bottom-nav__item--active" : ""}`}
                end={item.end}
                key={item.to}
                to={item.to}
              >
                <Icon aria-hidden="true" stroke={1.8} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      ) : null}

      <button
        aria-label="打开全局搜索"
        className="floating-search"
        onClick={onOpenSearch}
        type="button"
      >
        <IconSearch aria-hidden="true" />
        <span>搜索知识库</span>
        <span className="floating-search__shortcut">
          <IconCommand aria-hidden="true" />K
        </span>
      </button>
    </div>
  );
}
