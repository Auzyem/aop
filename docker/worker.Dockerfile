# ============================================================
# Stage 1 — Dependencies
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY apps/worker/package.json ./apps/worker/

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
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm --filter @aop/db db:generate
RUN pnpm --filter @aop/worker build

# ============================================================
# Stage 3 — Runtime
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 aop

COPY --from=deps --chown=aop:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=aop:nodejs /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder --chown=aop:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=aop:nodejs /app/packages/db/prisma ./packages/db/prisma

USER aop

CMD ["node", "apps/worker/dist/index.js"]
