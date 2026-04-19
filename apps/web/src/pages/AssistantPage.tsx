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
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [loadingHabits, setLoadingHabits] = useState(false);

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

  useEffect(() => {
    refreshTodos().catch(() => null);
    refreshHabits().catch(() => null);
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

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Typography.Title level={4} style={{ marginBottom: 0 }}>
          助手
        </Typography.Title>
        <Typography.Text type="secondary">MVP：待办与习惯，先打通“列表/新增/状态更新/审计”。</Typography.Text>
      </Card>

      <Card size="small">
        <Tabs
          defaultActiveKey="todos"
          items={[
            {
              key: "todos",
              label: "待办",
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
            }
          ]}
        />
      </Card>
    </Space>
  );
}

