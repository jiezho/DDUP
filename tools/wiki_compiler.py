#!/usr/bin/env python3
"""Wiki Compiler - 定时扫描 _raw/ 并编译为正式页面"""

import json
import re
from pathlib import Path
from datetime import datetime

DDUP_PATH = Path(".")
WIKI_DIR = DDUP_PATH / "shared-library" / "wiki"
RAW_DIR = WIKI_DIR / "_raw"
COMPILED_DIR = WIKI_DIR / "compiled"
LOG_FILE = WIKI_DIR / "logs" / f"compile-{datetime.now().strftime('%Y-%m-%d')}.log"


def compile_wiki():
    """扫描所有 _raw/ 文件，处理并编译"""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logs = []

    for instance_dir in RAW_DIR.iterdir():
        if not instance_dir.is_dir():
            continue
        instance_id = instance_dir.name

        for md_file in sorted(instance_dir.glob("*.md")):
            content = md_file.read_text(encoding="utf-8")

            # 跳过已处理的
            if "status: compiled" in content or "status: merged" in content:
                continue

            # 提取标题
            title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
            title = title_match.group(1) if title_match else md_file.stem

            # 检查重叠
            existing = find_similar(title)

            if existing:
                merge_content(existing, content, instance_id)
                logs.append(f"[MERGE] {md_file.name} -> {existing.name} (from {instance_id})")
                mark_processed(md_file, "merged")
            else:
                compiled_path = COMPILED_DIR / f"{md_file.stem}.md"
                compiled_path.parent.mkdir(parents=True, exist_ok=True)
                compiled_path.write_text(content, encoding="utf-8")
                logs.append(f"[NEW] {md_file.name} -> compiled/ (from {instance_id})")
                mark_processed(md_file, "compiled")

    LOG_FILE.write_text("\n".join(logs), encoding="utf-8")
    return {"processed": len(logs), "log": str(LOG_FILE)}


def find_similar(title: str):
    """查找相似标题的已编译页面"""
    if not COMPILED_DIR.exists():
        return None
    for compiled in COMPILED_DIR.glob("*.md"):
        text = compiled.read_text(encoding="utf-8")
        lines = text.split("\n")
        compiled_title = ""
        for line in lines:
            if line.startswith("# "):
                compiled_title = line.replace("# ", "").strip()
                break
        if not compiled_title:
            continue
        # 简单相似度
        t_words = set(title.lower().split())
        c_words = set(compiled_title.lower().split())
        union = t_words | c_words
        if union and len(t_words & c_words) / len(union) > 0.6:
            return compiled
    return None


def merge_content(target: Path, new_content: str, source_instance: str):
    """合并内容到已有页面"""
    existing = target.read_text(encoding="utf-8")
    separator = f"\n\n---\n## 补充来源 ({source_instance}, {datetime.now().strftime('%Y-%m-%d')})\n\n"
    target.write_text(existing + separator + new_content, encoding="utf-8")


def mark_processed(md_file: Path, status: str):
    """标记文件为已处理"""
    content = md_file.read_text(encoding="utf-8")
    if "status:" in content:
        content = re.sub(r'status:\s*\w+', f'status: {status}', content)
    else:
        ts = datetime.now().isoformat()
        content = f"---\nstatus: {status}\nprocessed_at: {ts}\n---\n\n" + content
    md_file.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    result = compile_wiki()
    print(f"Wiki compile complete: {result['processed']} files processed")
