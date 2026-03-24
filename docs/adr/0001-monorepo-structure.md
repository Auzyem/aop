# ADR-0001: pnpm Workspaces Monorepo Structure

**Date:** 2026-03-21
**Status:** Accepted
**Deciders:** AOP Engineering

---

## Context

The Aurum Operations Platform requires a frontend (Next.js), a backend API (Express), and a
background worker (BullMQ) that all share domain types and utilities. We need to decide how to
organise these into one or more repositories.

## Decision Drivers

- Shared TypeScript types between API and frontend must be versioned together
- Prisma schema and generated client need to be accessible from both API and worker
- Single CI/CD pipeline is preferred at this stage of the project
- The team is small; cross-repo dependency management overhead should be minimised

## Considered Options

1. **pnpm Workspaces monorepo** — single repo, multiple packages, pnpm manages hoisting
2. **Turborepo + pnpm** — adds a build orchestrator on top of pnpm workspaces
3. **Separate repositories** — one repo per service, packages published to a private registry

## Decision Outcome

**Chosen option:** pnpm Workspaces monorepo (option 1).

Turborepo was deferred: the added caching benefit is valuable at scale but introduces complexity
that isn't justified before the build graph is mature. It can be layered on later without
restructuring. Separate repos were ruled out because shared type drift has caused bugs on prior
projects.

### Positive Consequences

- Atomic commits across services (e.g., a new API shape and its UI consumer land together)
- `workspace:*` protocol ensures packages always resolve to local source
- Simple to add Turborepo later if build times become an issue

### Negative Consequences

- A single `pnpm install` installs all deps; the workspace grows larger over time
- Repository access control is coarser-grained than separate repos

## Links

- [pnpm Workspaces docs](https://pnpm.io/workspaces)
