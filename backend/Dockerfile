# syntax=docker/dockerfile:1
# Multi-arch : node:22-alpine est publiée pour linux/amd64 et linux/arm64.

# ---- Base : dossier de travail appartenant à l'utilisateur non-root ----
FROM node:22-alpine AS base
RUN mkdir /app && chown node:node /app
WORKDIR /app
USER node

# ---- Dépendances de production uniquement (layer en cache tant que package*.json ne change pas) ----
FROM base AS deps-prod
COPY --chown=node:node package*.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ---- Target DEVELOPMENT : toutes les deps + rechargement auto (node --watch) ----
FROM base AS development
ENV NODE_ENV=development
COPY --chown=node:node package*.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY --chown=node:node src ./src
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- Target PRODUCTION : minimal, sans devDependencies ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps-prod --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
