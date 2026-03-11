# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
COPY packages/cli/package.json ./packages/cli/

RUN npm install --ignore-scripts

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/cli/ ./packages/cli/

RUN npm run build --workspace=packages/cli

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Only production deps
COPY package.json package-lock.json* ./
COPY packages/cli/package.json ./packages/cli/

RUN npm install --workspace=packages/cli --omit=dev --ignore-scripts

# Copy compiled output
COPY --from=builder /app/packages/cli/dist ./packages/cli/dist

# Expose the CLI as a command
ENV PATH="/app/packages/cli/dist:$PATH"

# Default: run the CLI (override with docker run -- vibe <cmd>)
ENTRYPOINT ["node", "/app/packages/cli/dist/cli.js"]
CMD ["--help"]
