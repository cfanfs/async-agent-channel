# Repository Guidelines

## Project Structure & Module Organization

Source lives under `src/`. `src/cli/` contains the `aac` command surface, `src/channel/` implements email and relay transport logic, `src/server/` is the standalone relay server, and `src/mcp/` exposes the MCP entrypoint. Local persistence is in `src/store/`, message models in `src/message/`, workspace path enforcement in `src/workspace/`, and keychain access in `src/keychain/`. Tests are colocated as `*.test.ts` beside the modules they cover. Design notes live in `docs/`, sample config in `configs/config.example.yaml`, and container assets in `Dockerfile` and `docker-compose.yml`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies; Node.js 20+ is required.
- `pnpm build`: compile TypeScript from `src/` to `dist/`.
- `pnpm dev -- --help`: run the CLI from source through `tsx`.
- `pnpm test`: run the full Vitest suite once.
- `pnpm test -- --grep "relay"`: run a focused subset of tests.
- `docker compose up -d`: start PostgreSQL plus the relay server for integration-style local work.

Use `pnpm build && pnpm test` before opening a PR.

## Coding Style & Naming Conventions

This repository uses strict TypeScript with ES modules. Follow the existing style: 2-space indentation, semicolons, double-quoted imports, and small focused modules. Prefer descriptive camelCase for variables/functions, PascalCase for types/interfaces/classes, and lowercase file names; existing files mostly use `index.ts`, with test files named after the module (`router.test.ts`, `token.test.ts`). There is no dedicated formatter or linter configured, so consistency with nearby code is expected.

## Testing Guidelines

Vitest is the test runner. Add or update colocated `*.test.ts` coverage whenever changing routing, storage, auth, workspace isolation, or message handling. Cover both success and failure paths for protocol and filesystem boundaries. Run `pnpm test` locally; use `pnpm test -- --grep "<name>"` while iterating.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects such as `Add inbound attachment handling` and `Fix relay inbox persistence and ack flow`. Keep commits narrowly scoped and written in that style. PRs should explain user-visible behavior, configuration or migration impact, and test coverage. Link the relevant issue when applicable, and include CLI examples or screenshots only when output or UX changed.

## Security & Configuration Tips

Do not commit secrets. Keep credentials in the system keychain and local config in `~/.config/aac/config.yaml`. Preserve workspace isolation rules: outbound paths must stay explicit, and inbound writes must remain confined to the configured receive directory.
