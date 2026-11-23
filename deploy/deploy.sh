#!/usr/bin/env bash
# =============================================================================
# Despliegue en AWS EC2 (lo ejecuta GitHub Actions por SSH dentro de ~/biblioteca)
# Variables recibidas del pipeline: DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, APP_VERSION,
# OPENOBSERVE_USER, OPENOBSERVE_PASSWORD, ADMIN_PASSWORD
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> 1) Verificando Docker Compose"
if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-v2 || {
    ARCH=$(uname -m)
    mkdir -p ~/.docker/cli-plugins
    curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-${ARCH}" \
      -o ~/.docker/cli-plugins/docker-compose
    chmod +x ~/.docker/cli-plugins/docker-compose
  }
fi
docker compose version

echo "==> 2) Memoria swap (OpenObserve + app en instancias pequeñas)"
if [ -z "$(swapon --show)" ] && [ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -lt 3000000 ]; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
free -m

echo "==> 3) Secretos persistentes del servidor (se generan una sola vez)"
if [ ! -f .secrets ]; then
  {
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "ALERT_WEBHOOK_TOKEN=$(openssl rand -hex 24)"
  } > .secrets
  chmod 600 .secrets
fi

# .env que lee docker compose (permisos 600: solo el usuario ubuntu)
{
  echo "DOCKERHUB_USERNAME=${DOCKERHUB_USERNAME}"
  echo "APP_VERSION=${APP_VERSION}"
  echo "OPENOBSERVE_USER=${OPENOBSERVE_USER}"
  echo "OPENOBSERVE_PASSWORD=${OPENOBSERVE_PASSWORD}"
  echo "ADMIN_PASSWORD=${ADMIN_PASSWORD:-Admin123!}"
  echo "HOST_NAME=ec2-biblioteca"
  cat .secrets
} > .env
chmod 600 .env

echo "==> 4) Descargando las imágenes nuevas (antes de detener las actuales)"
echo "${DOCKERHUB_TOKEN}" | docker login -u "${DOCKERHUB_USERNAME}" --password-stdin
$COMPOSE pull
docker logout

echo "==> 5) Retirando el contenedor del Parcial 1 si sigue ocupando el puerto 80"
docker rm -f practica3-api 2>/dev/null || true

echo "==> 6) Actualizando contenedores"
$COMPOSE up -d --remove-orphans
$COMPOSE ps

echo "==> 7) Verificando /api/health a través del frontend (puerto 80)"
for i in $(seq 1 30); do
  if curl -fs http://localhost/api/health; then
    echo
    echo "Despliegue correcto: frontend y API responden en el puerto 80"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "La nueva versión no respondió a tiempo"
$COMPOSE logs --tail 60 api frontend
exit 1
