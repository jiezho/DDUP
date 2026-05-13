import json
from pathlib import Path


def test_instances_published_skills_exist_and_are_structured() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    instances_path = repo_root / "shared-library" / "registry" / "instances.json"
    skills_manifest_path = repo_root / "shared-library" / "registry" / "skills-manifest.json"
    published_root = repo_root / "shared-library" / "registry" / "published"

    instances_payload = json.loads(instances_path.read_text(encoding="utf-8"))
    manifest_payload = json.loads(skills_manifest_path.read_text(encoding="utf-8"))

    referenced: set[str] = set()
    for instance in instances_payload.get("instances", []):
        for skill in instance.get("published_skills", []) or []:
            if isinstance(skill, str) and skill.strip():
                referenced.add(skill.strip())

    declared: set[str] = set()
    for skill in manifest_payload.get("skills", []):
        name = skill.get("name")
        if isinstance(name, str) and name.strip():
            declared.add(name.strip())

    missing = []
    for name in sorted(referenced | declared):
        root = published_root / name
        if not root.exists():
            missing.append(f"{name}: missing directory")
            continue
        if not (root / "package.json").exists():
            missing.append(f"{name}: missing package.json")
        if not (root / "SKILL.md").exists():
            missing.append(f"{name}: missing SKILL.md")
        if not (root / "scripts").exists():
            missing.append(f"{name}: missing scripts/")

    assert not missing, "invalid published skills:\n" + "\n".join(missing)

    skills_count = manifest_payload.get("skills_count")
    if isinstance(skills_count, int):
        assert skills_count == len(manifest_payload.get("skills", []))

