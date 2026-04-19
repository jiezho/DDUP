import { Button, Card, Input, Select, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

type Msg = { id?: string; role: "user" | "assistant"; text: string };
type SpaceItem = { id: string; name: string; type: string };
type ChatCard = { type: string; data: Record<string, unknown> };

export default function HomeChatPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "DDUP：请输入问题，我会调用系统能力返回结果卡（MVP 阶段先做基础链路）。" }
  ]);
  const [cardsByMessageId, setCardsByMessageId] = useState<Record<string, ChatCard[]>>({});
  const [apiStatus, setApiStatus] = useState<string>("unknown");
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [spaceId, setSpaceId] = useState<string>(() => localStorage.getItem("ddup.spaceId") || "");
  const [sessionId, setSessionId] = useState<string>(() => localStorage.getItem("ddup.sessionId") || "");
  const userId = "dev-user";

  const buildHeaders = (withJson: boolean): Record<string, string> => {
    const headers: Record<string, string> = { "X-User-Id": userId };
    if (spaceId) headers["X-Space-Id"] = spaceId;
    if (withJson) headers["Content-Type"] = "application/json";
    return headers;
  };

  const executeAction = (type: string, payload: unknown) => {
    const t = type.trim();
    if (!t) return;
    fetch("/api/actions/execute", {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({ type: t, payload: payload || {} })
    }).catch(() => null);
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
        const resp = await fetch("/api/spaces", { headers: { "X-User-Id": userId } });
        if (!resp.ok) return;
        const list = (await resp.json()) as SpaceItem[];
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

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const tempAssistantKey = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setMsgs((prev) => [...prev, { role: "user", text }, { id: tempAssistantKey, role: "assistant", text: "…" }]);
    setInput("");

    const run = async () => {
      let sid = sessionId;
      const headers = buildHeaders(true);

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
      <Card title="对话" size="small">
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          {msgs.map((m, idx) => (
            <Card key={idx} size="small" style={{ background: m.role === "user" ? "#f6ffed" : "#fafafa" }}>
              <Typography.Text strong>{m.role === "user" ? "你" : "AI"}：</Typography.Text>{" "}
              <Typography.Text>{m.text}</Typography.Text>
              {m.id && cardsByMessageId[m.id]?.length ? (
                <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size={8}>
                  {cardsByMessageId[m.id].map((c, cidx) => (
                    <Card key={cidx} size="small">
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Tag>{c.type}</Tag>
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
                                  executeAction(type, a.payload || {});
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
    </Space>
  );
}

