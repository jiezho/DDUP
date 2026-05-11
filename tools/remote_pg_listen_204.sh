set -euo pipefail

PGVER=16
CONF="/etc/postgresql/${PGVER}/main/postgresql.conf"
HBA="/etc/postgresql/${PGVER}/main/pg_hba.conf"

sed -i -E "s/^[#[:space:]]*listen_addresses[[:space:]]*=.*/listen_addresses = '*'/" "$CONF"

if ! grep -qE "^host[[:space:]]+ddup[[:space:]]+ddup[[:space:]]+172\\.16\\.0\\.0/12" "$HBA"; then
  echo "host ddup ddup 172.16.0.0/12 scram-sha-256" >> "$HBA"
fi

systemctl restart postgresql
systemctl is-active postgresql
ss -lntp | grep 5432 || true
