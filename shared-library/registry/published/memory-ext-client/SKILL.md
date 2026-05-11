---
name: memory-ext-client
description: Extended memory client for DDUP shared library - offload low-frequency memories to MinIO/GitHub, share knowledge across Hermes instances
version: 1.0.0
metadata:
  hermes:
    tags: [memory, shared-library, minio, ddup]
    category: devops
---

# Memory Extension Client

Offload low-frequency memories to the DDUP shared library (MinIO + GitHub), share knowledge across Hermes instances.

## Prerequisites

- Environment variables: DDUP_PATH, HERMES_INSTANCE_ID, MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
- Python package: minio (pip install minio)
- Git access to DDUP repository

## Commands

### Status Check
```bash
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py status
```

### Save Memory
```bash
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py save --scope self --key "topic" --content "content text"
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py save --scope shared --key "topic" --content "content text"
```

### Query Memory
```bash
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py query --scope self --keyword "keyword"
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py query --scope shared --keyword "keyword"
```

### Migrate Low-Frequency Memories
```bash
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py migrate
```

### Sync to Git
```bash
python ~/.hermes/skills/memory-ext-client/scripts/memory_ext.py sync
```

## Scopes

- **self**: Private to this Hermes instance (stored in memory-ext/{instance_id}/)
- **shared**: Shared across all instances (stored in shared-index.json)

## Architecture

```
MinIO (binary/large files)
  ddup-shared-library/
      hermes-research/   # self-scope memories (JSON)
      shared/            # shared-scope memories (JSON)

GitHub DDUP repo (structured text)
  shared-library/
      memory-ext/hermes-research/  # self-scope memory exports
      knowledge/                   # LLM Wiki pages
      assets/                      # papers/datasets/reports/templates
      config/                      # shared configuration
```
