import { Button, Card, Input, Select, Space, Typography } from "antd";
import { useEffect, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };
type SpaceItem = { id: string; name: string; type: string };

export default function HomeChatPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "DDUP：请输入问题，我会调用系统能力返回结果卡（MVP 阶段先做基础链路）。" }
  ]);
  const [apiStatus, setApiStatus] = useState<string>("unknown");
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [spaceId, setSpaceId] = useState<string>(() => localStorage.getItem("ddup.spaceId") || "");
  const [sessionId, setSessionId] = useState<string>(() => localStorage.getItem("ddup.sessionId") || "");
  const userId = "dev-user";

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
    setMsgs((prev) => [...prev, { role: "user", text }, { role: "assistant", text: "…" }]);
    setInput("");

    const run = async () => {
      let sid = sessionId;
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-User-Id": userId };
      if (spaceId) headers["X-Space-Id"] = spaceId;

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
              const payload = JSON.parse(raw) as { delta?: string };
              assistantText += payload.delta || "";
              setMsgs((prev) => {
                const next = [...prev];
                const idx = next.map((m) => m.role).lastIndexOf("assistant");
                if (idx >= 0) next[idx] = { role: "assistant", text: assistantText };
                return next;
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
        if (idx >= 0) next[idx] = { role: "assistant", text: "请求失败（请检查后端是否启动）" };
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

