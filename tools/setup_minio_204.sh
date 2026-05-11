#!/bin/bash
set -euo pipefail

APP_DIR="/opt/ddup"
ENV_FILE="$APP_DIR/.env"
MINIO_DATA_DIR="/opt/minio/data"

# Generate credentials
ACCESS_KEY="$(openssl rand -hex 16)"
SECRET_KEY="$(openssl rand -base64 32 | tr -d '=+/')"

echo "[1/5] Generated credentials"
echo "    ACCESS_KEY: ${ACCESS_KEY}"
echo "    SECRET_KEY: ${SECRET_KEY:0:16}..."

# Ensure data directory exists
mkdir -p "$MINIO_DATA_DIR"
chmod 700 "$MINIO_DATA_DIR"
echo "[2/5] Created MinIO data directory: $MINIO_DATA_DIR"

# Update env file
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  grep -vE '^(STORAGE_|MINIO_)' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  mv "$ENV_FILE.tmp" "$ENV_FILE"
fi

cat >> "$ENV_FILE" << EOF

# MinIO Storage Configuration
STORAGE_ENDPOINT=http://192.168.102.204:9000
STORAGE_BUCKET=ddup-shared-library
STORAGE_ACCESS_KEY=$ACCESS_KEY
STORAGE_SECRET_KEY=$SECRET_KEY
STORAGE_REGION=us-east-1
STORAGE_SECURE=false
MINIO_DATA_DIR=$MINIO_DATA_DIR
EOF

chmod 600 "$ENV_FILE"
echo "[3/5] Updated env file: $ENV_FILE"

# Pull and start MinIO
docker pull minio/minio:latest
docker run -d \
  --name minio \
  --restart unless-stopped \
  -p 9000:9000 \
  -p 9001:9001 \
  -e "MINIO_ROOT_USER=$ACCESS_KEY" \
  -e "MINIO_ROOT_PASSWORD=$SECRET_KEY" \
  -v "$MINIO_DATA_DIR:/data" \
  minio/minio:latest server /data --console-address ":9001"

echo "[4/5] MinIO container started"

# Wait for MinIO to be ready
echo "Waiting for MinIO to be ready..."
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then
    echo "    MinIO is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "    WARNING: MinIO health check timeout"
  fi
  sleep 1
done

# Install mc (MinIO client) and create bucket
if ! command -v mc >/dev/null 2>&1; then
  curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
  echo "[5/5] Installed mc (MinIO client)"
fi

mc alias set local http://127.0.0.1:9000 "$ACCESS_KEY" "$SECRET_KEY" --api s3v4
mc mb local/ddup-shared-library || echo "    Bucket may already exist"
mc anonymous set download local/ddup-shared-library || true

echo ""
echo "=== MinIO Setup Complete ==="
echo "API Endpoint:    http://192.168.102.204:9000"
echo "Console:         http://192.168.102.204:9001"
echo "Bucket:          ddup-shared-library"
echo "ACCESS_KEY:      $ACCESS_KEY"
echo "SECRET_KEY:      ${SECRET_KEY:0:16}..."
echo "Env file:        $ENV_FILE"
echo ""
echo "IMPORTANT: Save the SECRET_KEY securely. It will not be shown again."
