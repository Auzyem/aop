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

RUN HUSKY=0 pnpm install --frozen-lockfile --prod

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

RUN HUSKY=0 pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm --filter @aop/types build
RUN pnpm --filter @aop/utils build
RUN pnpm --filter @aop/db db:generate
RUN pnpm --filter @aop/db build
RUN pnpm --filter @aop/worker build

# ============================================================
# Stage 3 — Runtime
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# OpenSSL required by Prisma query engine at runtime
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 aop

COPY --from=builder --chown=aop:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=aop:nodejs /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps --chown=aop:nodejs /app/packages/utils/node_modules ./packages/utils/node_modules
COPY --from=deps --chown=aop:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder --chown=aop:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=aop:nodejs /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder --chown=aop:nodejs /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=aop:nodejs /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder --chown=aop:nodejs /app/packages/utils/package.json ./packages/utils/package.json
COPY --from=builder --chown=aop:nodejs /app/packages/utils/dist ./packages/utils/dist
COPY --from=builder --chown=aop:nodejs /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder --chown=aop:nodejs /app/packages/types/dist ./packages/types/dist

USER aop

CMD ["node", "apps/worker/dist/apps/worker/src/index.js"]
