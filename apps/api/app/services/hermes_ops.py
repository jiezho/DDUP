from __future__ import annotations

from typing import Any

from app.core import config
from app.services.hermes_archive import get_runtime_status
from app.services.hermes_registry import get_overview


def get_ops_check() -> dict[str, Any]:
    overview = get_overview()
    runtime = get_runtime_status(limit=5)

    environment = {
        "ddup_path_configured": bool((config.settings.ddup_path or "").strip()),
        "hermes_api_configured": bool((config.settings.hermes_api_base or "").strip()),
        "wiki_enabled": bool(config.settings.ddup_wiki_enabled and (config.settings.ddup_wiki_vault_path or "").strip()),
        "storage_configured": bool((config.settings.storage_endpoint or "").strip() and (config.settings.storage_bucket or "").strip()),
        "isolation_rules_present": bool(runtime.get("isolation", {}).get("present")),
    }
    integrity = {
        "registry_present": bool(overview.get("coverage", {}).get("registry_present")),
        "skills_manifest_present": bool(overview.get("coverage", {}).get("skills_manifest_present")),
        "outputs_index_present": bool(overview.get("coverage", {}).get("outputs_index_present")),
        "shared_memory_present": bool(overview.get("coverage", {}).get("shared_memory_present")),
        "wiki_raw_present": bool(overview.get("coverage", {}).get("wiki_raw_present")),
        "cron_registry_present": bool(runtime.get("cron", {}).get("registry_present")),
    }

    recommendations: list[dict[str, str]] = []
    if not environment["ddup_path_configured"]:
        recommendations.append(
            {
                "level": "error",
                "title": "DDUP_PATH 未配置",
                "description": "API 进程未显式声明 DDUP_PATH，容器或部署环境可能无法稳定读取 shared-library。",
            }
        )
    if not integrity["outputs_index_present"]:
        recommendations.append(
            {
                "level": "warning",
                "title": "归档索引缺失",
                "description": "outputs/.index.json 不存在时，归档链路和跨实例检索会退化为降级模式。",
            }
        )
    if not environment["isolation_rules_present"]:
        recommendations.append(
            {
                "level": "warning",
                "title": "隔离规则未加载",
                "description": "建议补齐 isolation-rules.json 并启用违规阻断，确保多实例只读摘要和命名空间隔离生效。",
            }
        )
    if not environment["storage_configured"]:
        recommendations.append(
            {
                "level": "warning",
                "title": "对象存储未完整配置",
                "description": "请补齐 endpoint、bucket 与访问凭证，避免上传、下载和生命周期策略失效。",
            }
        )
    if not environment["wiki_enabled"]:
        recommendations.append(
            {
                "level": "info",
                "title": "Wiki 编译环境未启用",
                "description": "建议在部署环境打开 DDUP_WIKI_ENABLED 和 Vault 路径，形成 raw 到 compiled 的闭环。",
            }
        )
    if not recommendations:
        recommendations.append(
            {
                "level": "success",
                "title": "Hermes 运维基线已就绪",
                "description": "当前环境、索引、隔离规则和对象存储配置均已满足多实例治理的基础要求。",
            }
        )

    return {
        "environment": environment,
        "integrity": integrity,
        "runtime": runtime,
        "recommendations": recommendations,
    }
