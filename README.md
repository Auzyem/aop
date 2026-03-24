# Aurum Operations Platform (AOP)

Cloud-based gold trade finance and export operations system for East African gold financing.

## Repository Structure

```
aop/
├── apps/
│   ├── web/       # Next.js 14 frontend (App Router) — port 3000
│   ├── api/       # Express REST API (TypeScript)    — port 3001
│   └── worker/    # BullMQ background processor
├── packages/
│   ├── db/        # Prisma ORM schema + client
│   ├── types/     # Shared TypeScript types
│   └── utils/     # Shared utilities (logger, errors)
├── infra/         # Terraform IaC (AWS)
├── docker/        # Per-service Dockerfiles
└── docs/          # ADRs and developer guides
```

## Prerequisites

| Tool      | Version | Install                                                                      |
| --------- | ------- | ---------------------------------------------------------------------------- |
| Node.js   | 20 LTS  | [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) |
| pnpm      | ≥ 9     | `corepack enable && corepack prepare pnpm@latest --activate`                 |
| Docker    | ≥ 24    | [Docker Desktop](https://www.docker.com/products/docker-desktop/)            |
| Terraform | ≥ 1.7   | [tfenv](https://github.com/tfutils/tfenv)                                    |

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url> aop
cd aop
nvm use          # or: fnm use
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET to a random string
```

### 3. Start local services (PostgreSQL, Redis, MinIO)

```bash
docker compose up -d
# Wait for all services to be healthy:
docker compose ps
```

### 4. Initialise the database

```bash
pnpm --filter @aop/db db:generate   # generate Prisma client
pnpm --filter @aop/db db:migrate    # run migrations (creates tables)
```

### 5. Run all apps in development mode

```bash
pnpm dev
```

Or run services individually:

```bash
pnpm --filter @aop/api dev      # API on http://localhost:3001
pnpm --filter @aop/web dev      # Web on http://localhost:3000
pnpm --filter @aop/worker dev   # Worker (connects to Redis)
```

### 6. Verify

```bash
curl http://localhost:3001/healthz
# {"status":"ok","timestamp":"..."}
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
MinIO console: [http://localhost:9001](http://localhost:9001) (user: `minioadmin`, pw: `minioadmin`)

---

## Common Commands

| Command                            | Description                                  |
| ---------------------------------- | -------------------------------------------- |
| `pnpm dev`                         | Start all apps concurrently                  |
| `pnpm build`                       | Production build (packages first, then apps) |
| `pnpm typecheck`                   | Type-check all packages                      |
| `pnpm lint`                        | Lint all TypeScript files                    |
| `pnpm lint:fix`                    | Lint and auto-fix                            |
| `pnpm format`                      | Format all files with Prettier               |
| `pnpm --filter @aop/db db:studio`  | Open Prisma Studio                           |
| `pnpm --filter @aop/db db:migrate` | Run pending migrations                       |
| `docker compose down -v`           | Stop services and remove volumes             |

## Environment Variables

See [.env.example](./.env.example) for the full list with descriptions.

## Infrastructure

Terraform configurations are in [`infra/`](./infra/). See [`docs/`](./docs/) for deployment guides.

## Contributing

1. Create a feature branch from `main`
2. Run `pnpm typecheck && pnpm lint` before committing
3. Husky will run lint-staged on pre-commit
4. Open a PR — include a description of the change and how to test it
