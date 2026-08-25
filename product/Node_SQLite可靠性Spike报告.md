# Node SQLite 可靠性 Spike 报告

> 版本：V1.0  
> 日期：2026-08-24  
> 状态：Windows 阶段通过；Linux/CI 阶段待执行  
> 对应决策：G2 A5、A7；ADR-002、ADR-003  
> 结论边界：本报告验证技术可行性，不代表正式业务 Schema、Repository 或生产数据迁移已完成

## 1. 结论

在 Windows x64、Node.js v24.19.0 的本地临时目录中，`node:sqlite` 通过本阶段全部 9 类检查，并完成 100,000 个合成对象、1,000,000 条合成关系的完整规模运行。

因此维持 G2 决定：

- `node:sqlite` 继续作为 MVP 结构化存储候选；
- 必须通过 Repository 隔离，不允许领域代码直接依赖具体 API；
- SQLite FTS5 + trigram 继续作为中文全文基线；
- 在 Linux CI、正式迁移/Repository 合约、备份恢复演练完成前，状态仍是“有退出策略的技术候选”，不描述为生产可用。

本次没有创建正式 `.workbench` 数据库，没有读取个人知识库，也没有使用真实公司或个人数据。所有记录均为明确的合成文本，测试目录在完成后自动清理。

## 2. 可复现入口

脚本：`person_dashboard-main/Workbench/scripts/spikes/sqlite-reliability.mjs`

```text
npm run spike:sqlite
npm run spike:sqlite:full
```

- 快速模式：10,000 对象、50,000 关系；适合日常兼容性检查。
- 完整模式：100,000 对象、1,000,000 关系；适合 Node 补丁版本、系统或存储策略变化后的验证。
- 脚本仅使用 Node 内置模块，不新增生产或开发依赖。

## 3. 环境

| 项目 | 值 |
|---|---|
| 操作系统 | Windows x64 |
| Node.js | v24.19.0 |
| SQLite 接口 | Node 内置 `node:sqlite`、`DatabaseSync`、`backup` |
| 数据目录 | 系统临时目录下随机 `workbench-sqlite-spike-*` |
| Journal | WAL |
| Synchronous | FULL |
| Foreign keys | ON |
| Defensive mode | ON |
| Extension loading | 禁止 |

## 4. 验证结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 运行参数 | 通过 | WAL、foreign keys、defensive mode 均启用 |
| 事务与约束 | 通过 | 唯一约束失败后事务完整回滚；悬空外键被拒绝 |
| 中文全文检索 | 通过 | 查询“知识库”命中“个人上下文知识库” |
| WAL 读可见性 | 通过 | 写事务未提交时读连接看到旧状态；提交后看到新状态 |
| 异常进程退出 | 通过 | 子进程在未提交事务中退出，记录未落库且 `integrity_check=ok` |
| 合成规模 | 通过 | 100,000 对象、1,000,000 关系，数量断言一致 |
| 在线备份与恢复 | 通过 | Node `backup()` 生成一致副本；新路径恢复数量一致且完整性通过 |
| 损坏检测 | 通过 | 截断备份副本无法打开/执行完整性查询，没有误判为有效备份 |
| WAL checkpoint | 通过 | TRUNCATE checkpoint 无 busy、无待处理页面 |

## 5. 完整规模观测值

| 指标 | 本次结果 |
|---|---:|
| 100,000 对象批量写入 | 245 ms |
| 1,000,000 关系批量写入 | 2,528 ms |
| 在线备份 | 133 ms |
| checkpoint 后数据库大小 | 56,819,712 bytes（约 54.2 MiB） |
| 备份大小 | 56,819,712 bytes（约 54.2 MiB） |
| 完整运行总耗时 | 约 3.9 秒 |

这些数字来自单机、单写者、大事务、极简字段和热缓存合成负载，只能证明当前规模下没有明显技术阻塞。它们不能代表页面延迟、复杂查询、全文语料、并发 Agent、低性能磁盘或真实业务工作负载，也不作为产品 SLA。

## 6. 同步发现与修复

生产构建重复执行时，旧 `dist/client` 资产在受管 Windows 环境中触发覆盖/删除权限错误。已将 Vite 的 `dist/client` 配置改为每次从空目录构建；`dist/server` 与 `dist/.openai` 位于兄弟目录，继续由站点准备脚本生成。

本次受管沙箱仍无法处理由另一身份创建的旧 `dist` 目录，因此清理旧生成目录并在批准的非沙箱构建中复验。最终生产构建通过。该现象属于生成目录所有权/执行环境限制，不影响 SQLite 结论。

## 7. 尚未覆盖

以下证据仍缺失，不能从本次结果外推：

1. Linux CI 和 Linux 文件/符号链接语义；
2. 多进程或多 Worker 同时写入的锁争用、超时与公平性；
3. 真实断电、磁盘写满、只读文件系统和杀毒软件长期占锁；
4. Node 24 补丁升级之间的 `node:sqlite` API/文件兼容回归；
5. 正式 Migration Runner、checksum、未知新版本拒写和升级失败恢复；
6. 正式 Repository 合约、space 强制过滤、乐观锁、幂等和 Audit/Outbox 同事务；
7. 大正文、复杂过滤和真实中文查询集的召回质量；
8. 一致备份中数据库、来源文件和 manifest 的跨介质恢复；
9. 加密卷、备份保留和用户恢复操作的端到端走查。

## 8. 继续与退出条件

### 继续

- G3 确认后建立最小正式 Schema 和 Repository contract tests；
- Windows/Linux CI 执行快速 Spike；版本升级或存储策略变化执行完整 Spike；
- 用固定合成查询集比较 FTS5、现有 MiniSearch 和后续向量候选；
- 在第一个垂直切片中完成“写入—审计—备份—恢复—重建索引”闭环。

### 退出到其他驱动

出现以下任一情况时，保持领域/API 不变，评估锁定版本的 `better-sqlite3`：

- 受支持 Node LTS 补丁导致 API 或数据库行为无法稳定锁定；
- Windows/Linux 的备份恢复或异常退出一致性不能可靠通过；
- 同步调用在目标工作负载下持续阻塞 UI/SSE，Worker 隔离仍不能满足预算；
- FTS5 在目标构建中不可用，且无法用同一 SearchProvider 合理替换；
- Migration/Repository 合约无法在当前 API 上实现可测试的错误与恢复语义。

## 9. 验证记录

| 命令/检查 | 结果 |
|---|---|
| SQLite 快速 Spike | 通过，9 类检查 |
| SQLite 完整 Spike | 通过，100,000 对象 / 1,000,000 关系 |
| `npm run build` | 通过；7,410 模块，存在既有大 chunk 警告 |
| `npm run privacy:scan` | 通过；未发现被阻止的个人标识或凭据赋值 |

未因本 Spike 执行完整 `npm test`：本次新增的是独立技术验证脚本和构建幂等配置，没有改动业务模块；正式 Repository/迁移落地时必须执行完整测试，并继续记录 Windows 符号链接测试的环境限制。
