# 当前状态

- 当前阶段：P0/P1、WP0–WP5 首版均已完成；`c0159cb` 已推送并于 2026-09-14 取得 GitHub Actions 7/7 当前提交远端证据。现进入 G7 设计确认与 S8 发布准备。
- 已实现首版：Project/Milestone/Task、人工 Discussion→Decision→Task、文本/链接 Capture、Today/DailyReview、受控 Markdown Source 不可变版本/归档恢复/精确原文读取、权限优先 FTS5、显式 ContextPackage、派生 Citation Manifest、持久化 AnswerAttempt 安全检查、默认本地保守直接引文 Answer/Claim/Citation 真源与逐句蕴含门、`native-v1` Run 生命周期、Task/Knowledge/Decision Candidate、差异预览、L2 审批/应用、安全撤销、Policy/审计 UI、SSE、Checkpoint、本地一致性备份与离线空目录恢复，以及科研问题/实验/精确证据 Claim、AI 机会/指标评测/Go-Stop、前沿专题/固定来源信号、学习方向/练习反馈和轻量习惯打卡。
- 实验状态：受保护混合检索默认关闭；160/40 字符窗口在冻结 21 条边界集达到 Recall/Top-1 100%，120 次本地耐久切片无异常，但真实数据、冷启动预算和多日稳定尚未验证，BGE-M3 仍不进入生产默认路径。
- 未实现：开放式改写/推理回答及其通用 NLI 模型评测、Markdown/XLSX 之外的来源格式、Runtime 私有 resume/steer、在线前沿抓取/自动聚类/订阅、学习音频/模型评分、飞书连接器和完整发布演练。当前 Answer 只允许固定证据中的直接引文；Research Claim、Radar Signal 与学习反馈都是用户明确记录，不应描述为自动事实核验或模型评价。
- 验证：2026-09-14 S8 提交 `340c1b9` 在 Node 24.19 下完成独立生产构建、273/273 测试、隐私扫描和本地轻量性能预算；恢复已增加先完整校验、隔离暂存、SQLite quick check 和原子落盘，专项 3/3 通过。对应 GitHub Actions 首次因既有 Reader 并发测试清理临时目录的竞态为 6/7，未改代码重试后 Windows/Linux、双平台 SQLite 与 Chromium/Firefox/WebKit 7/7 通过。构建仍有 1.55 MB JS 主包的非阻塞提示。
- 最新 UI 证据：`research/screenshots/workbench-mvp/professional-workbench-*.png`、`growth-workbench-*.png`，以及 Context/Runtime/Project/Capture/Today 对应桌面与移动截图。
- 待确认/阻塞：`飞书连接器与权限设计_待确认.md` 已形成，G7a/G7b 尚未确认，因此未创建真实应用、未申请权限、未写入凭据、未发送消息。Hermes 若要采用补丁分支、容器化或更新固定版本，需进入新的确认门；真实数据、新生产依赖、脱敏试运行和 G8 发布决定仍未授权。合并 `main` 尚未执行。
- 工作树提示：`experiments/hermes-poc/` 当前存在 196,761,435 字节、6,172 个未提交下载/解压文件；来源和逐文件完整性已通过，但当前版本/依赖公告及默认完整宿主工具面触发 G6b-P1 Stop。目录未安装、未运行、未提交，Hermes 不得标记为已连接。
- 代码管理：当前远端分支为 `codex/p0-p1-complete`，正式远端目标为 `https://github.com/jiezho/DDUP.git`；WP0–WP5 基线 `c0159cb` 与 G7/S8 提交 `340c1b9` 均已推送，最新远端流水线为 `https://github.com/jiezho/DDUP/actions/runs/34803885496`，重试后 7/7 通过。`experiments/hermes-poc/` 继续保持未跟踪和排除。
