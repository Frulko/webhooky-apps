FROM node:22-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

COPY package.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src

EXPOSE 3000

CMD ["sh", "-c", "node src/db/migrate.js && node src/db/seed.js && node src/index.js"]
