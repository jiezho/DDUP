import { Button, Card, Drawer, Input, List, Segmented, Select, Space, Tag, Typography, Tabs } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import { useDisplayMode } from "../contexts/displayMode";

type FeedSource = { id: string; name: string; url: string };
type FeedItem = { id: string; title: string; summary: string; link: string; is_read: boolean; is_saved: boolean };
type GraphEntity = { id: string; name: string; type: string };
type FileItem = { id: string; name: string; type: string };
type FileDetail = { id: string; name: string; type: string; path: string; preview_text: string };

export default function ResourcesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { resolvedMode } = useDisplayMode();
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [savedItems, setSavedItems] = useState<FeedItem[]>([]);
  const [feedQuery, setFeedQuery] = useState("");
  const [savedQuery, setSavedQuery] = useState("");
  const [feedMode, setFeedMode] = useState<"all" | "unread">("all");
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [entityName, setEntityName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const [fileType, setFileType] = useState<string>("all");
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wikiQuery, setWikiQuery] = useState("");
  const [wikiAnswer, setWikiAnswer] = useState("");
  const [wikiLoading, setWikiLoading] = useState(false);

  const initialTab = useMemo(() => {
    const t = new URLSearchParams(location.search).get("tab") || "";
    if (t === "saved" || t === "feeds" || t === "graph" || t === "files" || t === "wiki") return t;
    return "feeds";
  }, [location.search]);
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [src, itm, ent, fls, saved] = await Promise.all([
        apiGet<FeedSource[]>("/api/resources/feeds/sources"),
        apiGet<FeedItem[]>("/api/resources/feeds/items?limit=100"),
        apiGet<GraphEntity[]>("/api/resources/graph/entities"),
        apiGet<FileItem[]>("/api/resources/files?limit=200"),
        apiGet<FeedItem[]>("/api/resources/feeds/items?saved_only=true&unread_only=true&limit=200")
      ]);
      setSources(src);
      setFeedItems(itm);
      setEntities(ent);
      setFiles(fls);
      setSavedItems(saved);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll().catch(() => null);
  }, []);

  const refreshFeeds = async (opts?: { savedOnly?: boolean; unreadOnly?: boolean; q?: string }) => {
    const params = new URLSearchParams();
    if (opts?.savedOnly) params.set("saved_only", "true");
    if (opts?.unreadOnly) params.set("unread_only", "true");
    if (opts?.q?.trim()) params.set("q", opts.q.trim());
    params.set("limit", "200");
    return apiGet<FeedItem[]>(`/api/resources/feeds/items?${params.toString()}`);
  };

  const refreshFiles = async (opts?: { q?: string; type?: string }) => {
    const params = new URLSearchParams();
    if (opts?.q?.trim()) params.set("q", opts.q.trim());
    if (opts?.type && opts.type !== "all") params.set("type", opts.type);
    params.set("limit", "500");
    return apiGet<FileItem[]>(`/api/resources/files?${params.toString()}`);
  };

  const addSource = async () => {
    const n = sourceName.trim();
    const u = sourceUrl.trim();
    if (!n || !u) return;
    const created = await apiPost<FeedSource>("/api/resources/feeds/sources", { name: n, url: u });
    setSources((prev) => [created, ...prev]);
    setSourceName("");
    setSourceUrl("");
  };

  const toggleSave = async (id: string) => {
    const updated = await apiPost<FeedItem>(`/api/resources/feeds/items/${id}/save`, {});
    setFeedItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
    setSavedItems((prev) => {
      const exists = prev.some((x) => x.id === id);
      if (updated.is_saved && !updated.is_read) return exists ? prev.map((x) => (x.id === id ? updated : x)) : [updated, ...prev];
      return prev.filter((x) => x.id !== id);
    });
  };

  const markRead = async (id: string) => {
    const updated = await apiPost<FeedItem>(`/api/resources/feeds/items/${id}/read`, {});
    setFeedItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
    setSavedItems((prev) => prev.filter((x) => x.id !== id));
  };

  const addEntity = async () => {
    const n = entityName.trim();
    const t = entityType.trim();
    if (!n || !t) return;
    const created = await apiPost<GraphEntity>("/api/resources/graph/entities", { name: n, type: t });
    setEntities((prev) => [created, ...prev]);
    setEntityName("");
    setEntityType("");
  };

  const runWikiQuery = async () => {
    const q = wikiQuery.trim();
    if (!q) return;
    setWikiLoading(true);
    try {
      const resp = await apiPost<{ answer: string }>("/api/wiki/query", { query: q });
      setWikiAnswer(resp.answer || "");
    } catch (e) {
      setWikiAnswer((e as Error).message || "查询失败");
    } finally {
      setWikiLoading(false);
    }
  };

  const openFilePreview = async (id: string) => {
    try {
      const detail = await apiGet<FileDetail>(`/api/resources/files/${id}`);
      setSelectedFile(detail);
      if (resolvedMode === "h5") setPreviewOpen(true);
    } catch {
      setSelectedFile(null);
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Typography.Title level={4} style={{ marginBottom: 0 }}>
          资源
        </Typography.Title>
        <Typography.Text type="secondary">资讯、知识图谱与文件论文。</Typography.Text>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(k) => {
          setActiveTab(k);
          const next = new URLSearchParams(location.search);
          next.set("tab", k);
          navigate({ pathname: location.pathname, search: `?${next.toString()}` }, { replace: true });
        }}
        items={[
          {
            key: "feeds",
            label: "资讯信息流",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <Card title="资讯源管理" size="small">
                  <Space.Compact style={{ width: "100%" }}>
                    <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="名称" />
                    <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="RSS URL" />
                    <Button type="primary" onClick={() => addSource().catch(() => null)} disabled={!sourceName || !sourceUrl}>
                      添加
                    </Button>
                  </Space.Compact>
                  <List
                    size="small"
                    dataSource={sources}
                    renderItem={(s) => (
                      <List.Item>
                        <Typography.Text strong>{s.name}</Typography.Text>
                        <Typography.Text type="secondary" style={{ marginLeft: 8 }}>{s.url}</Typography.Text>
                      </List.Item>
                    )}
                  />
                </Card>
                <Card
                  title="信息流"
                  size="small"
                  extra={
                    <Space>
                      <Segmented
                        size="small"
                        value={feedMode}
                        options={[
                          { label: "全部", value: "all" },
                          { label: "未读", value: "unread" }
                        ]}
                        onChange={(v) => setFeedMode(v as typeof feedMode)}
                      />
                      <Button
                        size="small"
                        onClick={async () => {
                          setLoading(true);
                          try {
                            const list = await refreshFeeds({ unreadOnly: feedMode === "unread", q: feedQuery });
                            setFeedItems(list);
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        刷新
                      </Button>
                    </Space>
                  }
                >
                  <Space style={{ width: "100%" }} direction="vertical" size={8}>
                    <Input
                      value={feedQuery}
                      onChange={(e) => setFeedQuery(e.target.value)}
                      onPressEnter={async () => {
                        setLoading(true);
                        try {
                          const list = await refreshFeeds({ unreadOnly: feedMode === "unread", q: feedQuery });
                          setFeedItems(list);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      placeholder="搜索标题/摘要"
                    />
                  </Space>
                  <List
                    loading={loading}
                    dataSource={feedItems}
                    locale={{ emptyText: "暂无资讯" }}
                    renderItem={(i) => (
                      <List.Item
                        actions={[
                          <Button key="read" size="small" onClick={() => markRead(i.id).catch(() => null)} disabled={i.is_read}>
                            {i.is_read ? "已读" : "标记已读"}
                          </Button>,
                          <Button key="save" size="small" onClick={() => toggleSave(i.id).catch(() => null)}>
                            {i.is_saved ? "★ 取消稍后读" : "☆ 稍后读"}
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={<a href={i.link} target="_blank" rel="noreferrer">{i.title}</a>}
                          description={i.summary}
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "saved",
            label: "稍后读",
            children: (
              <Card
                title="稍后读（未读）"
                size="small"
                extra={
                  <Button
                    size="small"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const list = await refreshFeeds({ savedOnly: true, unreadOnly: true, q: savedQuery });
                        setSavedItems(list);
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    刷新
                  </Button>
                }
              >
                <Space direction="vertical" style={{ width: "100%" }} size={8}>
                  <Input
                    value={savedQuery}
                    onChange={(e) => setSavedQuery(e.target.value)}
                    onPressEnter={async () => {
                      setLoading(true);
                      try {
                        const list = await refreshFeeds({ savedOnly: true, unreadOnly: true, q: savedQuery });
                        setSavedItems(list);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    placeholder="搜索稍后读"
                  />
                  <List
                    loading={loading}
                    dataSource={savedItems}
                    locale={{ emptyText: "暂无稍后读" }}
                    renderItem={(i) => (
                      <List.Item
                        actions={[
                          <Button key="read" size="small" onClick={() => markRead(i.id).catch(() => null)}>
                            标记已读
                          </Button>,
                          <Button key="save" size="small" onClick={() => toggleSave(i.id).catch(() => null)}>
                            取消
                          </Button>
                        ]}
                      >
                        <List.Item.Meta title={<a href={i.link} target="_blank" rel="noreferrer">{i.title}</a>} description={i.summary} />
                      </List.Item>
                    )}
                  />
                </Space>
              </Card>
            )
          },
          {
            key: "graph",
            label: "知识图谱",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <Card title="新增实体" size="small">
                  <Space.Compact style={{ width: "100%" }}>
                    <Input value={entityName} onChange={(e) => setEntityName(e.target.value)} placeholder="实体名称" />
                    <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="类型（Person/Concept等）" />
                    <Button type="primary" onClick={() => addEntity().catch(() => null)} disabled={!entityName || !entityType}>
                      添加
                    </Button>
                  </Space.Compact>
                </Card>
                <Card title="实体列表" size="small">
                  <List
                    loading={loading}
                    dataSource={entities}
                    locale={{ emptyText: "暂无实体" }}
                    renderItem={(e) => (
                      <List.Item>
                        <Space>
                          <Typography.Text strong>{e.name}</Typography.Text>
                          <Tag color="purple">{e.type}</Tag>
                        </Space>
                      </List.Item>
                    )}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "files",
            label: "文件检索",
            children: (
              <Card
                title="文件与论文库"
                size="small"
                extra={
                  <Button
                    size="small"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const fls = await refreshFiles({ q: fileQuery, type: fileType });
                        setFiles(fls);
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    刷新
                  </Button>
                }
              >
                <Space direction="vertical" style={{ width: "100%" }} size={10}>
                  <Space wrap>
                    <Input
                      value={fileQuery}
                      onChange={(e) => setFileQuery(e.target.value)}
                      onPressEnter={async () => {
                        setLoading(true);
                        try {
                          const fls = await refreshFiles({ q: fileQuery, type: fileType });
                          setFiles(fls);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      placeholder="按文件名/路径搜索"
                      style={{ width: 320 }}
                    />
                    <Select
                      value={fileType}
                      style={{ width: 160 }}
                      options={[
                        { value: "all", label: "全部类型" },
                        { value: "pdf", label: "PDF" },
                        { value: "docx", label: "DOCX" },
                        { value: "md", label: "Markdown" },
                        { value: "txt", label: "Text" }
                      ]}
                      onChange={(v) => setFileType(v)}
                    />
                    <Button
                      type="primary"
                      onClick={async () => {
                        setLoading(true);
                        try {
                          const fls = await refreshFiles({ q: fileQuery, type: fileType });
                          setFiles(fls);
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      搜索
                    </Button>
                  </Space>
                  <div style={{ display: resolvedMode === "pc" ? "grid" : "block", gridTemplateColumns: "420px 1fr", gap: 12 }}>
                    <List
                      loading={loading}
                      dataSource={files}
                      locale={{ emptyText: "暂无文件，可通过对话导入 PDF" }}
                      renderItem={(f) => (
                        <List.Item
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            openFilePreview(f.id).catch(() => null);
                          }}
                        >
                          <Space>
                            <Typography.Text strong>{f.name}</Typography.Text>
                            <Tag color="volcano">{f.type}</Tag>
                          </Space>
                        </List.Item>
                      )}
                    />
                    {resolvedMode === "pc" ? (
                      <Card size="small" title={selectedFile ? selectedFile.name : "预览"}>
                        {selectedFile ? (
                          <Space direction="vertical" style={{ width: "100%" }} size={8}>
                            <Typography.Text type="secondary">{selectedFile.path}</Typography.Text>
                            {selectedFile.preview_text ? (
                              <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                                {selectedFile.preview_text}
                              </Typography.Paragraph>
                            ) : (
                              <Typography.Text type="secondary">暂无可预览内容（当前仅对文本类文件提供预览）。</Typography.Text>
                            )}
                          </Space>
                        ) : (
                          <Typography.Text type="secondary">点击左侧文件查看预览。</Typography.Text>
                        )}
                      </Card>
                    ) : null}
                  </div>
                </Space>
              </Card>
            )
          },
          {
            key: "wiki",
            label: "Wiki 检索",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <Card title="知识库查询（Hermes + Obsidian Wiki）" size="small">
                  <Space.Compact style={{ width: "100%" }}>
                    <Input
                      value={wikiQuery}
                      onChange={(e) => setWikiQuery(e.target.value)}
                      placeholder="输入问题，例如：DDUP 的 Wiki 写入链路是什么？"
                      onPressEnter={() => runWikiQuery().catch(() => null)}
                    />
                    <Button type="primary" loading={wikiLoading} onClick={() => runWikiQuery().catch(() => null)} disabled={!wikiQuery.trim()}>
                      查询
                    </Button>
                  </Space.Compact>
                </Card>
                <Card title="回答" size="small" loading={wikiLoading}>
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                    {wikiAnswer || "暂无结果"}
                  </Typography.Paragraph>
                </Card>
              </Space>
            )
          }
        ]}
      />
      <Drawer
        title={selectedFile?.name || "文件预览"}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        placement="bottom"
        height="70%"
      >
        {selectedFile ? (
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            <Typography.Text type="secondary">{selectedFile.path}</Typography.Text>
            {selectedFile.preview_text ? (
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{selectedFile.preview_text}</Typography.Paragraph>
            ) : (
              <Typography.Text type="secondary">暂无可预览内容（当前仅对文本类文件提供预览）。</Typography.Text>
            )}
          </Space>
        ) : (
          <Typography.Text type="secondary">暂无内容</Typography.Text>
        )}
      </Drawer>
    </Space>
  );
}

