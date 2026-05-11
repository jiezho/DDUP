# 网络可达性清单（跨实例共享）

> 最后更新：2026-05-11
> 注意：各实例网络环境不同，此表为汇总参考

## 学术/研究

| 站点 | hermes-main | hermes-research | hermes-devops |
|------|:-----------:|:---------------:|:-------------:|
| arxiv.org | ✅ | ✅ | ✅ |
| export.arxiv.org (API) | ✅ | ✅ (限流严格429) | ✅ |
| api.semanticscholar.org | ✅ | ✅ (8秒间隔) | — |
| scholar.google.com | ❌ | ❌ | ❌ |
| huggingface.co | ❌ | ❌ | ❌ |

## 开发/代码

| 站点 | hermes-main | hermes-research | hermes-devops |
|------|:-----------:|:---------------:|:-------------:|
| github.com | ✅ | ✅ | ✅ |
| docker.io (registry) | ❌ (需代理) | — | — |

## 搜索引擎

| 站点 | hermes-main | hermes-research | hermes-devops |
|------|:-----------:|:---------------:|:-------------:|
| bing.com | — | ✅ (中文效果差) | — |
| duckduckgo.com | — | — | ✅ (10次后限流) |
| google.com | ❌ | ❌ | ❌ |
| baidu.com | ❌ | ❌ | ❌ |

## API 限流策略

- **arXiv API**: 429 错误需等待 120 秒恢复
- **Semantic Scholar**: 请求间隔最少 8 秒
- **DuckDuckGo**: 10-11 次后触发 CAPTCHA，需重试方案

## 协作建议

当某实例需要访问不可达站点时，可委托可达实例代理：
- 需要 Google 搜索 → 当前无实例可达，降级方案
- 需要 HuggingFace → 当前无实例可达，通过 GitHub mirror 替代
- 需要 Bing 搜索 → 委托 hermes-research
