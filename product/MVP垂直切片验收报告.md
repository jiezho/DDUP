# 个人上下文智能工作台：MVP 垂直切片验收报告

> 版本：V1.1  
> 日期：2026-08-24  
> 状态：已确认（确认门 G4 通过）  
> 确认记录：2026-08-25，G4-1–G4-5 全部采用推荐项  
> 验收范围：S3 本地、单用户、虚构数据垂直切片  
> 重要说明：本报告验收的是“可运行垂直切片”，不是完整 MVP、生产发布或真实数据接入验收

## 0. G4 已确认决定

| 决定 ID | 主题 | 已确认方案 | 替代方案 | 原不确认影响 |
|---|---|---|---|---|
| G4-1 | S3 垂直切片结论 | **通过：认定当前项目—讨论决策—任务—收件箱—今日—复盘链路达到本地虚构数据基线** | 退回 S3，指定需修复的阻塞问题后重验 | 不能把 S3 标为完成，也不进入上下文知识库实现 |
| G4-2 | 下一阶段 | **进入 S4：先设计并实现 Source/Knowledge/Context 的受控最小切片** | 暂停开发，仅保留当前演示基线 | 跨项目知识融合、引用搜索与问答继续停留在设计/旧基线能力 |
| G4-3 | Capture 边界 | **维持文本/HTTP(S) 链接安全子集；文件、图片、语音和 XLSX 必须经过 S4 受控 Source 管线及独立依赖确认** | 立即扩展上传/解析 | 会提前引入路径、类型、恶意文件、来源版本和 XLSX 高风险依赖问题 |
| G4-4 | 数据与部署边界 | **继续仅使用虚构数据和本地回环，不开放局域网/公网、不接真实个人或公司数据** | 提前接入真实数据或远程访问 | 必须先重新做身份、租户、传输、备份、威胁模型和合规评审 |
| G4-5 | AI 与 Runtime 边界 | **讨论转决策继续由人明确确认；Harness 保持隔离只读 POC 候选，Hermes 保持可选 Runtime/消息网关候选** | 现在接入 AI 自动决策或强绑定 Runtime | 当前尚无 Tool Gateway、Approval、Candidate 和 Runtime 验收证据，可能污染业务真源 |

确认结果：G4-1–G4-5 全部按推荐项生效，S3-06 完成，授权进入 S4；文件/XLSX、真实数据、远程访问和 Runtime 集成仍不在本次授权内。

---

## 1. 验收结论

建议 G4 **有边界通过**。

当前系统已用真实 SQLite 持久化和本地 Fastify API 跑通以下虚构数据链路：

> 创建项目 → 建立里程碑/任务 → 记录讨论 → 人工明确确认形成决策与任务 → 捕获文本/链接 → 今日选择最多三项重点 → 同步执行状态 → 明确填写日终复盘。

该链路刷新后不丢失，关键写入具备会话、CSRF、空间过滤、严格校验、幂等、乐观锁、事务 Audit/Outbox 和失败回滚。PC 与 390px 移动视口已经由真实浏览器走通。

G4 通过只表示可以把这条链路作为 S4 的稳定业务底座。它不表示文件导入、统一上下文知识库、引用问答、AI 审批、Runtime、备份恢复、连接器或生产安全已经完成。

## 2. 已验收能力

| 能力 | 已实现证据 | 当前边界 |
|---|---|---|
| 本地安全入口 | 回环绑定、Host/Origin/JSON、一次性 bootstrap、短期 Session、CSRF | 单用户本机；不是多用户身份系统 |
| Project | 创建、读取、编辑、状态流转、软删与 30 天恢复 | 只使用虚构数据 |
| Milestone/Task | 同项目关联、一层父任务、状态机、版本/幂等 | 尚无批量计划、复杂依赖和多人分派 |
| Discussion→Decision→Task | 明确勾选确认后原子转换；跨项目错误整体回滚 | 人工记录与确认，不是 AI 审批 |
| Capture Inbox | 文本/HTTP(S) 链接创建、筛选和状态流转 | 不抓取、不上传、不解析、不晋升长期知识 |
| Today | 聚合项目任务、选择最多三条任务引用、开始/完成/重开同步 | DailyPlan 不复制任务真源 |
| Daily Review | 总结、收获、阻塞、下一步的版本化持久化 | 仅用户输入，无 AI 草稿或自动改写 |
| 响应式 | Project、Capture、Today 的 PC/390px 真实浏览器流程 | 768/900px、弱网和全部旧页面仍待 S7 系统验收 |

