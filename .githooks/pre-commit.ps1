$staged = git diff --cached --name-only
$blockedPatterns = @(
  '(^|/|\\)id_ed25519',
  '(^|/|\\)\.env(\.|$)',
  'shared-library/registry/instances\.(local|private)\.json'
)
foreach ($p in $blockedPatterns) {
  if ($staged -match $p) {
    Write-Error "Blocked by pre-commit: staged file matches pattern: $p"
    exit 1
  }
}

$stagedDiff = git diff --cached
$blockedLiterals = @(
  'ddup_shared_2026!',
  'MINIO_SECRET_KEY=ddup_',
  'FEISHU_APP_SECRET='
)
foreach ($lit in $blockedLiterals) {
  if ($stagedDiff -match [regex]::Escape($lit)) {
    Write-Error "Blocked by pre-commit: staged diff contains sensitive literal: $lit"
    exit 1
  }
}

python apps\api\tools\export_openapi.py
python apps\api\tools\generate_db_schema_md.py
git add docs\generated\openapi.json docs\generated\db_schema.md

