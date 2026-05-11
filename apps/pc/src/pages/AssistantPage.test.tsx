import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import AssistantPage from "./AssistantPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders assistant tabs and loads data", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url instanceof Request ? url.url : String(url);
    if (u.endsWith("/api/assistant/todos")) {
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    }
    if (u.endsWith("/api/assistant/habits")) {
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    }
    if (u.endsWith("/api/assistant/ideas")) {
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch);

  render(<AssistantPage />);

  await waitFor(() => expect(screen.getByText("待办清单")).toBeInTheDocument());
  expect(screen.getByText("习惯")).toBeInTheDocument();
  expect(screen.getByText("灵感收件箱")).toBeInTheDocument();
});

test("opens idea drawer and saves edits", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url instanceof Request ? url.url : String(url);
      const method = (init?.method || "GET").toUpperCase();

      if (u.endsWith("/api/assistant/todos")) {
        return { ok: true, status: 200, json: async () => [] } as unknown as Response;
      }
      if (u.endsWith("/api/assistant/habits")) {
        return { ok: true, status: 200, json: async () => [] } as unknown as Response;
      }
      if (u.endsWith("/api/assistant/ideas") && method === "GET") {
        return { ok: true, status: 200, json: async () => [{ id: "i1", content: "an idea", tags: "a,b" }] } as unknown as Response;
      }
      if (u.endsWith("/api/assistant/ideas/i1") && method === "GET") {
        return { ok: true, status: 200, json: async () => ({ id: "i1", content: "an idea", tags: "a,b" }) } as unknown as Response;
      }
      if (u.endsWith("/api/assistant/ideas/i1") && method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ id: "i1", content: "updated", tags: null }) } as unknown as Response;
      }
      if (u.endsWith("/api/assistant/ideas/i1") && method === "DELETE") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch
  );

  render(<AssistantPage />);

  await waitFor(() => expect(screen.getByText("灵感收件箱")).toBeInTheDocument());
  fireEvent.click(screen.getByText("灵感收件箱"));

  await waitFor(() => expect(screen.getByText("an idea")).toBeInTheDocument());
  fireEvent.click(screen.getByText("an idea"));

  await waitFor(() => expect(screen.getByText("灵感详情")).toBeInTheDocument());

  const contentBox = screen.getByDisplayValue("an idea");
  const tagBox = screen.getByDisplayValue("a,b");

  fireEvent.change(contentBox, { target: { value: "updated" } });
  fireEvent.change(tagBox, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));

  await waitFor(() => expect(screen.getByDisplayValue("updated")).toBeInTheDocument());
});