## 3. 数据与契约证据

当前顺序迁移共 5 个：

1. foundation identity/space/project/audit/outbox/idempotency；
2. project milestones/tasks；
3. discussion/decision/task flow；
4. text/link capture inbox；
5. daily focus/review。

机器可读契约为 `person_dashboard-main/Workbench/shared/contracts/openapi.yaml` V1.4.0，覆盖当前已实现的基础、项目工作项、讨论决策、Capture 和 Daily 路由。领域对象、API、权限设计、追溯矩阵和实施计划已同步更新。

## 4. 验证结果

| 发布门 | 结果 | 说明 |
|---|---|---|
| `npm test` | **172/172 通过** | 0 失败、0 跳过；包含正式构建 |
| `npm run build` | **通过** | Vite 7414 modules；存在大 chunk 警告，不影响本次功能验收 |
| `npm run privacy:scan` | **通过** | 未发现受阻个人标识或凭据赋值 |
| Playwright E2E | **1/1 通过** | 完整合成业务链，PC 与 390px；外部网络被阻断 |
| 页面走查 | **通过本次范围** | 修复移动端悬浮搜索遮挡后重新截图复核 |

## 5. UI 证据

全部截图只含明确虚构数据：

- `research/screenshots/workbench-mvp/project-workbench-desktop.png`
- `research/screenshots/workbench-mvp/project-work-items-desktop.png`
- `research/screenshots/workbench-mvp/project-decision-flow-desktop.png`
- `research/screenshots/workbench-mvp/project-workbench-mobile.png`
- `research/screenshots/workbench-mvp/capture-inbox-desktop.png`
- `research/screenshots/workbench-mvp/capture-inbox-mobile.png`
- `research/screenshots/workbench-mvp/today-review-desktop.png`
- `research/screenshots/workbench-mvp/today-review-mobile.png`

界面已采用天蓝色主色和渐变，保留原项目的信息密度与知识工作台风格。正式页面正文、按钮、表单和移动布局按当前 Spec 渐进统一；高保真 `/prototype` 仍是设计参考，不等同正式持久化能力。

## 6. 未通过或不属于 G4 的范围

以下事项仍明确未实现或未完成，不应因 G4 通过而被描述为可用：

- Source/SourceVersion/Document/KnowledgeItem/Citation 与统一上下文融合；
- 权限优先的跨项目检索、混合检索、重排和带引用问答；
- KnowledgeCandidate/Approval/Tool Gateway 与 AI 写回治理；
- DeepSeek Harness 实际集成、Hermes 实际集成或生产 Runtime；
- 文件、图片、语音、网页正文抓取和 XLSX 导入；
- 通用 PolicyDecision、拒绝事件持久审计与完整审计 UI；
- 备份/恢复、保留期清理、故障恢复演练和远端 CI 运行证据；
- 全站可访问性、768/900px、弱网/PWA 与飞书/微信入口验收；
- 生产发布、远程访问、多用户及真实个人/公司数据安全评审；
- 前端大 chunk 优化。

旧版 `xlsx@0.18.5` 仍有 high 告警，发布门继续阻塞；其处置由 `旧版XLSX导入依赖处置_待确认.md` 单独确认，G4 不替代该授权。

## 7. G4 后建议执行顺序

1. 归档 G4 确认记录，冻结 S3 已实现 API 和对象边界；
2. 已生成并确认 `知识库检索与引用设计.md`，S4 Source/Knowledge/Context 最小模型与评测方法按 G5a 推荐项执行；
3. 建立受控 Markdown/文件 Source 导入垂直切片，保持 Capture 与长期知识分层；
4. 复用现有全文索引建立权限先行基线，再评估混合检索；
5. 用固定合成问题集验证引用定位、无证据拒答和跨项目范围解释；
6. 通过 G5a 后再实现引用问答，AI 写回仍留到 S5 的 Candidate/Approval 门。

## 8. 确认记录

- 确认日期：2026-08-25；
- 最终决定：G4-1–G4-5 全部采用推荐方案；
- 例外/附加条件：无；
- 下一阶段授权：进入 S4，依次完成受控 Source/Document、权限优先全文检索，并在混合检索与重排前进入 G5a 设计确认门。
