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

