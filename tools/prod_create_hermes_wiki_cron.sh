set -euo pipefail

export PATH=/opt/hermes/.local/bin:$PATH

hermes cron create 60m --name ddup-wiki-maintain --skill wiki-ingest --skill cross-linker --skill wiki-lint --skill wiki-update 'Maintain the Obsidian wiki vault at /opt/ddup/wiki-vault. Ingest items from _raw, add links, lint, and update index/log/manifest.'

hermes cron list
