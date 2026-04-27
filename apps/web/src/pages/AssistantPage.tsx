import { Button, Card, Input, List, Space, Tabs, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { apiGet, apiPost } from "../lib/api";

export default function AssistantPage() {
  const [todos, setTodos] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [todoText, setTodoText] = useState("");
  const [habits, setHabits] = useState<{ id: string; name: string; cadence: string; streak: number; last_checkin: string | null }[]>(
    []
  );
  const [habitName, setHabitName] = useState("");
  const [ideas, setIdeas] = useState<{ id: string; content: string; tags: string | null }[]>([]);
  const [ideaContent, setIdeaContent] = useState("");
  const [ideaTags, setIdeaTags] = useState("");
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [loadingHabits, setLoadingHabits] = useState(false);
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  const refreshTodos = async () => {
    setLoadingTodos(true);
    try {
      const list = await apiGet<{ id: string; text: string; done: boolean }[]>("/api/assistant/todos");
      setTodos(list);
    } finally {
      setLoadingTodos(false);
    }
  };

  const refreshHabits = async () => {
    setLoadingHabits(true);
    try {
      const list = await apiGet<{ id: string; name: string; cadence: string; streak: number; last_checkin: string | null }[]>(
        "/api/assistant/habits"
      );
      setHabits(list);
    } finally {
      setLoadingHabits(false);
    }
  };

  const refreshIdeas = async () => {
    setLoadingIdeas(true);
    try {
      const list = await apiGet<{ id: string; content: string; tags: string | null }[]>("/api/assistant/ideas");
      setIdeas(list);
    } finally {
      setLoadingIdeas(false);
    }
  };

  useEffect(() => {
    refreshTodos().catch(() => null);
    refreshHabits().catch(() => null);
    refreshIdeas().catch(() => null);
  }, []);

  const addTodo = async () => {
    const t = todoText.trim();
    if (!t) return;
    const created = await apiPost<{ id: string; text: string; done: boolean }>("/api/assistant/todos", { text: t });
    setTodos((prev) => [created, ...prev]);
    setTodoText("");
  };

  const completeTodo = async (id: string) => {
    const updated = await apiPost<{ id: string; text: string; done: boolean }>(`/api/assistant/todos/${id}/complete`, {});
    setTodos((prev) => prev.map((x) => (x.id === id ? updated : x)));
  };

  const addHabit = async () => {
    const name = habitName.trim();
    if (!name) return;
    const created = await apiPost<{ id: string; name: string; cadence: string; streak: number; last_checkin: string | null }>(
      "/api/assistant/habits",
      { name, cadence: "daily" }
    );
    setHabits((prev) => [created, ...prev]);
    setHabitName("");
  };

  const checkinHabit = async (id: string) => {
    const updated = await apiPost<{ id: string; name: string; cadence: string; streak: number; last_checkin: string | null }>(
      `/api/assistant/habits/${id}/checkin`,
      {}
    );
    setHabits((prev) => prev.map((x) => (x.id === id ? updated : x)));
  };

  const addIdea = async () => {
    const c = ideaContent.trim();
    if (!c) return;
    const created = await apiPost<{ id: string; content: string; tags: string | null }>("/api/assistant/ideas", {
      content: c,
      tags: ideaTags.trim() || null
    });
    setIdeas((prev) => [created, ...prev]);
    setIdeaContent("");
    setIdeaTags("");
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Typography.Title level={4} style={{ marginBottom: 0 }}>
          助手
        </Typography.Title>
        <Typography.Text type="secondary">待办、习惯与灵感收件箱。</Typography.Text>
      </Card>

      <Card size="small">
        <Tabs
          defaultActiveKey="todos"
          items={[
            {
              key: "todos",
              label: "待办清单",
              children: (
                <Space direction="vertical" style={{ width: "100%" }} size={12}>
                  <Space.Compact style={{ width: "100%" }}>
                    <Input value={todoText} onChange={(e) => setTodoText(e.target.value)} placeholder="新增待办…" />
                    <Button type="primary" onClick={() => addTodo().catch(() => null)} disabled={!todoText.trim()}>
                      添加
                    </Button>
                  </Space.Compact>
                  <Space>
                    <Button size="small" onClick={() => refreshTodos().catch(() => null)}>
                      刷新
                    </Button>
                    <Tag>总计 {todos.length}</Tag>
                    <Tag color="blue">未完成 {todos.filter((t) => !t.done).length}</Tag>
                  </Space>
                  <List
                    loading={loadingTodos}
                    dataSource={todos}
                    locale={{ emptyText: "暂无待办" }}
                    renderItem={(t) => (
                      <List.Item
                        actions={[
                          t.done ? (
                            <Tag key="done" color="green">
                              已完成
                            </Tag>
                          ) : (
                            <Button key="complete" size="small" onClick={() => completeTodo(t.id).catch(() => null)}>
                              完成
                            </Button>
                          )
                        ]}
                      >
                        <Typography.Text delete={t.done}>{t.text}</Typography.Text>
                      </List.Item>
                    )}
                  />
                </Space>
              )
            },
            {
              key: "habits",
              label: "习惯",
              children: (
                <Space direction="vertical" style={{ width: "100%" }} size={12}>
                  <Space.Compact style={{ width: "100%" }}>
                    <Input value={habitName} onChange={(e) => setHabitName(e.target.value)} placeholder="新增习惯（每日）…" />
                    <Button type="primary" onClick={() => addHabit().catch(() => null)} disabled={!habitName.trim()}>
                      添加
                    </Button>
                  </Space.Compact>
                  <Button size="small" onClick={() => refreshHabits().catch(() => null)}>
                    刷新
                  </Button>
                  <List
                    loading={loadingHabits}
                    dataSource={habits}
                    locale={{ emptyText: "暂无习惯" }}
                    renderItem={(h) => (
                      <List.Item
                        actions={[
                          <Button key="checkin" size="small" onClick={() => checkinHabit(h.id).catch(() => null)}>
                            打卡
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Typography.Text strong>{h.name}</Typography.Text>
                              <Tag>{h.cadence}</Tag>
                              <Tag color="purple">连续 {h.streak}</Tag>
                            </Space>
                          }
                          description={h.last_checkin ? `上次打卡：${h.last_checkin}` : "尚未打卡"}
                        />
                      </List.Item>
                    )}
                  />
                </Space>
              )
            },
            {
              key: "ideas",
              label: "灵感收件箱",
              children: (
                <Space direction="vertical" style={{ width: "100%" }} size={12}>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Input.TextArea
                      value={ideaContent}
                      onChange={(e) => setIdeaContent(e.target.value)}
                      placeholder="快速记录灵感…"
                      autoSize={{ minRows: 2, maxRows: 4 }}
                    />
                    <Space.Compact style={{ width: "100%" }}>
                      <Input
                        value={ideaTags}
                        onChange={(e) => setIdeaTags(e.target.value)}
                        placeholder="标签（逗号分隔，可选）"
                      />
                      <Button type="primary" onClick={() => addIdea().catch(() => null)} disabled={!ideaContent.trim()}>
                        添加
                      </Button>
                    </Space.Compact>
                  </Space>
                  <Button size="small" onClick={() => refreshIdeas().catch(() => null)}>
                    刷新
                  </Button>
                  <List
                    loading={loadingIdeas}
                    dataSource={ideas}
                    locale={{ emptyText: "暂无灵感" }}
                    renderItem={(i) => (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Typography.Paragraph ellipsis={{ rows: 2, expandable: true, symbol: "展开" }} style={{ marginBottom: 0 }}>
                              {i.content}
                            </Typography.Paragraph>
                          }
                          description={
                            i.tags ? (
                              <Space style={{ marginTop: 8 }}>
                                {i.tags.split(",").map((tag, idx) => (
                                  <Tag key={idx}>{tag.trim()}</Tag>
                                ))}
                              </Space>
                            ) : null
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Space>
              )
            }
          ]}
        />
      </Card>
    </Space>
  );
}

