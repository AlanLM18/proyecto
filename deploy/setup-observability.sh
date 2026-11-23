#!/usr/bin/env bash
# Crea/actualiza dashboards y alertas en el OpenObserve de la EC2.
# Se ejecuta en un contenedor efímero dentro de la red de docker compose,
# así llega a OpenObserve (openobserve:5080) y a la API (api:3000) por nombre.
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env; set +a

# Espera a que existan datos en los streams para poder crear las alertas
sleep 20

docker run --rm --network biblioteca_default \
  -e OPENOBSERVE_URL=http://openobserve:5080 \
  -e OPENOBSERVE_USER="$OPENOBSERVE_USER" \
  -e OPENOBSERVE_PASSWORD="$OPENOBSERVE_PASSWORD" \
  -e ALERT_WEBHOOK_URL=http://api:3000/api/alertas/webhook \
  -e ALERT_WEBHOOK_TOKEN="$ALERT_WEBHOOK_TOKEN" \
  -v "$(pwd)/observability:/obs:ro" \
  node:22-alpine node /obs/setup-openobserve.js
