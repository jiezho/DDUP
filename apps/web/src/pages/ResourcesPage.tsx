import { Button, Card, Input, List, Space, Tag, Typography, Tabs } from "antd";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";

type FeedSource = { id: string; name: string; url: string };
type FeedItem = { id: string; title: string; summary: string; link: string; is_read: boolean; is_saved: boolean };
type GraphEntity = { id: string; name: string; type: string };
type FileItem = { id: string; name: string; type: string };

export default function ResourcesPage() {
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [entityName, setEntityName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [src, itm, ent, fls] = await Promise.all([
        apiGet<FeedSource[]>("/api/resources/feeds/sources"),
        apiGet<FeedItem[]>("/api/resources/feeds/items"),
        apiGet<GraphEntity[]>("/api/resources/graph/entities"),
        apiGet<FileItem[]>("/api/resources/files")
      ]);
      setSources(src);
      setFeedItems(itm);
      setEntities(ent);
      setFiles(fls);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll().catch(() => null);
  }, []);

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
  };

  const markRead = async (id: string) => {
    const updated = await apiPost<FeedItem>(`/api/resources/feeds/items/${id}/read`, {});
    setFeedItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
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

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Typography.Title level={4} style={{ marginBottom: 0 }}>
          资源
        </Typography.Title>
        <Typography.Text type="secondary">资讯、知识图谱与文件论文。</Typography.Text>
      </Card>

      <Tabs
        defaultActiveKey="feeds"
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
                <Card title="信息流" size="small" extra={<Button size="small" onClick={() => refreshAll().catch(() => null)}>刷新</Button>}>
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
              <Card title="文件与论文库" size="small">
                <List
                  loading={loading}
                  dataSource={files}
                  locale={{ emptyText: "暂无文件，可通过对话导入 PDF" }}
                  renderItem={(f) => (
                    <List.Item>
                      <Space>
                        <Typography.Text strong>{f.name}</Typography.Text>
                        <Tag color="volcano">{f.type}</Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            )
          }
        ]}
      />
    </Space>
  );
}

