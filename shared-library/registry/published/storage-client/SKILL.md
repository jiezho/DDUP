# Storage Client (MinIO)

## 何时使用
当需要上传/下载大于 1MB 的文件（论文 PDF、视频、大型报告、数据集）到云端对象存储时调用。

## 背景
Git 不适合存储大文件（>1MB），且 DDUP 仓库主要存放文本和元数据。
MinIO 作为生产级对象存储已部署在 192.168.102.204:9000，为三个实例提供统一的持久化存储。

## 命令

### 上传文件
```
storage upload --file /path/to/paper.pdf --category papers --tags '{"subject": "transformer"}'
```
返回：`{"status": "success", "key": "hermes-research/papers/2026-05/abc123.pdf", "url": "..."}`

### 下载文件
```
storage download --key "hermes-research/papers/2026-05/abc123.pdf" --dest /tmp/
```

### 列出文件
```
storage list --prefix "hermes-research/papers/" --limit 20
```

### 生成临时链接（7天有效）
```
storage presign --key "hermes-research/papers/2026-05/abc123.pdf"
```

## 存储路径约定
`{instance-id}/{category}/{YYYY-MM}/{hash12}{ext}`

## 支持的 category
- `papers`: 论文 PDF
- `datasets`: 数据集文件
- `reports`: 大型报告
- `media`: 视频/音频/图片
- `archives`: 压缩包
- `shared`: 跨实例共享资源

## 文件大小路由策略
| 大小 | 存储位置 |
|------|----------|
| < 1MB | Git 仓库（文本/Markdown/JSON） |
| > 1MB | MinIO 对象存储 |

## 环境依赖
- MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
- pip install minio
