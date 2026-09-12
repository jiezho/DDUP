# 当前状态

- 当前阶段：G1–G6b 已确认；G6a 已完成隔离 POC 并按 Windows Runtime Stop 收口；G6b-P1 已完成供应链与启动面审查并在安装前 Stop。
- 已实现首版：Project/Milestone/Task、人工 Discussion→Decision→Task、文本/链接 Capture、Today/DailyReview、受控 Markdown Source 不可变版本/归档恢复/精确原文读取、权限优先 FTS5、显式 ContextPackage、派生 Citation Manifest、持久化 AnswerAttempt 安全检查、默认本地保守直接引文 Answer/Claim/Citation 真源与逐句蕴含门、`native-v1` Run 生命周期、Task/Knowledge/Decision Candidate、差异预览、L2 审批/应用、安全撤销、Policy/审计 UI、SSE、Checkpoint、本地一致性备份与离线空目录恢复。
- 实验状态：受保护混合检索默认关闭；160/40 字符窗口在冻结 21 条边界集达到 Recall/Top-1 100%，120 次本地耐久切片无异常，但真实数据、冷启动预算和多日稳定尚未验证，BGE-M3 仍不进入生产默认路径。
- 未实现：开放式改写/推理回答及其通用 NLI 模型评测、Markdown/XLSX 之外的来源格式、Runtime 私有 resume/steer、专业工作台、飞书连接器和发布演练。当前 Answer 只允许固定证据中的直接引文，不应描述为通用生成式问答或事实核验。
- 验证：2026-09-11 在 Node 24.19 下完成生产构建、265/265 测试、隐私扫描、`npm audit --omit=dev` 0 漏洞、Windows SQLite 10 万对象/100 万关系全规模门；Chromium/Firefox/WebKit 关键业务流程各 1/1，390/768/900、键盘/触控/弱网和生产 PWA 静态离线壳/API 不缓存边界通过。构建仍有主包大于 500 kB 的非阻塞提示。
- 最新 UI 证据：`research/screenshots/workbench-mvp/context-library-*.png`、`runtime-center-*.png` 及 Project/Capture/Today 对应桌面与移动截图。
- 待确认/阻塞：Hermes 若要采用补丁分支、容器化或更新固定版本，需进入新的确认门；真实平台、真实数据、新生产依赖和发布决定仍未授权。P0/P1 已推送到 `codex/p0-p1-complete`，2026-09-12 GitHub Actions Windows/Linux、SQLite 与三浏览器 7/7 通过。
- 工作树提示：`experiments/hermes-poc/` 当前存在 196,761,435 字节、6,172 个未提交下载/解压文件；来源和逐文件完整性已通过，但当前版本/依赖公告及默认完整宿主工具面触发 G6b-P1 Stop。目录未安装、未运行、未提交，Hermes 不得标记为已连接。
- 代码管理：P0/P1 远端分支为 `codex/p0-p1-complete`，正式远端目标为 `https://github.com/jiezho/DDUP.git`；本轮 G6b 确认与审计文档尚未获提交/推送授权。
