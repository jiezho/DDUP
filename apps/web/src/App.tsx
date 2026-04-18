import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./layouts/AppLayout";
import AssistantPage from "./pages/AssistantPage";
import HomeChatPage from "./pages/HomeChatPage";
import LearningPage from "./pages/LearningPage";
import MePage from "./pages/MePage";
import ResourcesPage from "./pages/ResourcesPage";

export default function App() {
  return (
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
  );
}

