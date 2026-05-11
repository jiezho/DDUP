# 新闻源配置（28源新闻聚合器）

## 已接入来源
| 源名称 | 类型 | URL/API | 更新频率 | 备注 |
|--------|------|---------|----------|------|
| Hacker News | API | https://hacker-news.firebaseio.com | 实时 | 技术热点 |
| GitHub Trending | 网页 | https://github.com/trending | 每日 | 开源项目 |
| 36Kr | 网页 | 36kr.com | 每日 | 中文科技 |
| 微博 | 网页 | weibo.com | 实时 | 社交媒体 |
| 华尔街见闻 | 网页 | wallstreetcn.com | 实时 | 财经 |
| （其他 23 源待补充） | | | | |

## 输出格式
- 飞书卡片推送（交互式 button + save_card_state）
- 多维表格记录（标题/分类/日期/链接/HN热度/摘要）

## 限流注意
- DuckDuckGo 搜索：10-11 次后触发 CAPTCHA
- 网页抓取需间隔，避免被封
