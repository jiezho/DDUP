# ADR-009：本地身份、AI 策略与动作等级

> 状态：已接受  
> 决策日期：2026-08-24  
> 对应 G3：C1–C9、C13

## 背景

回环服务仍可能被恶意网页、外部文档提示注入、越权 Runtime、路径逃逸和过宽连接器访问。UI 隐藏按钮、模型拒答或系统提示词不能替代确定性授权。

## 决定

- 首版使用安装级 owner 与短期同源页面会话，不做账号密码或多用户登录。
- 授权默认拒绝、最小权限，对每请求、对象和动作检查。
- 数据分级为 public、personal_local、restricted；真实 restricted 当前禁止接入。
- AI 访问采用 `deny_ai`、`local_only`、`approved_cloud_metadata`、`approved_cloud_content` 四级，子对象只能收紧。
- 动作分 L0 读取、L1 草稿、L2 可恢复本地写、L3 外部动作、L4 删除/权限/不可逆操作。
- 外部内容与 Runtime 输出均为不可信数据；Tool Gateway 在模型之外校验工具、参数、权限、幂等和审批。
- 网络默认关闭；文件只接受对象 ID/相对引用；密钥只进环境或 OS 凭据存储。
- 连接器默认禁用、最小 scope、绑定 Space、可撤销；外部写入继续逐次确认。

## 后果

AI 可以提供高自动化草稿，但不能自行扩大权限。所有 Query、Search、Tool 与 Connector 需要同一 PolicyDecision 语义，不能由不同模块各自解释“允许”。

## 回退与复核

任何 Profile 或 Connector 均可禁用。若安全中间件、Tool Gateway 或审批缺失，系统降级为只读/草稿，而不是继续执行写操作。
