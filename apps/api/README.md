# DDUP API

## 开发

### 依赖

- Python 3.11+
- PostgreSQL（本地可用 docker-compose）

### 启动

- 安装依赖：`python -m pip install -r requirements.txt`
- 启动服务：`python -m uvicorn app.main:app --reload --port 8000`
- 健康检查：`GET /healthz`

