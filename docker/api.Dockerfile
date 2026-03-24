# ============================================================
# Stage 1 — Dependencies
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY apps/api/package.json ./apps/api/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# ============================================================
# Stage 2 — Build
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client, then build
RUN pnpm --filter @aop/db db:generate
RUN pnpm --filter @aop/api build

# ============================================================
# Stage 3 — Runtime
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 aop

COPY --from=deps --chown=aop:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=aop:nodejs /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder --chown=aop:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=aop:nodejs /app/packages/db/prisma ./packages/db/prisma

USER aop

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/healthz || exit 1

CMD ["node", "apps/api/dist/index.js"]
