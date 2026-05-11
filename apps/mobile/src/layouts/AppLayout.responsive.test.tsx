import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "../App";

const setWidth = (w: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
  window.dispatchEvent(new Event("resize"));
};

describe("AppLayout responsive shells", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders PC shell when displayMode=pc", () => {
    localStorage.setItem("ddup.displayMode", "pc");
    setWidth(375);

    act(() => {
      render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
      );
    });

    expect(screen.getAllByText("DDUP").length).toBeGreaterThan(0);
    expect(screen.queryByText("首页")).toBeInTheDocument();
  });

  it("renders H5 shell when displayMode=h5", () => {
    localStorage.setItem("ddup.displayMode", "h5");
    setWidth(1440);

    act(() => {
      render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
      );
    });

    expect(screen.getAllByText("对话").length).toBeGreaterThan(0);
    expect(screen.queryByText("DDUP")).not.toBeInTheDocument();
  });

  it("auto mode switches shells on resize", async () => {
    localStorage.setItem("ddup.displayMode", "auto");
    setWidth(1200);

    await act(async () => {
      render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
      );
    });

    expect(screen.getAllByText("DDUP").length).toBeGreaterThan(0);

    await act(async () => {
      setWidth(390);
    });

    expect(screen.queryByText("DDUP")).not.toBeInTheDocument();
  });
});
