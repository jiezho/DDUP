import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from "react";

export type DisplayMode = "auto" | "pc" | "h5";
export type ResolvedMode = "pc" | "h5";

type DisplayModeContextValue = {
  displayMode: DisplayMode;
  resolvedMode: ResolvedMode;
  setDisplayMode: (next: DisplayMode) => void;
};

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

const STORAGE_KEY = "ddup.displayMode";

const parseStoredMode = (raw: string | null): DisplayMode => {
  if (raw === "pc" || raw === "h5" || raw === "auto") return raw;
  return "auto";
};

const resolveMode = (displayMode: DisplayMode, width: number): ResolvedMode => {
  if (displayMode === "pc" || displayMode === "h5") return displayMode;
  return width >= 1024 ? "pc" : "h5";
};

export function DisplayModeProvider({ children }: PropsWithChildren) {
  const [displayMode, setDisplayModeState] = useState<DisplayMode>(() => parseStoredMode(localStorage.getItem(STORAGE_KEY)));
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1024));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, displayMode);
  }, [displayMode]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const resolvedMode = useMemo(() => resolveMode(displayMode, viewportWidth), [displayMode, viewportWidth]);

  useEffect(() => {
    document.documentElement.dataset.ddupMode = resolvedMode;
    document.documentElement.dataset.ddupDisplayMode = displayMode;
  }, [displayMode, resolvedMode]);

  const value = useMemo<DisplayModeContextValue>(
    () => ({
      displayMode,
      resolvedMode,
      setDisplayMode: setDisplayModeState
    }),
    [displayMode, resolvedMode]
  );

  return <DisplayModeContext.Provider value={value}>{children}</DisplayModeContext.Provider>;
}

export function useDisplayMode(): DisplayModeContextValue {
  const ctx = useContext(DisplayModeContext);
  if (!ctx) throw new Error("useDisplayMode must be used within DisplayModeProvider");
  return ctx;
}

