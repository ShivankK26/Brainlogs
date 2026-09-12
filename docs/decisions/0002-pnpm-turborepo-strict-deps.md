# 0002 — pnpm workspaces with strict dependency resolution

**Status:** accepted · **Date:** 2026-09-12

## Context

Upstream used npm workspaces with hoisting. Several packages import modules they never declared (for example `drizzle-orm` from `packages/capture`) and rely on npm placing them at the root.

## Decision

Use pnpm (strict, isolated `node_modules`) and Turborepo. Every package declares what it imports. Native modules that need a postinstall are allow-listed in `pnpm-workspace.yaml` (`onlyBuiltDependencies`).

`workspace:*` is used for internal packages so a published `@brainlog/cli` or `@brainlog/mcp` gets a concrete version at publish time.

## Consequences

- Undeclared imports fail at `pnpm typecheck` instead of at runtime on a user's machine. Missing declarations were added during Phase 0.
- `pnpm install` is faster and disk usage is lower than npm.
