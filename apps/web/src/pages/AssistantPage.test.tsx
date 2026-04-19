import { render, screen, waitFor } from "@testing-library/react";
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
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch);

  render(<AssistantPage />);

  expect(screen.getByText("助手")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("待办")).toBeInTheDocument());
  expect(screen.getByText("习惯")).toBeInTheDocument();
});

