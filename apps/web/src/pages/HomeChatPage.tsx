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
    setMsgs((prev) => [...prev, { role: "user", text }, { role: "assistant", text: "已收到（占位响应）。" }]);
    setInput("");
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

