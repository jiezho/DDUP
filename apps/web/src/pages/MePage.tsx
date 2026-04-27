import { Button, Card, Space, Statistic, Tabs, Typography, Row, Col, List, Tag, Segmented } from "antd";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { useDisplayMode } from "../contexts/displayMode";

type DashboardStats = {
  todos_total: number;
  todos_done: number;
  habits_active: number;
  terms_total: number;
  terms_mastered: number;
  ideas_total: number;
};

type TemplateItem = { id: string; name: string; description: string };
type WikiStatus = {
  enabled: boolean;
  raw_count: number;
  raw_latest_updated_at: string | null;
  manifest_updated_at: string | null;
  log_updated_at: string | null;
};

export default function MePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [wiki, setWiki] = useState<WikiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const { displayMode, resolvedMode, setDisplayMode } = useDisplayMode();

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, t, w] = await Promise.all([
        apiGet<DashboardStats>("/api/me/dashboard"),
        apiGet<TemplateItem[]>("/api/me/templates"),
        apiGet<WikiStatus>("/api/wiki/status")
      ]);
      setStats(s);
      setTemplates(t);
      setWiki(w);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => null);
  }, []);

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Space style={{ width: "100%", justifyContent: "space-between" }} align="start" wrap>
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} style={{ marginBottom: 0 }}>
              我的
            </Typography.Title>
            <Typography.Text type="secondary">统计复盘、模板产出与外部集成。</Typography.Text>
          </Space>
          <Space direction="vertical" size={4}>
            <Typography.Text type="secondary">显示模式：{resolvedMode === "pc" ? "PC" : "H5"}</Typography.Text>
            <Segmented
              value={displayMode}
              options={[
                { label: "自动", value: "auto" },
                { label: "PC", value: "pc" },
                { label: "H5", value: "h5" }
              ]}
              onChange={(v) => setDisplayMode(v as typeof displayMode)}
            />
          </Space>
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="dashboard"
        items={[
          {
            key: "dashboard",
            label: "统计仪表盘",
            children: (
              <Card title="概览" size="small" extra={<Button size="small" onClick={() => refresh().catch(() => null)}>刷新</Button>}>
                {loading || !stats ? (
                  <Typography.Text>加载中...</Typography.Text>
                ) : (
                  <Row gutter={[16, 16]}>
                    <Col span={8}>
                      <Statistic title="待办完成率" value={stats.todos_total ? Math.round((stats.todos_done / stats.todos_total) * 100) : 0} suffix="%" />
                    </Col>
                    <Col span={8}>
                      <Statistic title="进行中习惯" value={stats.habits_active} />
                    </Col>
                    <Col span={8}>
                      <Statistic title="灵感数" value={stats.ideas_total} />
                    </Col>
                    <Col span={8}>
                      <Statistic title="术语掌握率" value={stats.terms_total ? Math.round((stats.terms_mastered / stats.terms_total) * 100) : 0} suffix="%" />
                    </Col>
                  </Row>
                )}
              </Card>
            )
          },
          {
            key: "templates",
            label: "模板产出",
            children: (
              <Card title="产出模板" size="small">
                <List
                  dataSource={templates}
                  renderItem={(t) => (
                    <List.Item actions={[<Button key="use" size="small" type="primary">使用</Button>]}>
                      <List.Item.Meta title={t.name} description={t.description} />
                    </List.Item>
                  )}
                />
              </Card>
            )
          },
          {
            key: "integrations",
            label: "集成与连接",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <Card title="飞书集成" size="small">
                  <Space>
                    <Tag color="default">未连接</Tag>
                    <Button size="small">连接飞书</Button>
                    <Typography.Text type="secondary">支持发送消息卡片与写入多维表格</Typography.Text>
                  </Space>
                </Card>
                <Card title="微信分享" size="small">
                  <Typography.Text type="secondary">在对话中生成的摘要支持生成微信分享卡片。</Typography.Text>
                </Card>
              </Space>
            )
          },
          {
            key: "permissions",
            label: "权限与审计",
            children: (
              <Card title="空间与权限" size="small">
                <Typography.Text type="secondary">默认提供基于 Space 的读写隔离与智能体访问控制。</Typography.Text>
              </Card>
            )
          },
          {
            key: "wiki",
            label: "Wiki",
            children: (
              <Card
                title="Obsidian Wiki"
                size="small"
                extra={
                  <Button size="small" onClick={() => refresh().catch(() => null)}>
                    刷新
                  </Button>
                }
              >
                {!wiki ? (
                  <Typography.Text>加载中...</Typography.Text>
                ) : wiki.enabled ? (
                  <Space direction="vertical" style={{ width: "100%" }} size={8}>
                    <Space wrap>
                      <Tag color="success">已启用</Tag>
                      <Typography.Text type="secondary">Raw 待处理：{wiki.raw_count}</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary">Raw 最近更新时间：{wiki.raw_latest_updated_at || "-"}</Typography.Text>
                    <Typography.Text type="secondary">Manifest 更新时间：{wiki.manifest_updated_at || "-"}</Typography.Text>
                    <Typography.Text type="secondary">Log 更新时间：{wiki.log_updated_at || "-"}</Typography.Text>
                    <Typography.Text type="secondary">
                      提示：在对话结果卡点击“写入 Wiki”，会写入 Vault 的 `_raw/`，后续由 Hermes/obsidian-wiki 定时编译为正式页面。
                    </Typography.Text>
                  </Space>
                ) : (
                  <Space direction="vertical" style={{ width: "100%" }} size={8}>
                    <Tag color="default">未启用</Tag>
                    <Typography.Text type="secondary">请在生产环境配置 DDUP_WIKI_ENABLED/DDUP_WIKI_VAULT_PATH。</Typography.Text>
                  </Space>
                )}
              </Card>
            )
          }
        ]}
      />
    </Space>
  );
}

