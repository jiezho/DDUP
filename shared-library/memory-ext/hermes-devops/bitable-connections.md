# 飞书多维表格连接信息

## 灵感记录表
- app_token: VQq9bJLquamyYvsAefucWUYonDg
- table_id: tblXsQGwgUwBOW9s
- URL: https://my.feishu.cn/base/VQq9bJLquamyYvsAefucWUYonDg
- 字段：灵感内容、分类、来源、创建时间、状态、关键词、关联研究
- 触发：用户发送"灵感 xxx" → 灵感子智能体拦截处理

## 每日新闻汇总表
- app_token: Utm9bLdgyap198s1gluc4KqinKf
- table_id: tblqQbDcNjSUdsLg
- 字段：标题、分类(AI/能源)、日期、链接、HN热度、核心摘要

## 每日术语表
- app_token: Utm9bLdgyap198s1gluc4KqinKf
- table_id: tblHmFGcvK5nwTFV
- 字段：日期、术语、音标、分类(AI/电力)、英文释义、中文解释
- 累计术语：186 条，已推送：55 条

## 写入限制
- 单次最多 500 条记录
- 字段类型：文本/数字/日期/链接/多选 均已验证
- 权限：app_token + table_id 缺一不可
