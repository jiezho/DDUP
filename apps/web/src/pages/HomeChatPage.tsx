import { Button, Card, Input, Space, Typography } from "antd";
import { useEffect, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };

export default function HomeChatPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "DDUP：请输入问题，我会调用系统能力返回结果卡（MVP 阶段先做基础链路）。" }
  ]);
  const [apiStatus, setApiStatus] = useState<string>("unknown");

  useEffect(() => {
    const run = async () => {
      try {
        const resp = await fetch("/api/healthz");
        if (!resp.ok) throw new Error("bad status");
        const json = (await resp.json()) as { status?: string };
        setApiStatus(json.status ?? "ok");
      } catch {
        setApiStatus("unreachable");
      }
    };
    run();
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMsgs((prev) => [...prev, { role: "user", text }, { role: "assistant", text: "已收到（占位响应）。" }]);
    setInput("");
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>
      <Card size="small">
        <Typography.Text type={apiStatus === "ok" ? "success" : "secondary"}>
          API: {apiStatus}
        </Typography.Text>
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

