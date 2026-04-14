FROM node:22-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests + lockfile so pnpm can resolve the full workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/package.json
# Stub other workspace manifests so pnpm doesn't complain about missing packages
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json

RUN pnpm install --frozen-lockfile --filter @webhook-catcher/server

WORKDIR /app/apps/server
COPY apps/server/src ./src

EXPOSE 3000

CMD ["sh", "-c", "node src/db/migrate.js && node src/db/seed.js && node src/index.js"]
