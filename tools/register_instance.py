#!/usr/bin/env python3
"""Register Instance - 新 Hermes 实例注册自动化"""

import json
import sys
from pathlib import Path
from datetime import datetime

DDUP_PATH = Path(__file__).parent.parent
REGISTRY_PATH = DDUP_PATH / "shared-library" / "registry" / "instances.json"


def register(instance_id: str, name: str, deployment_type: str, host: str, specialization: list = None):
    """注册新实例并创建所有必要目录"""

    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))

    existing_ids = [i["id"] for i in registry["instances"]]
    if instance_id in existing_ids:
        print(f"[ERROR] Instance {instance_id} already exists")
        return False

    new_instance = {
        "id": instance_id,
        "name": name,
        "deployment": {
            "type": deployment_type,
            "host": host,
            "hermes_version": "v0.13.0"
        },
        "capabilities": {
            "model": "glm-5.1-fp8",
            "platforms": ["feishu"],
            "skills_count": 0
        },
        "specialization": specialization or [],
        "sub_agents": [],
        "cron_jobs": [],
        "published_skills": [],
        "status": "active",
        "registered_at": datetime.now().strftime("%Y-%m-%d"),
        "memory_ext": {
            "enabled": True,
            "status": "ready",
            "files_count": 0,
            "files": [],
            "memory_saturation": "unknown"
        }
    }

    registry["instances"].append(new_instance)
    REGISTRY_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")

    dirs_to_create = [
        DDUP_PATH / "agents" / instance_id,
        DDUP_PATH / "shared-library" / "outputs" / instance_id,
        DDUP_PATH / "shared-library" / "outputs" / instance_id / "cron-archives",
        DDUP_PATH / "shared-library" / "memory-ext" / instance_id,
        DDUP_PATH / "shared-library" / "wiki" / "_raw" / instance_id,
    ]

    for d in dirs_to_create:
        d.mkdir(parents=True, exist_ok=True)
        print(f"  [OK] {d.relative_to(DDUP_PATH)}")

    soul_path = DDUP_PATH / "agents" / instance_id / "SOUL.md"
    soul_path.write_text(f"""# {name}

## 部署信息
- 类型: {deployment_type}
- 主机: {host}
- 注册时间: {datetime.now().strftime('%Y-%m-%d')}

## 能力描述
（请根据实际情况填写）

## 共享库配置
- DDUP_PATH: /path/to/DDUP
- HERMES_INSTANCE_ID: {instance_id}
- 推荐安装共享技能: memory-ext-client, cron-archive, storage-client, cross-instance-query
""", encoding="utf-8")

    readme_path = DDUP_PATH / "shared-library" / "memory-ext" / instance_id / "README.md"
    readme_path.write_text(
        f"# {name} 扩展记忆\n\n此目录存放 {instance_id} 的溢出记忆和领域知识。\n",
        encoding="utf-8"
    )

    print(f"\n[SUCCESS] Instance {instance_id} registered!")
    print(f"  Next steps:")
    print(f"  1. Configure HERMES_INSTANCE_ID={instance_id} in the new instance")
    print(f"  2. Install shared skills: memory-ext-client, cron-archive, storage-client")
    print(f"  3. Edit agents/{instance_id}/SOUL.md")
    print(f"  4. git add && git commit && git push")
    return True


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: python register_instance.py <id> <name> <deploy_type> <host> [spec1,spec2,...]")
        print("Example: python register_instance.py hermes-data 'Data Agent' docker 192.168.102.205 data_analysis")
        sys.exit(1)

    register(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5].split(",") if len(sys.argv) > 5 else [])
