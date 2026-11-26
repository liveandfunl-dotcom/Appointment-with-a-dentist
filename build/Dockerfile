# Multi-stage сборка: один образ для backend и frontend.
# Контекст сборки — корень репозитория (см. build/docker-compose.yml).

# ---- 1. Сборка backend и frontend ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY tests/package.json tests/
RUN npm ci --workspace backend --workspace frontend --include-workspace-root
COPY backend backend
COPY frontend frontend
RUN npm run build

# ---- 2. Production-зависимости backend ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY tests/package.json tests/
RUN npm ci --omit=dev --workspace backend

# ---- 3. Финальный образ ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/clinic.db \
    STATIC_DIR=/app/frontend-dist
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/frontend/dist ./frontend-dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
