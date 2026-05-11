# Hermes 实例接入云端共享库 — 执行指令

> 本文档可直接复制粘贴给各 Hermes 实例执行。
> 适用实例：hermes-main、hermes-research、hermes-devops
> 目标：将实例连接到 GitHub 共享库和 MinIO 对象存储

---

## 第一步：确认当前实例身份

在执行以下步骤之前，请先确认你的实例 ID：

```bash
echo "当前实例：$HERMES_INSTANCE_ID"
```

如果输出为空，请根据你的部署环境设置：
- Docker/WSL2 主实例 → `hermes-main`
- 飞书平台科研实例 → `hermes-research`
- LXC DevOps 实例 → `hermes-devops`

---

## 第二步：克隆/更新 DDUP 仓库

### 情况 A：首次连接（仓库尚未克隆）

```bash
# 选择本地存放路径（各实例根据自身环境调整）
# hermes-main (Docker): /opt/ddup（volume 映射到 E:\BaiduSyncdisk\DDUP，百度云盘同步）
# hermes-research (服务器): ~/DDUP 或 ~/.hermes/DDUP
# hermes-devops (LXC): ~/DDUP 或 /opt/ddup

export DDUP_PATH="/opt/ddup"  # 请根据实际环境修改

mkdir -p $(dirname $DDUP_PATH)
cd $(dirname $DDUP_PATH)

# 克隆仓库（使用 SSH，需提前配置 GitHub 密钥）
git clone git@github.com:jiezho/DDUP.git $(basename $DDUP_PATH)

cd $DDUP_PATH
git config user.email "hermes@ddup.local"
git config user.name "Hermes $HERMES_INSTANCE_ID"
```

### 情况 B：已克隆，需要更新到最新

```bash
export DDUP_PATH="/opt/ddup"  # 请根据实际环境修改
cd $DDUP_PATH

git pull origin master
echo "当前版本：$(git log -1 --oneline)"
```

---

## 第三步：配置环境变量

将以下内容追加到你的环境配置文件中：

```bash
# === DDUP 共享库配置 ===
export DDUP_PATH="/opt/data/DDUP"           # 修改为实际路径
export HERMES_INSTANCE_ID="hermes-main"     # 修改为当前实例 ID

# === MinIO 对象存储 ===
export MINIO_ENDPOINT="192.168.102.204:9000"
export MINIO_BUCKET="ddup-shared-library"
export MINIO_ACCESS_KEY="ddup_admin"
export MINIO_SECRET_KEY="ddup_shared_2026!"

# === 可选：Obsidian Wiki 路径 ===
export OBSIDIAN_VAULT_PATH="/opt/ddup/wiki-vault"
```

**各实例持久化方式**：
- hermes-main (Docker): 写入 `/root/.bashrc`，或在 `docker-compose.yml` 的 environment 中配置
- hermes-research (服务器): 写入 `~/.bashrc`
- hermes-devops (LXC): 写入 `~/.bashrc`

执行生效：
```bash
source ~/.bashrc
```

---

## 第四步：安装 memory-ext-client 技能

```bash
cd $DDUP_PATH

# 复制技能到 Hermes 技能目录
mkdir -p ~/.hermes/skills/
cp -r shared-library/registry/published/memory-ext-client ~/.hermes/skills/

# 验证技能文件存在
ls -la ~/.hermes/skills/memory-ext-client/
```

---

## 第五步：验证扩展记忆层

```bash
cd $DDUP_PATH

# 测试状态查询
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py status

# 测试查询共享知识
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py query \
  --scope shared --keywords "API,限流"

# 测试保存知识到自身扩展记忆
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py save \
  --scope self --key "连接验证" \
  --content "$(date '+%Y-%m-%d %H:%M:%S') — 实例 $HERMES_INSTANCE_ID 已成功连接共享库"

# 再次查看状态
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py status
```

---

## 第六步：验证 MinIO 连接

```bash
# 测试连通性
python -c "
from minio import Minio
c = Minio('$MINIO_ENDPOINT', access_key='$MINIO_ACCESS_KEY', secret_key='$MINIO_SECRET_KEY', secure=False)
print('Bucket 存在：', c.bucket_exists('$MINIO_BUCKET'))
print('对象列表（前5个）：')
for obj in c.list_objects('$MINIO_BUCKET', prefix='$HERMES_INSTANCE_ID/', max_keys=5):
    print('  -', obj.object_name)
"
```

如果提示 `ModuleNotFoundError: No module named 'minio'`，请先安装：
```bash
pip install minio
```

---

