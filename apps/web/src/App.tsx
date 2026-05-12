import { Navigate, Route, Routes } from "react-router-dom";
import { ConfigProvider } from "antd";
import type React from "react";

import AppLayout from "./layouts/AppLayout";
import AssistantPage from "./pages/AssistantPage";
import HomeChatPage from "./pages/HomeChatPage";
import LearningPage from "./pages/LearningPage";
import MePage from "./pages/MePage";
import HermesPage from "./pages/HermesPage";
import ResourcesPage from "./pages/ResourcesPage";
import { DisplayModeProvider, useDisplayMode } from "./contexts/displayMode";
import { getDdupTheme } from "@ddup/shared/lib/theme";

function ThemedConfigProvider({ children }: { children: React.ReactNode }) {
  const { resolvedMode } = useDisplayMode();

  return (
    <ConfigProvider theme={getDdupTheme(resolvedMode === "pc")}>
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
            <Route path="/me/hermes" element={<HermesPage />} />
            <Route path="/me" element={<MePage />} />
          </Routes>
        </AppLayout>
      </ThemedConfigProvider>
    </DisplayModeProvider>
  );
}
