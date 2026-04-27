import { Navigate, Route, Routes } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import type React from "react";

import AppLayout from "./layouts/AppLayout";
import AssistantPage from "./pages/AssistantPage";
import HomeChatPage from "./pages/HomeChatPage";
import LearningPage from "./pages/LearningPage";
import MePage from "./pages/MePage";
import ResourcesPage from "./pages/ResourcesPage";
import { DisplayModeProvider, useDisplayMode } from "./contexts/displayMode";

function ThemedConfigProvider({ children }: { children: React.ReactNode }) {
  const { resolvedMode } = useDisplayMode();
  const isPc = resolvedMode === "pc";

  return (
    <ConfigProvider
      theme={
        isPc
          ? {
              algorithm: theme.darkAlgorithm,
              token: {
                colorPrimary: "#5B8CFF",
                colorBgBase: "#0B1220",
                colorBgContainer: "rgba(255,255,255,0.06)",
                colorBorderSecondary: "rgba(255,255,255,0.14)",
                borderRadius: 12,
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, Liberation Sans, sans-serif"
              }
            }
          : {
              token: {
                colorPrimary: "#5B8CFF",
                borderRadius: 12,
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, Liberation Sans, sans-serif"
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

