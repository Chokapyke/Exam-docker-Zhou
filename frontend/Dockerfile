# syntax=docker/dockerfile:1
# Multi-arch : node:22-alpine et nginx-unprivileged sont publiées en amd64 + arm64.

# ---- Dépendances (cache : ne se reconstruit que si package*.json change) ----
FROM node:22-alpine AS deps
RUN mkdir /app && chown node:node /app
WORKDIR /app
USER node
COPY --chown=node:node package*.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- Target DEVELOPMENT : serveur Vite avec HMR ----
FROM deps AS development
ENV NODE_ENV=development
COPY --chown=node:node . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---- Build des assets statiques ----
FROM deps AS build
COPY --chown=node:node . .
RUN npm run build

# ---- Target PRODUCTION : Nginx non-root qui sert le build ET fait reverse proxy vers l'API ----
FROM nginxinc/nginx-unprivileged:1.27-alpine AS production
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
