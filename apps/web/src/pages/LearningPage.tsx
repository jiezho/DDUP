import { Button, Card, Input, List, Space, Tag, Typography, Tabs, theme } from "antd";
import { useEffect, useState } from "react";

import { apiGet, apiPost } from "../lib/api";

type Term = { id: string; term: string; definition: string; source: string; mastered: boolean; next_review_date: string | null };

export default function LearningPage() {
  const { token } = theme.useToken();
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [items, setItems] = useState<Term[]>([]);
  const [reviewItems, setReviewItems] = useState<Term[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  const shellStyle = {
    borderRadius: 28,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorBgContainer,
    boxShadow: "0 10px 24px rgba(29, 27, 32, 0.04)"
  } as const;

  const tonalStyle = {
    borderRadius: 32,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: `linear-gradient(180deg, ${token.colorBgContainer} 0%, ${token.colorFillTertiary} 100%)`,
    boxShadow: "0 12px 32px rgba(29, 27, 32, 0.05)"
  } as const;

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await apiGet<Term[]>("/api/learning/terms");
      setItems(list);
    } finally {
      setLoading(false);
    }
  };

  const refreshReview = async () => {
    setReviewLoading(true);
    try {
      const list = await apiGet<Term[]>("/api/learning/terms/review");
      setReviewItems(list);
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => null);
    refreshReview().catch(() => null);
  }, []);

  const add = async () => {
    const t = term.trim();
    if (!t) return;
    const created = await apiPost<Term>("/api/learning/terms", { term: t, definition: definition.trim(), source: "" });
    setItems((prev) => [created, ...prev]);
    setTerm("");
    setDefinition("");
    refreshReview().catch(() => null);
  };

  const master = async (id: string) => {
    const updated = await apiPost<Term>(`/api/learning/terms/${id}/master`, {});
    setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
    setReviewItems((prev) => prev.filter((x) => x.id !== id));
  };

  const reviewTerm = async (id: string, quality: number) => {
    const updated = await apiPost<Term>(`/api/learning/terms/${id}/review`, { quality });
    setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
    setReviewItems((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={16}>
      <Card bordered={false} style={tonalStyle} bodyStyle={{ padding: 28 }}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            学习中心
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 760 }}>
            以复习为优先，再维护术语库。保持学习动作简短直接，让新增、复习、掌握三个阶段形成闭环。
          </Typography.Paragraph>
          <Space wrap>
            <Typography.Text type="secondary">待复习 {reviewItems.length} 项</Typography.Text>
            <Typography.Text type="secondary">术语总数 {items.length} 项</Typography.Text>
          </Space>
        </Space>
      </Card>
      <Tabs
        defaultActiveKey="review"
        tabBarStyle={{ marginBottom: 4 }}
        items={[
          {
            key: "review",
            label: "复习",
            children: (
              <Card
                title={
                  <Space>
                    <span>待复习队列</span>
                    <Button size="small" type="text" onClick={() => refreshReview().catch(() => null)}>
                      刷新
                    </Button>
                    <Typography.Text type="secondary">{reviewItems.length} 个术语</Typography.Text>
                  </Space>
                }
                size="small"
                bordered={false}
                style={shellStyle}
              >
                <List
                  loading={reviewLoading}
                  dataSource={reviewItems}
                  locale={{ emptyText: "今日无待复习任务，太棒了！" }}
                  renderItem={(i) => (
                    <List.Item
                      actions={[
                        <Space key="actions" wrap>
                          <Button size="small" danger onClick={() => reviewTerm(i.id, 0).catch(() => null)}>
                            忘记 (0)
                          </Button>
                          <Button size="small" onClick={() => reviewTerm(i.id, 2).catch(() => null)}>
                            困难 (2)
                          </Button>
                          <Button size="small" type="primary" onClick={() => reviewTerm(i.id, 4).catch(() => null)}>
                            简单 (4)
                          </Button>
                        </Space>
                      ]}
                    >
                      <List.Item.Meta
                        title={<Typography.Text strong>{i.term}</Typography.Text>}
                        description={i.definition ? i.definition : <Typography.Text type="secondary">（无解释）</Typography.Text>}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            )
          },
          {
            key: "library",
            label: "术语库",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <Card title="新增术语" size="small" bordered={false} style={shellStyle}>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="术语（例如：RAG）" />
                    <Input.TextArea
                      value={definition}
                      onChange={(e) => setDefinition(e.target.value)}
                      placeholder="解释（可选）"
                      autoSize={{ minRows: 2, maxRows: 4 }}
                    />
                    <Button type="primary" onClick={() => add().catch(() => null)} disabled={!term.trim()}>
                      添加
                    </Button>
                  </Space>
                </Card>

                <Card
                  title={
                    <Space>
                      <span>全部术语</span>
                      <Button size="small" type="text" onClick={() => refresh().catch(() => null)}>
                        刷新
                      </Button>
                    </Space>
                  }
                  size="small"
                  bordered={false}
                  style={shellStyle}
                >
                  <List
                    loading={loading}
                    dataSource={items}
                    locale={{ emptyText: "暂无术语" }}
                    renderItem={(i) => (
                      <List.Item
                        actions={[
                          i.mastered ? (
                            <Tag key="mastered" color="green">
                              已掌握
                            </Tag>
                          ) : (
                            <Button key="master" size="small" onClick={() => master(i.id).catch(() => null)}>
                              标记掌握
                            </Button>
                          )
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Typography.Text strong>{i.term}</Typography.Text>
                              {i.source ? <Tag>{i.source}</Tag> : null}
                              {i.next_review_date ? <Tag color="orange">下次复习: {i.next_review_date}</Tag> : null}
                            </Space>
                          }
                          description={i.definition ? i.definition : <Typography.Text type="secondary">（无解释）</Typography.Text>}
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              </Space>
            )
          }
        ]}
      />
    </Space>
  );
}

