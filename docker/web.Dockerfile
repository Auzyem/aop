# ============================================================
# Stage 1 — Dependencies
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2 — Build
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY apps/web/package.json ./apps/web/

RUN HUSKY=0 pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/types/ ./packages/types/
COPY packages/utils/ ./packages/utils/
COPY apps/web/ ./apps/web/

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @aop/types build
RUN pnpm --filter @aop/utils build
RUN pnpm --filter @aop/web build

# ============================================================
# Stage 3 — Runtime (Next.js standalone output)
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
