import { Badge, Button, Card, Divider, Form, Input, List, Modal, Select, Space, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDisplayMode } from "../contexts/displayMode";
import { apiGet, apiPost, buildHeaders } from "../lib/api";

type Msg = { id?: string; role: "user" | "assistant"; text: string };
type SpaceItem = { id: string; name: string; type: string };
type ChatCard = { type: string; data: Record<string, unknown> };
type PendingItem = { kind: "todo" | "review" | "saved_feed" | "file_pending"; id: string; title: string; meta: string; route: string };
type DashboardSummary = { todo_open: number; review_due: number; saved_unread: number; file_pending: number; items: PendingItem[] };

export default function HomeChatPage() {
  const navigate = useNavigate();
  const { resolvedMode } = useDisplayMode();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "DDUP：请输入问题，我会调用系统能力返回结果卡（MVP 阶段先做基础链路）。" }
  ]);
  const [cardsByMessageId, setCardsByMessageId] = useState<Record<string, ChatCard[]>>({});
  const [apiStatus, setApiStatus] = useState<string>("unknown");
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [spaceId, setSpaceId] = useState<string>(() => localStorage.getItem("ddup.spaceId") || "");
  const [sessionId, setSessionId] = useState<string>(() => localStorage.getItem("ddup.sessionId") || "");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [termModalOpen, setTermModalOpen] = useState(false);
  const [entityModalOpen, setEntityModalOpen] = useState(false);
  const [todoForm] = Form.useForm<{ text: string }>();
  const [termForm] = Form.useForm<{ term: string; definition: string }>();
  const [entityForm] = Form.useForm<{ name: string; type: string }>();

  const canShowWorkbench = resolvedMode === "pc";

  const headersJson = useMemo(() => buildHeaders({ "Content-Type": "application/json" }), [spaceId]);

  const executeAction = async (type: string, payload: unknown) => {
    const t = type.trim();
    if (!t) return;
    await apiPost("/api/actions/execute", { type: t, payload: payload || {} });
  };

  const captureCardToWiki = async (msg: Msg, card: ChatCard) => {
    const title = typeof card.data.title === "string" && card.data.title.trim() ? card.data.title.trim() : `DDUP ${card.type}`;
    const summary = "summary" in card.data ? String(card.data.summary) : JSON.stringify(card.data);
    const content = `# ${title}\n\n${summary}\n\n---\n\n来源：DDUP 对话\nspace_id: ${spaceId || ""}\nsession_id: ${sessionId || ""}\nmessage_id: ${msg.id || ""}\n`;
    const tags = ["ddup", `card/${card.type}`];
    const sources = [`ddup:chat_session:${sessionId || ""}`, `ddup:chat_message:${msg.id || ""}`].filter((s) => !s.endsWith(":"));

    await executeAction("wiki.capture_raw", {
      title,
      kind: card.type,
      content,
      tags,
      sources,
      visibility: "internal"
    });
  };

  useEffect(() => {
    const run = async () => {
      try {
        const resp = await fetch("/healthz");
        if (!resp.ok) throw new Error("bad status");
        const json = (await resp.json()) as { status?: string };
        setApiStatus(json.status ?? "ok");
      } catch {
        setApiStatus("unreachable");
      }
    };
    run();
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const list = await apiGet<SpaceItem[]>("/api/spaces");
        setSpaces(list);
        if (!spaceId && list.length) {
          setSpaceId(list[0].id);
          localStorage.setItem("ddup.spaceId", list[0].id);
        }
      } catch {
        return;
      }
    };
    run();
  }, [spaceId]);

  const refreshSummary = async () => {
    setSummaryLoading(true);
    try {
      const s = await apiGet<DashboardSummary>("/api/dashboard/summary");
      setSummary(s);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!spaceId) return;
    refreshSummary().catch(() => null);
  }, [spaceId]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const tempAssistantKey = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setMsgs((prev) => [...prev, { role: "user", text }, { id: tempAssistantKey, role: "assistant", text: "…" }]);
    setInput("");

    const run = async () => {
      let sid = sessionId;
      const headers = headersJson;

      if (!sid) {
        const r = await fetch("/api/chat/sessions", { method: "POST", headers, body: JSON.stringify({ title: "" }) });
        if (!r.ok) throw new Error("create session failed");
        const json = (await r.json()) as { id: string };
        sid = json.id;
        setSessionId(sid);
        localStorage.setItem("ddup.sessionId", sid);
      }

      const resp = await fetch(`/api/chat/sessions/${sid}/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text })
      });
      if (!resp.ok || !resp.body) throw new Error("stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let assistantText = "";
      let assistantMessageId: string | null = null;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.replace("event:", "").trim();
          const raw = dataLine.replace("data:", "").trim();
          if (event === "message.delta") {
            try {
              const payload = JSON.parse(raw) as { messageId?: string; delta?: string };
              const messageId = payload.messageId;
              if (!assistantMessageId && messageId) {
                assistantMessageId = messageId;
                setMsgs((prev) =>
                  prev.map((m) => (m.id === tempAssistantKey ? { ...m, id: assistantMessageId || m.id } : m))
                );
              }
              assistantText += payload.delta || "";
              setMsgs((prev) => {
                const next = [...prev];
                const idx = next.map((m) => m.role).lastIndexOf("assistant");
                if (idx >= 0) next[idx] = { ...next[idx], text: assistantText };
                return next;
              });
            } catch {
              continue;
            }
          }
          if (event === "card.add") {
            try {
              const payload = JSON.parse(raw) as { messageId?: string; card?: ChatCard };
              if (!payload.messageId || !payload.card) continue;
              setCardsByMessageId((prev) => {
                const existing = prev[payload.messageId || ""] || [];
                return { ...prev, [payload.messageId || ""]: [...existing, payload.card as ChatCard] };
              });
            } catch {
              continue;
            }
          }
        }
      }
    };

    run().catch(() => {
      setMsgs((prev) => {
        const next = [...prev];
        const idx = next.map((m) => m.role).lastIndexOf("assistant");
        if (idx >= 0) next[idx] = { ...next[idx], text: "请求失败（请检查后端是否启动）" };
        return next;
      });
    });
  };

  const openTodoFromText = (text: string) => {
    todoForm.setFieldsValue({ text: text.trim().slice(0, 500) });
    setTodoModalOpen(true);
  };

  const openTermFromText = (text: string) => {
    const cleaned = text.trim();
    const firstLine = cleaned.split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
    termForm.setFieldsValue({ term: firstLine.slice(0, 200), definition: cleaned.slice(0, 2000) });
    setTermModalOpen(true);
  };

  const openEntityFromText = (text: string) => {
    const cleaned = text.trim();
    const firstLine = cleaned.split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
    entityForm.setFieldsValue({ name: firstLine.slice(0, 200), type: "Concept" });
    setEntityModalOpen(true);
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Typography.Text type={apiStatus === "ok" ? "success" : "secondary"}>API: {apiStatus}</Typography.Text>
          <Select
            size="small"
            value={spaceId || undefined}
            style={{ minWidth: 160 }}
            placeholder="选择空间"
            options={spaces.map((s) => ({ value: s.id, label: `${s.name}（${s.type}）` }))}
            onChange={(v) => {
              setSpaceId(v);
              localStorage.setItem("ddup.spaceId", v);
            }}
          />
        </Space>
      </Card>
      {canShowWorkbench ? (
        <Card size="small" title="工作台" loading={summaryLoading}>
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Space wrap>
              <Badge count={summary?.todo_open ?? 0} showZero>
                <Button onClick={() => navigate("/assistant")}>待办</Button>
              </Badge>
              <Badge count={summary?.review_due ?? 0} showZero>
                <Button onClick={() => navigate("/learning")}>待复习</Button>
              </Badge>
              <Badge count={summary?.saved_unread ?? 0} showZero>
                <Button onClick={() => navigate("/resources?tab=saved")}>稍后读</Button>
              </Badge>
              <Badge count={summary?.file_pending ?? 0} showZero>
                <Button onClick={() => navigate("/resources?tab=files")}>待归档</Button>
              </Badge>
              <Button size="small" onClick={() => refreshSummary().catch(() => null)}>
                刷新
              </Button>
            </Space>
            <Divider style={{ margin: "4px 0" }} />
            <Space wrap>
              <Button onClick={() => navigate("/resources")}>添加资讯源</Button>
              <Button onClick={() => navigate("/assistant")}>快速记录灵感</Button>
              <Button
                onClick={() => {
                  message.info("计划模块即将上线");
                }}
              >
                创建计划
              </Button>
              <Button
                onClick={() => {
                  message.info("导入 PDF 即将上线");
                }}
              >
                扫描导入 PDF
              </Button>
            </Space>
            <Card size="small" title="今日待处理">
              <List
                size="small"
                dataSource={summary?.items || []}
                locale={{ emptyText: "暂无待处理项" }}
                renderItem={(it) => (
                  <List.Item
                    actions={[
                      <Button key="go" size="small" onClick={() => navigate(it.route)}>
                        去处理
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={8}>
                          <Tag>{it.meta || it.kind}</Tag>
                          <Typography.Text>{it.title}</Typography.Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        </Card>
      ) : null}
      <Card title="对话" size="small">
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          {msgs.map((m, idx) => (
            <Card key={idx} size="small" className={m.role === "user" ? "ddup-msg ddup-msg--user" : "ddup-msg ddup-msg--assistant"}>
              <Typography.Text strong>{m.role === "user" ? "你" : "AI"}：</Typography.Text>{" "}
              <Typography.Text>{m.text}</Typography.Text>
              {m.role === "assistant" && m.text && m.text !== "…" ? (
                <Space style={{ marginTop: 8 }} wrap>
                  <Button size="small" onClick={() => openTodoFromText(m.text)}>
                    转待办
                  </Button>
                  <Button size="small" onClick={() => openTermFromText(m.text)}>
                    加入学习
                  </Button>
                  <Button size="small" onClick={() => openEntityFromText(m.text)}>
                    写入图谱
                  </Button>
                </Space>
              ) : null}
              {m.id && cardsByMessageId[m.id]?.length ? (
                <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size={8}>
                  {cardsByMessageId[m.id].map((c, cidx) => (
                    <Card key={cidx} size="small">
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Tag>{c.type}</Tag>
                        <Button
                          size="small"
                          onClick={() => {
                            if (m.role !== "assistant") return;
                            captureCardToWiki(m, c)
                              .then(() => message.success("已写入 Wiki 暂存区"))
                              .catch((e: unknown) => message.error((e as Error).message || "写入失败"));
                          }}
                        >
                          写入 Wiki
                        </Button>
                      </Space>
                      {"summary" in c.data ? (
                        <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                          {String(c.data.summary)}
                        </Typography.Paragraph>
                      ) : (
                        <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                          {JSON.stringify(c.data)}
                        </Typography.Paragraph>
                      )}
                      {"actions" in c.data && Array.isArray(c.data.actions) ? (
                        <Space style={{ marginTop: 8 }} wrap>
                          {(c.data.actions as Array<{ type?: string; label?: string; payload?: unknown }>).map(
                            (a, aidx) => (
                              <Button
                                key={aidx}
                                size="small"
                                onClick={() => {
                                  const type = String(a.type || "");
                                  if (!type) return;
                                  executeAction(type, a.payload || {}).catch(() => null);
                                }}
                              >
                                {a.label || a.type}
                              </Button>
                            )
                          )}
                        </Space>
                      ) : null}
                    </Card>
                  ))}
                </Space>
              ) : null}
            </Card>
          ))}
        </Space>
      </Card>
      <Card size="small">
        <Space.Compact style={{ width: "100%" }}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={send}
            placeholder="给我……"
          />
          <Button type="primary" onClick={send}>
            发送
          </Button>
        </Space.Compact>
      </Card>
      <Modal
        title="转为待办"
        open={todoModalOpen}
        okText="创建"
        onCancel={() => setTodoModalOpen(false)}
        onOk={async () => {
          const v = await todoForm.validateFields();
          await executeAction("todo.create", { text: v.text });
          setTodoModalOpen(false);
          message.success("已创建待办");
          refreshSummary().catch(() => null);
        }}
      >
        <Form form={todoForm} layout="vertical">
          <Form.Item name="text" label="待办内容" rules={[{ required: true, message: "请输入待办内容" }]}>
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="加入学习（术语库）"
        open={termModalOpen}
        okText="创建"
        onCancel={() => setTermModalOpen(false)}
        onOk={async () => {
          const v = await termForm.validateFields();
          await executeAction("term.create", { term: v.term, definition: v.definition, source: "chat" });
          setTermModalOpen(false);
          message.success("已加入术语库");
          refreshSummary().catch(() => null);
        }}
      >
        <Form form={termForm} layout="vertical">
          <Form.Item name="term" label="术语" rules={[{ required: true, message: "请输入术语" }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="definition" label="解释">
            <Input.TextArea rows={5} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="写入图谱（创建实体）"
        open={entityModalOpen}
        okText="创建"
        onCancel={() => setEntityModalOpen(false)}
        onOk={async () => {
          const v = await entityForm.validateFields();
          await executeAction("graph.entity.create", { name: v.name, type: v.type });
          setEntityModalOpen(false);
          message.success("已创建实体");
        }}
      >
        <Form form={entityForm} layout="vertical">
          <Form.Item name="name" label="实体名称" rules={[{ required: true, message: "请输入实体名称" }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: "请输入类型" }]}>
            <Input maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

