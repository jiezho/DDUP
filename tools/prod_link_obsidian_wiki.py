import os
import pathlib


def _symlink(src: pathlib.Path, dst: pathlib.Path) -> None:
    if dst.is_symlink() or dst.exists():
        dst.unlink()
    os.symlink(str(src), str(dst))


def main() -> None:
    src_root = pathlib.Path("/opt/hermes/obsidian-wiki/.skills")
    if not src_root.is_dir():
        raise SystemExit("missing /opt/hermes/obsidian-wiki/.skills")

    dst_root = pathlib.Path("/opt/hermes/.hermes/skills")
    dst_root.mkdir(parents=True, exist_ok=True)

    count = 0
    for d in sorted(src_root.iterdir()):
        if not d.is_dir():
            continue
        name = d.name
        target = dst_root / name
        if target.exists() or target.is_symlink():
            target = dst_root / f"obswiki-{name}"
        _symlink(d, target)
        count += 1

    cfg_dir = pathlib.Path("/opt/hermes/.obsidian-wiki")
    cfg_dir.mkdir(parents=True, exist_ok=True)
    cfg = cfg_dir / "config"
    cfg.write_text(
        "OBSIDIAN_VAULT_PATH=/opt/ddup/wiki-vault\nOBSIDIAN_WIKI_REPO=/opt/hermes/obsidian-wiki\n",
        encoding="utf-8",
    )
    cfg.chmod(0o600)

    print(f"linked={count} config={cfg}")


if __name__ == "__main__":
    main()
