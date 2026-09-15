import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useVaultSync } from "./hooks/useVaultSync";

const lazyNamed = (loader, exportName) => lazy(() => (
  loader().then((module) => ({ default: module[exportName] }))
));

const CollectionPage = lazyNamed(() => import("./pages/CollectionPage"), "CollectionPage");
const DouyinPage = lazyNamed(() => import("./pages/DouyinPage"), "DouyinPage");
const DailyHotPage = lazyNamed(() => import("./pages/DailyHotPage"), "DailyHotPage");
const GraphPage = lazyNamed(() => import("./pages/GraphPage"), "GraphPage");
const MaterialsPage = lazyNamed(() => import("./pages/MaterialsPage"), "MaterialsPage");
const BooksPage = lazyNamed(() => import("./pages/BooksPage"), "BooksPage");
const OverviewPage = lazyNamed(() => import("./pages/OverviewPage"), "OverviewPage");
const SystemPage = lazyNamed(() => import("./pages/SystemPage"), "SystemPage");
const TopicsPage = lazyNamed(() => import("./pages/TopicsPage"), "TopicsPage");
const socialInsightsLoader = () => import("./pages/SocialInsightsPage");
const SocialInsightsPage = lazyNamed(socialInsightsLoader, "SocialInsightsPage");
const SocialTrendDetailPage = lazyNamed(socialInsightsLoader, "SocialTrendDetailPage");
const PrototypeApp = lazyNamed(() => import("./prototype/PrototypeApp"), "PrototypeApp");
const ProjectsPage = lazyNamed(() => import("./pages/ProjectsPage"), "ProjectsPage");
const CaptureInboxPage = lazyNamed(() => import("./pages/CaptureInboxPage"), "CaptureInboxPage");
const TodayPage = lazyNamed(() => import("./pages/TodayPage"), "TodayPage");
const ContextLibraryPage = lazyNamed(() => import("./pages/ContextLibraryPage"), "ContextLibraryPage");
const RuntimePage = lazyNamed(() => import("./pages/RuntimePage"), "RuntimePage");
const ProfessionalPage = lazyNamed(() => import("./pages/ProfessionalPage"), "ProfessionalPage");
const GrowthPage = lazyNamed(() => import("./pages/GrowthPage"), "GrowthPage");
const SearchPalette = lazyNamed(() => import("./components/SearchPalette"), "SearchPalette");
const DocumentDrawer = lazyNamed(() => import("./components/DocumentDrawer"), "DocumentDrawer");

const localWorkbench = import.meta.env.VITE_WORKBENCH_HOSTED !== "true";

function RouteLoading() {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <span className="project-spinner" aria-hidden="true" />
      正在加载页面…
    </div>
  );
}

export function App() {
  const location = useLocation();

  if (location.pathname.startsWith("/prototype")) {
    return (
      <Suspense fallback={<RouteLoading />}>
        <PrototypeApp />
      </Suspense>
    );
  }

  return <WorkbenchApp />;
}

function WorkbenchApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [readerContext, setReaderContext] = useState(null);
  const vaultSync = useVaultSync(location.pathname);
  const routeRevision =
    location.pathname.startsWith("/social-insights")
    ? location.pathname
    : `${location.pathname}:${vaultSync.revision}`;

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
    setSelectedDocumentId(null);
    setReaderContext(null);
  }, [location.pathname]);

  const openDocument = useCallback((documentOrId) => {
    const id =
      typeof documentOrId === "string"
        ? documentOrId
        : documentOrId?.id ?? documentOrId?.relativePath;
    if (id) {
      setSelectedDocumentId(id);
      setReaderContext(
        typeof documentOrId === "object" ? documentOrId.readerContext || null : null,
      );
    }
  }, []);

  const appContext = useMemo(
    () => ({
      navigate,
      openDocument,
      openSearch: () => setSearchOpen(true),
    }),
    [navigate, openDocument],
  );

  return (
    <>
      <AppShell onOpenSearch={appContext.openSearch} sync={vaultSync}>
        <Suspense fallback={<RouteLoading />}>
          <Routes key={routeRevision}>
          <Route path="/" element={localWorkbench ? <TodayPage /> : <OverviewPage onOpenDocument={openDocument} />} />
          <Route path="/graph" element={<GraphPage onOpenDocument={openDocument} />} />
          <Route
            path="/wiki"
            element={
              <CollectionPage
                kind="wiki"
                eyebrow="KNOWLEDGE LAYER"
                title="Wiki 层"
                description="结构化知识：来源拆解、概念、框架、诊断与待验证问题。星图的线性视图。"
                onOpenDocument={openDocument}
              />
            }
          />
          <Route
            path="/materials"
            element={<MaterialsPage onOpenDocument={openDocument} />}
          />
          <Route path="/books" element={<BooksPage onOpenDocument={openDocument} />} />
          <Route path="/books/:bookId" element={<BooksPage onOpenDocument={openDocument} />} />
          <Route path="/daily-hot" element={<DailyHotPage />} />
          {localWorkbench ? <Route path="/projects" element={<ProjectsPage />} /> : null}
          {localWorkbench ? <Route path="/inbox" element={<CaptureInboxPage />} /> : null}
          {localWorkbench ? <Route path="/context" element={<ContextLibraryPage />} /> : null}
          {localWorkbench ? <Route path="/runtime" element={<RuntimePage />} /> : null}
          {localWorkbench ? <Route path="/professional" element={<ProfessionalPage />} /> : null}
          {localWorkbench ? <Route path="/growth" element={<GrowthPage />} /> : null}
          {localWorkbench ? (
            <Route
              path="/social-insights"
              element={
                <SocialInsightsPage
                  onOpenDocument={openDocument}
                  syncRevision={vaultSync.revision}
                />
              }
            />
          ) : null}
          {localWorkbench ? (
            <Route
              path="/social-insights/trends/:trendId"
              element={
                <SocialTrendDetailPage
                  onOpenDocument={openDocument}
                  syncRevision={vaultSync.revision}
                />
              }
            />
          ) : null}
          {localWorkbench ? (
            <Route
              path="/social-insights/:reportId"
              element={
                <SocialInsightsPage
                  onOpenDocument={openDocument}
                  syncRevision={vaultSync.revision}
                />
              }
            />
          ) : null}
          <Route
            path="/topics"
            element={<TopicsPage onOpenDocument={openDocument} />}
          />
          <Route
            path="/content"
            element={
              <CollectionPage
                kind="content"
                eyebrow="CONTENT PIPELINE"
                title="内容中心"
                onOpenDocument={openDocument}
              />
            }
          />
          <Route path="/douyin" element={<DouyinPage />} />
          <Route path="/system" element={<SystemPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </Suspense>
      </AppShell>

      {searchOpen ? (
        <Suspense fallback={<RouteLoading />}>
          <SearchPalette
            open
            onClose={() => setSearchOpen(false)}
            onOpenContextResult={(_item, query) => {
              navigate(`/context?q=${encodeURIComponent(query.trim())}`);
              setSearchOpen(false);
            }}
            onOpenDocument={(document) => {
              openDocument(document);
              setSearchOpen(false);
            }}
          />
        </Suspense>
      ) : null}

      {selectedDocumentId ? (
        <Suspense fallback={<RouteLoading />}>
          <DocumentDrawer
            documentId={selectedDocumentId}
            onNavigateDocument={openDocument}
            onClose={() => {
              setSelectedDocumentId(null);
              setReaderContext(null);
            }}
            readingContext={readerContext}
          />
        </Suspense>
      ) : null}
    </>
  );
}
