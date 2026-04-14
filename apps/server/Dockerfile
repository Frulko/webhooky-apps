FROM node:22-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

# Copy lockfile from monorepo root + app manifest
COPY pnpm-lock.yaml ./
COPY apps/server/package.json ./package.json
RUN pnpm install --frozen-lockfile

COPY apps/server/src ./src

EXPOSE 3000

CMD ["sh", "-c", "node src/db/migrate.js && node src/db/seed.js && node src/index.js"]