## 第七步：验证 Git 同步能力

```bash
cd $DDUP_PATH

# 检查当前分支和状态
git status

# 拉取最新（确认连接正常）
git pull origin master

# 测试提交：将第五步保存的记忆文件提交
git add shared-library/memory-ext/
git commit -m "chore($HERMES_INSTANCE_ID): verify shared-library connection

$(date '+%Y-%m-%d %H:%M:%S') — 实例连接验证提交

🤖 Generated with [Qoder][https://qoder.com]"

# 推送（可能需要 SSH 密钥配置）
git push origin master
```

---

## 第八步：初始化实例专属扩展记忆（按需）

如果实例的 memory-ext 目录下还没有专属文件，可以创建初始文件：

```bash
cd $DDUP_PATH

# 创建 README（如不存在）
SELF_DIR="shared-library/memory-ext/$HERMES_INSTANCE_ID"
mkdir -p $SELF_DIR

if [ ! -f "$SELF_DIR/README.md" ]; then
cat > "$SELF_DIR/README.md" << 'EOF'
# 扩展记忆目录

此目录存放本实例的溢出记忆和领域知识。

## 使用方式
通过 memory-ext-client 技能读写：
- 保存：memory-ext save --scope self --key "主题" --content "内容"
- 查询：memory-ext query --scope self --keywords "关键词"

## 文件清单
（自动维护）
EOF
fi

ls -la $SELF_DIR/
```

---

## 各实例快速参考

### hermes-main (Docker/WSL2)

```bash
# 典型配置
export DDUP_PATH="/opt/ddup"
export HERMES_INSTANCE_ID="hermes-main"

# Docker 启动时 volume 映射（必须，否则容器内无法访问 E 盘）：
# docker run -v /mnt/e/BaiduSyncdisk/DDUP:/opt/ddup ...
# 或在 docker-compose.yml 中添加：
# volumes:
#   - /mnt/e/BaiduSyncdisk/DDUP:/opt/ddup:rw
#
# WSL2 中 E 盘已自动挂载到 /mnt/e/，如未挂载请检查 wsl.conf
```

### hermes-research (飞书平台/服务器)

```bash
# 典型配置
export DDUP_PATH="~/DDUP"
export HERMES_INSTANCE_ID="hermes-research"

# 注意：飞书平台实例可能需要通过 SSH 代理访问 GitHub
# 如需代理：git config --global url."https://ghproxy.com/https://github.com/".insteadOf "https://github.com/"
```

### hermes-devops (LXC/zhoujie-devops)

```bash
# 典型配置
export DDUP_PATH="~/DDUP"
export HERMES_INSTANCE_ID="hermes-devops"

# LXC 容器内可能需要配置 DNS
# 如遇到 DNS 问题：echo "nameserver 223.5.5.5" | tee /etc/resolv.conf
```

---

## 故障排查

| 问题 | 排查步骤 |
|------|----------|
| GitHub 克隆失败 | 检查 `~/.ssh/id_ed25519` 是否存在且有权限；运行 `ssh -T git@github.com` |
| MinIO 连接超时 | 检查 192.168.102.204:9000 是否可达：`curl -v http://192.168.102.204:9000/minio/health/live` |
| memory_ext.py 报错 | 确认 `DDUP_PATH` 和 `HERMES_INSTANCE_ID` 已 export；确认文件路径存在 |
| 中文乱码 | 设置 `export PYTHONIOENCODING=utf-8` |
| pip install minio 失败 | 尝试 `pip install minio -i https://pypi.tuna.tsinghua.edu.cn/simple` |

---

## 连接验证清单

完成以上步骤后，请确认以下检查项：

- [ ] `echo $DDUP_PATH` 输出正确的仓库路径
- [ ] `echo $HERMES_INSTANCE_ID` 输出正确的实例 ID
- [ ] `ls $DDUP_PATH/shared-library/registry/instances.json` 文件存在
- [ ] `python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py status` 正常返回
- [ ] MinIO `bucket_exists` 返回 True
- [ ] `git pull origin master` 成功无冲突
- [ ] 能成功执行 `git push origin master`（有变更时）

---

## 后续维护

日常使用中，各实例应在启动时执行：

```bash
# 启动时同步最新共享库
cd $DDUP_PATH && git pull origin master

# 会话结束时提交本实例的记忆变更
cd $DDUP_PATH && git add shared-library/memory-ext/$HERMES_INSTANCE_ID/ && git diff --cached --quiet || git commit -m "chore($HERMES_INSTANCE_ID): memory update $(date +%Y%m%d)" && git push origin master
```
