# 13 Strip the Repository

**Status:** in progress (Tier 1 landed; Tier 2 not started)

## 1. Goal

The repository contains the agent and nothing else. Anything that exists to run OpenCode as a company, publish it as a product, or host it as a service is deleted, not disabled. Hermit users build from source, so packaging, release automation, hosted services, marketing, and desktop or web front ends are out of scope.

This region is orthogonal to the privacy regions `01`-`11`. It deletes packages and commands; it does not change internals.

## 2. Ordering

Tier 1 runs before the privacy regions. It touches no file those regions edit, so it cannot entangle an upstream port, and it cuts install and typecheck time for every later step. This supersedes plan `12` item N5, which said to defer the deletion.

Tier 2 is a product decision (TUI-only) and runs as its own commit once confirmed. Tier 3 is already owned by the privacy regions and is listed here only for sizing.

## 3. The shipped binary

`packages/opencode/script/build.ts` bundles these workspace packages. They are the product and stay.

| Package | Role |
|---|---|
| `opencode` | CLI, TUI entry, session loop, tools, providers |
| `core`, `llm`, `server`, `protocol`, `schema` | V2 core, native LLM runtime, local HTTP API |
| `tui` | terminal UI |
| `plugin`, `sdk` | plugin API and the generated TypeScript client for the local API, consumed by the TUI and plugins |
| `codemode`, `script` | confined code execution tool; version helper |
| `effect-drizzle-sqlite`, `effect-sqlite-node`, `http-recorder` | SQLite layer; HTTP cassette recorder used by core and llm tests |

## 4. Tier 1: not in the binary, zero behavior change

| Target | Files | What it is |
|---|---|---|
| `packages/console` | 589 | opencode.ai hosted console, includes 41 MB of landing-page video |
| `packages/web` | 705 | opencode.ai marketing and docs site |
| `packages/desktop` | 306 | Tauri desktop app |
| `packages/stats`, `STATS.md`, `script/stats.ts` | 117 | download-stats dashboard |
| `packages/enterprise`, `function`, `slack`, `storybook`, `sdk-next`, `identity`, `docs`, `containers`, `cli` | 133 | enterprise UI, Cloudflare worker, Slack bot, Storybook, dead SDK successor, logo PNGs, Mintlify docs, Docker build images, experimental second CLI (`lildax`) |
| `artifacts/` | 20 | promotional video project |
| `infra/`, `sst.config.ts`, `sst-env.d.ts` | 10 | SST deployment (AWS, Cloudflare, Stripe, PlanetScale) |
| `github/`, `sdks/` | 26 | GitHub Action package, VS Code extension |
| `nix/`, `flake.nix`, `flake.lock` | 8 | Nix packaging |
| `.github/` | 36 | upstream ops workflows: publish, deploy, Discord, triage, locale sync, stats |
| `script/` | 18 | publish, release, changelog, beta, translate, duplicate-PR, issue closers. `format.ts` and `generate.ts` became the root `format` and `generate` package scripts; the pre-push hook installer was dropped |
| `.opencode/`, `.husky/`, `.vscode/`, `.zed/` | 43 | upstream agent config, hooks, editor settings |
| `CONTRIBUTING.md` | 1 | upstream process; replaced by `AGENTS.md` and `docs/fork.md` |
| root `package.json` | | remove `packages/console/*`, `packages/stats/*`, `packages/slack` workspaces; `dev:desktop`, `dev:console`, `dev:stats`, `dev:storybook`, `sso`, `translate:app`, `random`, `prepare` scripts; `@aws-sdk/client-s3`, `heap-snapshot-toolkit`, `@actions/artifact`, `sst`, `husky` deps; Sentry, Electron and SolidStart catalog entries |
| `turbo.json` | | drop task entries for removed packages |
| `bunfig.toml` | | drop Electron entries from `minimumReleaseAgeExcludes` |
| `patches/` | | drop patches whose consumer left the lockfile after `bun install` |

Kept on purpose: `SECURITY.md` (rewritten under plan `12` N6), `docs/specs/`, `docs/session-runtime.md` (design docs for the V2 core the AGENTS.md rules reference), `install` (plan `04` decides), `.gitleaksignore`, `.dockerignore`, `.oxlintrc.json`.

Git history is kept in full. Cherry-picking upstream fixes depends on the shared ancestry, which is the porting strategy in `docs/fork.md`.

## 5. Tier 2: the web UI stack (TUI-only decision)

| Target | Files | Notes |
|---|---|---|
| `packages/app` | 643 | browser UI, embedded into the binary at build time |
| `packages/ui` | 1,695 | shared web components. The TUI imports five mp3 files from `packages/ui/src/audio` and nothing else |
| `packages/session-ui`, `client`, `httpapi-codegen` | 155 | consumed only by `app`, `desktop`, `sdk-next` |

Steps:

