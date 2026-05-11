import { Navigate, Route, Routes } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import type React from "react";

import AppLayout from "./layouts/AppLayout";
import AssistantPage from "./pages/AssistantPage";
import HomeChatPage from "./pages/HomeChatPage";
import LearningPage from "./pages/LearningPage";
import MePage from "./pages/MePage";
import ResourcesPage from "./pages/ResourcesPage";
import { DisplayModeProvider, useDisplayMode } from "@ddup/shared/contexts/displayMode";

function ThemedConfigProvider({ children }: { children: React.ReactNode }) {
  const { resolvedMode } = useDisplayMode();
  const isPc = resolvedMode === "pc";

  const baseToken = {
    colorPrimary: "#1b7f5a",
    colorInfo: "#1b7f5a",
    colorSuccess: "#16a34a",
    colorWarning: "#d97706",
    colorError: "#dc2626",
    colorBgLayout: "#f7f3e8",
    colorBgContainer: "#ffffff",
    colorBorderSecondary: "rgba(15, 23, 42, 0.12)",
    colorTextBase: "#0f172a",
    colorTextSecondary: "rgba(15, 23, 42, 0.70)",
    borderRadius: 12,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, Liberation Sans, sans-serif"
  } as const;

  return (
    <ConfigProvider
      theme={
        isPc
          ? {
              algorithm: theme.defaultAlgorithm,
              token: {
                ...baseToken,
                borderRadius: 12
              }
            }
          : {
              token: {
                ...baseToken,
                colorBgLayout: "#f8fafc",
                borderRadius: 14
              }
            }
      }
    >
      {children}
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <DisplayModeProvider>
      <ThemedConfigProvider>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomeChatPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/me" element={<MePage />} />
          </Routes>
        </AppLayout>
      </ThemedConfigProvider>
    </DisplayModeProvider>
  );
}
