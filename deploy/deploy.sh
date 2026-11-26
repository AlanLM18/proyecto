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

echo "==> 2) Espacio en disco"
# Si el volumen EBS se amplió en la consola de AWS, se extiende la partición y el sistema de archivos
ROOT_DEV=$(findmnt -no SOURCE /)
DISCO=$(lsblk -no PKNAME "$ROOT_DEV" 2>/dev/null || true)
PART=$(echo "$ROOT_DEV" | grep -o '[0-9]*$')
if [ -n "$DISCO" ] && [ -n "$PART" ]; then
  sudo growpart "/dev/$DISCO" "$PART" >/dev/null 2>&1 && sudo resize2fs "$ROOT_DEV" >/dev/null 2>&1 || true
fi
# Libera imágenes y capas que ya no usa ningún contenedor (versiones anteriores, descargas incompletas)
docker system prune -af >/dev/null || true
docker builder prune -af >/dev/null 2>&1 || true
sudo apt-get clean >/dev/null 2>&1 || true
sudo journalctl --vacuum-size=50M >/dev/null 2>&1 || true
df -h /

echo "==> 3) Memoria swap (imprescindible en instancias de 1 GB: sin swap el servidor se congela)"
# Una ejecución anterior pudo crear un swap de 2 GB: se reduce a 1 GB para liberar disco
if [ -f /swapfile ] && [ "$(stat -c %s /swapfile)" -gt 1200000000 ]; then
  sudo swapoff /swapfile || true
  sudo rm -f /swapfile
fi
LIBRE_KB=$(df --output=avail / | tail -1)
if [ -z "$(swapon --show)" ] && [ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -lt 3000000 ] && [ "$LIBRE_KB" -gt 1500000 ]; then
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
free -m

echo "==> 4) Secretos persistentes del servidor (se generan una sola vez)"
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

echo "==> 5) Descargando las imágenes nuevas (antes de detener las actuales)"
echo "${DOCKERHUB_TOKEN}" | docker login -u "${DOCKERHUB_USERNAME}" --password-stdin
$COMPOSE pull --quiet
docker logout

echo "==> 6) Retirando el contenedor del Parcial 1 si sigue ocupando el puerto 80"
docker rm -f practica3-api 2>/dev/null || true

echo "==> 7) Actualizando contenedores"
$COMPOSE up -d --remove-orphans
$COMPOSE ps

echo "==> 8) Verificando /api/health a través del frontend (puerto 80)"
for i in $(seq 1 60); do
  if curl -fs http://localhost/api/health; then
    echo
    echo "Despliegue correcto: frontend y API responden en el puerto 80"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "La nueva versión no respondió a tiempo"
$COMPOSE ps -a
$COMPOSE logs --tail 60
df -h / && free -m
exit 1
