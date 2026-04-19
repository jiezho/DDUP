set -euo pipefail

APP_DIR="/opt/ddup"
REPO_DIR="$APP_DIR/DDUP"
ENV_FILE="$APP_DIR/.env"

echo "[1/7] Install base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git openssl gnupg lsb-release \
  postgresql postgresql-contrib

if ! apt-cache show docker-compose-plugin >/dev/null 2>&1; then
  echo "docker-compose-plugin not found in current apt sources, installing Docker from official repo"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  if dpkg -s docker-ce >/dev/null 2>&1; then
    apt-get install -y --no-install-recommends docker-compose-plugin
  elif dpkg -s docker.io >/dev/null 2>&1; then
    apt-get install -y --no-install-recommends docker-compose-plugin
  else
    apt-get install -y --no-install-recommends docker.io docker-compose-plugin
  fi
fi

echo "[2/7] Enable services"
systemctl enable --now postgresql
systemctl enable --now docker

echo "[3/7] Init PostgreSQL role/db if missing"
DDUP_DB_PWD=""
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='ddup'" | grep -q 1; then
  DDUP_DB_PWD="$(openssl rand -base64 24 | tr -d '\n')"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE ddup WITH LOGIN PASSWORD '${DDUP_DB_PWD}';"
else
  echo "Role ddup exists."
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ddup'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ddup OWNER ddup;"
else
  echo "Database ddup exists."
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d ddup <<SQL
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

echo "[4/7] Clone or update repo"
mkdir -p "$APP_DIR"
if [ -d "$REPO_DIR/.git" ]; then
  cd "$REPO_DIR"
  for i in 1 2 3 4 5; do
    if git -c http.version=HTTP/1.1 pull; then
      break
    fi
    if [ "$i" -eq 5 ]; then
      echo "git pull failed after retries"
      exit 1
    fi
    sleep 2
  done
else
  for i in 1 2 3 4 5; do
    if git -c http.version=HTTP/1.1 clone --depth 1 https://github.com/jiezho/DDUP.git "$REPO_DIR"; then
      break
    fi
    if [ "$i" -eq 5 ]; then
      echo "git clone failed after retries"
      exit 1
    fi
    sleep 2
  done
  cd "$REPO_DIR"
fi

echo "[5/7] Write production env file"
if [ -f "$REPO_DIR/.env.prod.example" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    cp "$REPO_DIR/.env.prod.example" "$ENV_FILE"
  fi
else
  echo "Missing .env.prod.example in repo."
  exit 1
fi

if [ -n "$DDUP_DB_PWD" ]; then
  sed -i "s#postgresql+psycopg://ddup:REPLACE_WITH_STRONG_PASSWORD@host.docker.internal:5432/ddup#postgresql+psycopg://ddup:${DDUP_DB_PWD}@host.docker.internal:5432/ddup#g" "$ENV_FILE"
fi

chmod 600 "$ENV_FILE"

echo "[6/7] Deploy containers"
cd "$REPO_DIR"
docker compose --env-file "$ENV_FILE" -f infra/docker-compose.prod.yml up -d --build

echo "[7/7] Health check"
sleep 2
curl -fsS http://127.0.0.1/healthz || true

echo
echo "DONE"
echo "Repo: $REPO_DIR"
echo "Env:  $ENV_FILE (DATABASE_URL password is stored here; keep file permission 600)"
echo "Web:  http://<server-ip>/"
echo "API:  http://<server-ip>/healthz"
