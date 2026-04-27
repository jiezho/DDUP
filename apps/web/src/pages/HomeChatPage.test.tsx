import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

import HomeChatPage from "./HomeChatPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders space selector", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    const u =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url instanceof Request
            ? url.url
            : String(url);
    if (u.endsWith("/healthz")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "ok" })
      } as unknown as Response;
    }
    if (u.endsWith("/api/spaces")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: "s1", name: "个人空间", type: "personal" }]
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch);

  render(
    <BrowserRouter>
      <HomeChatPage />
    </BrowserRouter>
  );

  await waitFor(() => expect(screen.getByText(/API:\s*ok/)).toBeInTheDocument());

  const combo = screen.getByRole("combobox");
  fireEvent.mouseDown(combo);
  expect(await screen.findByRole("option", { name: "个人空间（personal）" })).toBeInTheDocument();
});

test("can capture card to wiki", async () => {
  const calls: Array<{ url: string; body?: unknown }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u =
        typeof url === "string"
          ? url
          : url instanceof URL
            ? url.toString()
            : url instanceof Request
              ? url.url
              : String(url);

      if (init?.body) {
        try {
          calls.push({ url: u, body: JSON.parse(String(init.body)) });
        } catch {
          calls.push({ url: u });
        }
      } else {
        calls.push({ url: u });
      }

      if (u.endsWith("/healthz")) {
        return { ok: true, status: 200, json: async () => ({ status: "ok" }) } as unknown as Response;
      }
      if (u.endsWith("/api/spaces")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "s1", name: "个人空间", type: "personal" }]
        } as unknown as Response;
      }
      if (u.endsWith("/api/chat/sessions")) {
        return { ok: true, status: 200, json: async () => ({ id: "sid" }) } as unknown as Response;
      }
      if (u.includes("/api/chat/sessions/") && u.endsWith("/stream")) {
        const sse =
          "event: message.delta\n" +
          "data: {\"messageId\":\"m1\",\"delta\":\"hi\"}\n\n" +
          "event: card.add\n" +
          "data: {\"messageId\":\"m1\",\"card\":{\"type\":\"analysis\",\"data\":{\"summary\":\"hi\"}}}\n\n" +
          "event: done\n" +
          "data: {\"status\":\"ok\"}\n\n";
        const encoder = new TextEncoder();
        const chunks = [encoder.encode(sse)];
        let idx = 0;
        const body = {
          getReader() {
            return {
              async read() {
                if (idx >= chunks.length) return { done: true, value: undefined };
                const value = chunks[idx];
                idx += 1;
                return { done: false, value };
              }
            };
          }
        };
        return { ok: true, status: 200, body } as unknown as Response;
      }
      if (u.endsWith("/api/actions/execute")) {
        return { ok: true, status: 200, json: async () => ({ status: "ok" }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch
  );

  render(
    <BrowserRouter>
      <HomeChatPage />
    </BrowserRouter>
  );

  fireEvent.change(screen.getByPlaceholderText("给我……"), { target: { value: "ping" } });
  fireEvent.click(screen.getByRole("button", { name: /发\s*送/ }));

  await waitFor(() => expect(screen.getAllByText("hi").length).toBeGreaterThan(0));

  fireEvent.click(screen.getByRole("button", { name: "写入 Wiki" }));

  await waitFor(() => {
    const actionCall = calls.find((c) => c.url.endsWith("/api/actions/execute") && (c.body as any)?.type === "wiki.capture_raw");
    expect(actionCall).toBeTruthy();
  });
});
