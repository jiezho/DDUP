import { Button, Card, Col, List, Row, Space, Statistic, Tabs, Typography, theme } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiGet } from "../lib/api";

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

export default function MeWorkspacePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [wiki, setWiki] = useState<WikiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { token } = theme.useToken();

  const refresh = async () => {
    setLoading(true);
    try {
      const [dashboardResp, templateResp, wikiResp] = await Promise.all([
        apiGet<DashboardStats>("/api/me/dashboard"),
        apiGet<TemplateItem[]>("/api/me/templates"),
        apiGet<WikiStatus>("/api/wiki/status")
      ]);
      setStats(dashboardResp);
      setTemplates(templateResp);
      setWiki(wikiResp);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => null);
  }, []);

  const shellStyle = {
    width: "100%",
    borderRadius: 28,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorBgContainer,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)"
  } as const;

  const tonalStyle = {
    borderRadius: 28,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: `linear-gradient(180deg, ${token.colorBgContainer} 0%, ${token.colorFillTertiary} 100%)`,
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)"
  } as const;

  const statStyle = {
    borderRadius: 24,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorFillTertiary,
    boxShadow: "none"
  } as const;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={16}>
      <Card
        bordered={false}
        style={tonalStyle}
        bodyStyle={{ padding: 28 }}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Space wrap align="center" style={{ justifyContent: "space-between", width: "100%" }}>
            <Space direction="vertical" size={4}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                系统管理
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 760 }}>
                聚合个人工作台、知识模板、Wiki 状态与 Hermes 管理入口。界面尽量减少操作噪音，
                让常用信息一眼可读、关键动作一步可达。
              </Typography.Paragraph>
            </Space>
            <Typography.Text type="secondary">统一入口</Typography.Text>
          </Space>
          <Space wrap>
            <Button type="primary" onClick={() => navigate("/me/hermes")}>
              进入 Hermes 管理台
            </Button>
            <Button type="text" onClick={() => refresh().catch(() => null)} loading={loading}>
              刷新当前页
            </Button>
          </Space>
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="dashboard"
        items={[
          {
            key: "dashboard",
            label: "概览",
            children: (
              <Card
                title="工作台概览"
                size="small"
                bordered={false}
                style={shellStyle}
                extra={
                  <Button size="small" type="text" onClick={() => refresh().catch(() => null)} loading={loading}>
                    刷新
                  </Button>
                }
              >
                {loading || !stats ? (
                  <Typography.Text>加载中...</Typography.Text>
                ) : (
                  <Row gutter={[16, 16]}>
                    <Col xs={12} md={12} xl={6}>
                      <Card bordered={false} size="small" style={statStyle}>
                        <Statistic
                          title="待办完成率"
                          value={stats.todos_total ? Math.round((stats.todos_done / stats.todos_total) * 100) : 0}
                          suffix="%"
                        />
                      </Card>
                    </Col>
                    <Col xs={12} md={12} xl={6}>
                      <Card bordered={false} size="small" style={statStyle}>
                        <Statistic title="进行中习惯" value={stats.habits_active} />
                      </Card>
                    </Col>
                    <Col xs={12} md={12} xl={6}>
                      <Card bordered={false} size="small" style={statStyle}>
                        <Statistic title="灵感数量" value={stats.ideas_total} />
                      </Card>
                    </Col>
                    <Col xs={12} md={12} xl={6}>
                      <Card bordered={false} size="small" style={statStyle}>
                        <Statistic
                          title="术语掌握率"
                          value={stats.terms_total ? Math.round((stats.terms_mastered / stats.terms_total) * 100) : 0}
                          suffix="%"
                        />
                      </Card>
                    </Col>
                  </Row>
                )}
              </Card>
            )
          },
          {
            key: "templates",
            label: "模板",
            children: (
              <Card title="常用模板" size="small" bordered={false} style={shellStyle}>
                <List
                  dataSource={templates}
                  locale={{ emptyText: "暂无模板产出" }}
                  renderItem={(item) => (
                    <List.Item actions={[<Button key="use" size="small" type="primary">使用</Button>]}>
                      <List.Item.Meta title={item.name} description={item.description} />
                    </List.Item>
                  )}
                />
              </Card>
            )
          },
          {
            key: "integrations",
            label: "连接",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <Card title="飞书集成" size="small" bordered={false} style={shellStyle}>
                  <Space wrap>
                    <Typography.Text strong>待接入</Typography.Text>
                    <Button size="small" type="primary" ghost>连接飞书</Button>
                    <Typography.Text type="secondary">
                      用于发送消息卡片、写入多维表格与同步协同流程。
                    </Typography.Text>
                  </Space>
                </Card>
                <Card title="微信分享" size="small" bordered={false} style={shellStyle}>
                  <Typography.Text type="secondary">
                    对话或摘要结果可进一步生成微信分享卡片，面向轻量传播场景。
                  </Typography.Text>
                </Card>
              </Space>
            )
          },
          {
            key: "permissions",
            label: "权限",
            children: (
              <Card title="空间与权限" size="small" bordered={false} style={shellStyle}>
                <Typography.Text type="secondary">
                  默认基于 Space 提供读写隔离、智能体访问控制与后续操作审计的扩展位。
                </Typography.Text>
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
                bordered={false}
                style={shellStyle}
                extra={
                  <Button size="small" type="text" onClick={() => refresh().catch(() => null)} loading={loading}>
                    刷新
                  </Button>
                }
              >
                {!wiki ? (
                  <Typography.Text>加载中...</Typography.Text>
                ) : wiki.enabled ? (
                  <Space direction="vertical" style={{ width: "100%" }} size={8}>
                    <Space wrap>
                      <Typography.Text strong>已启用</Typography.Text>
                      <Typography.Text type="secondary">Raw 待处理：{wiki.raw_count}</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary">Raw 最近更新时间：{wiki.raw_latest_updated_at || "-"}</Typography.Text>
                    <Typography.Text type="secondary">Manifest 更新时间：{wiki.manifest_updated_at || "-"}</Typography.Text>
                    <Typography.Text type="secondary">日志更新时间：{wiki.log_updated_at || "-"}</Typography.Text>
                    <Typography.Text type="secondary">
                      在对话结果卡中点击“写入 Wiki”后，内容会先进入 Vault 的 `_raw/`，再由
                      Hermes/obsidian-wiki 定时编译为正式页面。
                    </Typography.Text>
                  </Space>
                ) : (
                  <Space direction="vertical" style={{ width: "100%" }} size={8}>
                    <Typography.Text strong>未启用</Typography.Text>
                    <Typography.Text type="secondary">
                      请在生产环境配置 `DDUP_WIKI_ENABLED` 与 `DDUP_WIKI_VAULT_PATH`。
                    </Typography.Text>
                  </Space>
                )}
              </Card>
            )
          }
        ]}
        tabBarStyle={{ marginBottom: 4 }}
      />
    </Space>
  );
}
