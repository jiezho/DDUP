set -euo pipefail

REPO_DIR="/opt/ddup/DDUP"
ENV_FILE="/opt/ddup/.env"

cd "$REPO_DIR"

echo "[1/4] Ensure PostgreSQL role password and env file"
pw="$(openssl rand -base64 24 | tr -d '\n')"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE ddup WITH PASSWORD '${pw}';"

cp -f "$REPO_DIR/.env.prod.example" "$ENV_FILE"
sed -i "s#postgresql+psycopg://ddup:REPLACE_WITH_STRONG_PASSWORD@host.docker.internal:5432/ddup#postgresql+psycopg://ddup:${pw}@host.docker.internal:5432/ddup#g" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "[2/4] Deploy containers"
docker compose --env-file "$ENV_FILE" -f infra/docker-compose.prod.yml up -d --build

echo "[3/4] Show status"
docker compose -f infra/docker-compose.prod.yml ps

echo "[4/4] Health check"
curl -fsS http://127.0.0.1/healthz
curl -I http://127.0.0.1/docs | head -n 1

echo "DONE"