1. Copy the five audio files into `packages/tui` and repoint the imports.
2. Delete the `web` command (`packages/opencode/src/cli/cmd/web.ts`) and its registration in `src/index.ts`.
3. Make `--skip-embed-web-ui` the only path in `packages/opencode/script/build.ts`; delete `createEmbeddedWebUIBundle`.
4. Delete the `app.opencode.ai` reverse proxy in `server/shared/ui.ts` (overlaps plan `08`; note there).
5. Remove the `bun run generate` from `packages/client` rule in `AGENTS.md`.
6. Drop remaining web-only patches (`@dnd-kit/dom`, `@tanstack/virtual-core`, `@pierre/trees`) if they leave the lockfile.

Keep `serve` and `attach`: small, loopback-bound, and they let a local editor or second terminal reach the same session.

## 6. Tier 3: inside the binary (owned by privacy regions, sizing only)

| Subsystem | Lines | Region |
|---|---|---|
| `cli/cmd/github.handler.ts`, `pr.ts` | 1,750 | `08` |
| `account/`, `share/`, `control-plane/` | 2,540 | `02`, `03`, `08` |
| `core/src/github-copilot` and 11 built-in auth plugins | 4,500+ | `01`, `05` |
| 32 V2 provider plugins in `core/src/plugin/provider` | | `01` |
| `upgrade`, `uninstall`, `plug`, `stats` commands | 1,050 | `04`, `05` |

`acp/` (Agent Client Protocol, 3,700 lines) is local stdio and useful for editor integration. Keep.

Tests: delete tests with the code they cover. Do not strip fixtures blindly; `test/tool/fixtures` is large but exercised.

## 7. Verification

- `bun install` completes with no missing-workspace or unused-patch errors.
- `bun typecheck` from `packages/opencode` and `packages/core` passes.
- `bun test` from `packages/opencode` passes for kept suites.
- After Tier 2: `bun run build --skip-install` in `packages/opencode` produces a binary and `hermit` starts the TUI.

## 8. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
| root `package.json`, `turbo.json`, `bunfig.toml` | workspace and script entries removed | packages deleted |
| Tier 1 paths above | deleted | not part of the agent |

## 9. Cross-region notes

- Plan `12` N5: superseded by this file. Plan `12` keeps N6 (`SECURITY.md`, `LICENSE` attribution).
- Plan `08`: the `app.opencode.ai` proxy removal lands with Tier 2 here if Tier 2 runs first.

## 10. Patches triage

`patches/` holds upstream fixes applied on top of third-party packages. Removing one silently reintroduces the bug it fixes, so each is classified rather than deleted wholesale.

| Patch | What it does | Decision |
|---|---|---|
| `@ai-sdk/anthropic`, `amazon-bedrock`, `google`, `groq`, `mistral`, `openai`, `openai-compatible`, `xai` | provider option types, reasoning effort, cache keys, empty-message handling, error passthrough | keep; model reliability is priority 2 in `docs/fork.md`. Drop a patch only when plan `01` drops its provider |
| `@modelcontextprotocol/sdk` | `callTool` typing and compat schema | keep |
| `effect` | SSE JSON schema in the HTTP API | keep |
| `@silvia-odwyer/photon-node` | wasm binding init fix for image handling | keep |
| `@standard-community/standard-openapi` | remote `$ref` handling in OpenAPI generation | keep while `opencode generate` exists |
| `gcp-metadata` | silence AggregateError outside GCP | drop with `google-vertex` in plan `01` if that provider goes |
| `@npmcli/agent`, `pacote` | proxy and git-tarball fallback for runtime npm installs | drop with plan `05` if runtime npm installs are removed |
| `solid-js` | transition value fix, upstream issue 2046 | keep; the TUI runs on Solid |
| `@dnd-kit/dom`, `@tanstack/virtual-core`, `@pierre/trees` | web UI drag, virtual list, file tree | drop with Tier 2 |
| `install-korean-ime-fix.sh` | user-side shell script that patches an installed binary | delete; not a dependency patch. Check whether the fix is already in `tui` |

## 11. Docs layout

Durable documents moved to `docs/`: `privacy-model.md`, `fork.md`, `upstream.md`, `session-runtime.md` (was `CONTEXT.md`), and `specs/` (including the former `perf/`). `README.md` and `AGENTS.md` stay at the root. `.plan/` stays at the root as the working surface. All references updated; `packages/opencode/AGENTS.md` still points at a `specs/effect/migration.md` that did not exist upstream either.

## 12. Metrics

Captured with the scratchpad `metrics.sh` before and after each tier, for the before-and-after comparison.

| Metric | Baseline | After Tier 1 |
|---|---|---|
| Tracked files | 6,631 | 4,608 |
| Source lines (ts/tsx, excluding tests and generated) | 473,440 | 386,096 |
| Workspace packages | 36 | 19 |
| Direct dependencies (unique across all package.json) | 270 | 188 |
| Locked packages in `bun.lock` | 3,248 | 1,407 |
| Tracked tree size | 143 MB | 58 MB |
