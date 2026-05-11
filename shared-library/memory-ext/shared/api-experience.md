# API 使用经验汇总（跨实例共享）

> 汇集三个 Hermes 实例的 API 踩坑经验

## 飞书 API

### 文档写入
- 分批写入：每批 10-15 blocks，避免超时
- 错误恢复：写入失败后重试需检查已写入部分（幂等性）
- 限制：无原生表格插入、无法插入图片到文档、无 bullet/callout 块
- 大型报告：已验证 870+ blocks 可靠写入（分 4 批）

### 多维表格
- 写入限制：单次最多 500 条记录
- 字段类型：文本/数字/日期/链接/多选 均已验证
- 权限：app_token + table_id 缺一不可

### 卡片消息
- 交互方案：button + save_card_state（替代 collapsible_panel）
- 限制：卡片更新有频率限制

## arXiv API
- 搜索语法：ti:keyword, abs:keyword, cat:cs.AI, au:name
- 限流：429 后需等待 120 秒
- 最佳实践：批量查询间隔 3 秒，每日定时查询避开高峰

## Semantic Scholar API
- 限流极严：请求间隔最少 8 秒
- 推荐用法：先 arXiv 获取 paper_id，再查引用网络
- 字段：title, abstract, authors, citationCount, references, citations

## execute_code 沙箱
- 不可访问环境变量（FEISHU_* 等）
- 不可访问外部网络
- 超时 5 分钟
- Workaround：用 terminal 工具替代
