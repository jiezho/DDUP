import { Button, Card, Input, List, Space, Tag, Typography, Tabs } from "antd";
import { useEffect, useState } from "react";

import { apiGet, apiPost } from "../lib/api";

type Term = { id: string; term: string; definition: string; source: string; mastered: boolean; next_review_date: string | null };

export default function LearningPage() {
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [items, setItems] = useState<Term[]>([]);
  const [reviewItems, setReviewItems] = useState<Term[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

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
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Typography.Title level={4} style={{ marginBottom: 0 }}>
          学习
        </Typography.Title>
        <Typography.Text type="secondary">术语库与卡片复习。</Typography.Text>
      </Card>

      <Tabs
        defaultActiveKey="review"
        items={[
          {
            key: "review",
            label: "卡片复习",
            children: (
              <Card
                title={
                  <Space>
                    <span>待复习队列</span>
                    <Button size="small" onClick={() => refreshReview().catch(() => null)}>
                      刷新
                    </Button>
                    <Tag color="blue">{reviewItems.length} 个术语</Tag>
                  </Space>
                }
                size="small"
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
                <Card title="新增术语" size="small">
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
                      <Button size="small" onClick={() => refresh().catch(() => null)}>
                        刷新
                      </Button>
                    </Space>
                  }
                  size="small"
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

