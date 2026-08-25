# 当前状态

- 当前阶段：G1–G4 已按推荐项确认；核心项目垂直闭环已验收，进入 S4 个人上下文知识库。
- 已实现：受控虚构 Markdown 导入、Source/SourceVersion/Document、Project/Task/Capture/Document 统一 FTS5 检索及空间/项目/类型/日期过滤。
- G5a《知识库检索与引用设计》已于 2026-08-25 全部按推荐项确认；下一步是离线适配器、合成评测集和模型/依赖专项审查。
- 验证：测试 178/178、生产构建、隐私扫描、Playwright Chromium 1/1 通过。
- 最新 UI 证据：`research/screenshots/workbench-mvp/context-library-desktop.png`、`context-library-mobile.png`。
- 真实边界：混合/向量检索、重排、引用问答、Harness 和 Hermes 均未接入。
- 独立待确认：旧版 XLSX 依赖处置；模型下载和新增生产依赖也需后续专项确认。
- 代码管理：本地 `main`/正式远端目标为 `https://github.com/jiezho/DDUP.git`；根 README 负责总体方案与文档导航。
