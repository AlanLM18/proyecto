# ---------- Práctica 3: imagen Docker de la API (Node.js + SQLite) ----------
# Construcción en dos etapas: la primera instala dependencias y la segunda
# solo copia lo necesario para ejecutar (imagen final más pequeña).

# ===== Etapa 1: dependencias de producción =====
FROM node:22-slim AS deps
WORKDIR /app

# Se copia también .npmrc para que npm NO intente compilar better-sqlite3
# (la imagen no trae compilador; el módulo ya incluye su binario precompilado).
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

# ===== Etapa 2: imagen final =====
FROM node:22-slim

# La app escucha en el puerto 3000 dentro del contenedor (en EC2: docker run -p 80:3000)
ENV NODE_ENV=production \
    PORT=3000 \
    SOCKET_PORT=6061

WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Carpetas donde la app guarda la base de datos SQLite y los backups (se montan como volúmenes)
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups

# Ejecutar como usuario sin privilegios
USER node

EXPOSE 3000 6061

# Comprueba cada 30 s que la API responde
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
