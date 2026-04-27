def main() -> None:
    print(
        "\n".join(
            [
                "You are running a scheduled maintenance job for DDUP's Obsidian wiki vault.",
                "",
                "Goals:",
                "1) Process new raw notes under /opt/ddup/wiki-vault/_raw.",
                "2) Maintain cross-links and taxonomy consistency.",
                "3) Keep the vault healthy (lint), and update index/log/manifest outputs.",
                "",
                "Constraints:",
                "- Do not expose secrets.",
                "- Prefer incremental updates.",
                "",
                "Execute the following sequence:",
                "- Run wiki-ingest",
                "- Run cross-linker",
                "- Run wiki-lint",
                "- Run wiki-update",
            ]
        )
    )


if __name__ == "__main__":
    main()
