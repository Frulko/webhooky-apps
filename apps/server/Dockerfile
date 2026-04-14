FROM node:22-alpine AS base
RUN npm install -g pnpm

# ── Web build ──────────────────────────────────────────────────────────────────
FROM base AS web-builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/cli/package.json ./apps/cli/package.json
RUN pnpm install --frozen-lockfile --filter web
COPY apps/web ./apps/web
RUN pnpm --filter web build

# ── Server ─────────────────────────────────────────────────────────────────────
FROM base AS server
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
RUN pnpm install --frozen-lockfile --filter @webhook-catcher/server

WORKDIR /app/apps/server
COPY apps/server/src ./src

# Copy built frontend so Fastify can serve it
COPY --from=web-builder /app/apps/web/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "node src/db/migrate.js && node src/db/seed.js && node src/index.js"]
