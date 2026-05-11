import sys
from pathlib import Path


def _render() -> str:
    from sqlalchemy import MetaData

    api_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(api_root))

    from app.models.base import Base
    from app import models

    _ = models
    md: MetaData = Base.metadata

    lines: list[str] = []
    lines.append("# DDUP 数据库 Schema（自动生成）")
    lines.append("")

    for table_name in sorted(md.tables.keys()):
        table = md.tables[table_name]
        lines.append(f"## {table.name}")
        lines.append("")
        lines.append("| 字段 | 类型 | 可空 | 主键 | 默认值 | 外键 |")
        lines.append("|---|---|---:|---:|---|---|")
        for col in table.columns:
            fks = ",".join([str(fk.column) for fk in col.foreign_keys])
            default = ""
            if col.server_default is not None:
                default = str(col.server_default.arg)
            lines.append(
                f"| {col.name} | {col.type} | {'是' if col.nullable else '否'} | {'是' if col.primary_key else '否'} | {default} | {fks} |"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    out_dir = Path(__file__).resolve().parents[3] / "docs" / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "db_schema.md"
    out_file.write_text(_render(), encoding="utf-8")


if __name__ == "__main__":
    main()

