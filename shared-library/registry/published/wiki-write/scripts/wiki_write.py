#!/usr/bin/env python3
"""Wiki Write - 将知识产出写入 LLM Wiki _raw/ 目录"""

import os
import re
import json
from pathlib import Path
from datetime import datetime

DDUP_PATH = Path(os.environ.get("DDUP_PATH", "/opt/ddup"))
INSTANCE_ID = os.environ.get("HERMES_INSTANCE_ID", "unknown")
RAW_DIR = DDUP_PATH / "shared-library" / "wiki" / "_raw" / INSTANCE_ID


def write(title: str, content: str, tags: list = None, citations: list = None) -> dict:
    """写入 Wiki 原始素材

    Args:
        title: 页面标题
        content: Markdown 正文
        tags: 标签列表
        citations: 引用列表 [{"type": "paper|url", "ref": "..."}]

    Returns:
        {"status": "success", "file_path": str}
    """
    tags = tags or []
    citations = citations or []
    now = datetime.now()

    # 生成文件名
    slug = re.sub(r'[^\w\u4e00-\u9fff]+', '-', title).strip('-').lower()[:50]
    filename = f"{now.strftime('%Y%m%d-%H%M')}-{slug}.md"

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    file_path = RAW_DIR / filename

    # 构建 frontmatter
    frontmatter = {
        "title": title,
        "instance_id": INSTANCE_ID,
        "created_at": now.isoformat(),
        "tags": tags,
        "citations": citations,
        "status": "raw"
    }

    fm_lines = ["---"]
    for k, v in frontmatter.items():
        if isinstance(v, list):
            fm_lines.append(f"{k}:")
            for item in v:
                if isinstance(item, dict):
                    fm_lines.append(f"  - {json.dumps(item, ensure_ascii=False)}")
                else:
                    fm_lines.append(f"  - {item}")
        else:
            fm_lines.append(f"{k}: {json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v}")
    fm_lines.append("---")

    full_content = "\n".join(fm_lines) + "\n\n" + content + "\n"
    file_path.write_text(full_content, encoding="utf-8")

    return {
        "status": "success",
        "file_path": str(file_path.relative_to(DDUP_PATH)),
        "title": title,
        "instance_id": INSTANCE_ID
    }


def _cli():
    import argparse
    parser = argparse.ArgumentParser(description="Wiki Write")
    parser.add_argument("--title", required=True)
    parser.add_argument("--content", required=True)
    parser.add_argument("--tags", default="")
    parser.add_argument("--citations", default="[]")
    args = parser.parse_args()

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    citations = json.loads(args.citations)
    result = write(args.title, args.content, tags, citations)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()
