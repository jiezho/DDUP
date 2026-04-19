import { Button, Card, Input, List, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { apiGet, apiPost } from "../lib/api";

export default function LearningPage() {
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [items, setItems] = useState<
    { id: string; term: string; definition: string; source: string; mastered: boolean }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await apiGet<{ id: string; term: string; definition: string; source: string; mastered: boolean }[]>(
        "/api/learning/terms"
      );
      setItems(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => null);
  }, []);

  const add = async () => {
    const t = term.trim();
    if (!t) return;
    const created = await apiPost<{ id: string; term: string; definition: string; source: string; mastered: boolean }>(
      "/api/learning/terms",
      { term: t, definition: definition.trim(), source: "" }
    );
    setItems((prev) => [created, ...prev]);
    setTerm("");
    setDefinition("");
  };

  const master = async (id: string) => {
    const updated = await apiPost<{ id: string; term: string; definition: string; source: string; mastered: boolean }>(
      `/api/learning/terms/${id}/master`,
      {}
    );
    setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Typography.Title level={4} style={{ marginBottom: 0 }}>
          学习
        </Typography.Title>
        <Typography.Text type="secondary">术语库（MVP）：新增术语、查看列表、标记掌握。</Typography.Text>
      </Card>

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
            <span>术语列表</span>
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
                  </Space>
                }
                description={i.definition ? i.definition : <Typography.Text type="secondary">（无解释）</Typography.Text>}
              />
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}

