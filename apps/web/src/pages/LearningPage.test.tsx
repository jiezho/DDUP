import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import LearningPage from "./LearningPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders terms page and loads list", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url instanceof Request ? url.url : String(url);
    if (u.endsWith("/api/learning/terms")) {
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch);

  render(<LearningPage />);

  expect(screen.getByText("新增术语")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("术语列表")).toBeInTheDocument());
});

