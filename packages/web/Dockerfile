# Development image — hot reload via volume-mounted src/
FROM node:20-alpine

WORKDIR /app

# Install deps first (cached layer)
COPY package.json package-lock.json* ./
COPY packages/web/package.json ./packages/web/

RUN npm install --workspace=packages/web

# Copy config files
COPY tsconfig.base.json ./
COPY packages/web/tsconfig.json ./packages/web/
COPY packages/web/next.config.js ./packages/web/
COPY packages/web/tailwind.config.ts ./packages/web/
COPY packages/web/postcss.config.js ./packages/web/
COPY packages/web/drizzle.config.ts ./packages/web/

# Copy source (overridden by volume mount in docker-compose)
COPY packages/web/src ./packages/web/src

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace=packages/web"]
