# 05 Plugins and npm

**Status:** done (branch `plugins-npm`; LSP `Npm.which` sites deferred to `07`, see Cross-region notes)

## 1. Goal

The binary never runs an npm install on its own. Installs happen only for entries the user wrote into config. Built-in auth plugins stay (see `01` section 4).

## 2. Owned files

- `packages/opencode/src/config/config.ts` lines 452-470 (bootstrap install of `@opencode-ai/plugin`)
- `packages/core/src/npm.ts`, `packages/core/src/npm-config.ts`
- `packages/opencode/src/plugin/index.ts` lines 62-86 (built-in list, Codex WS gate), 168-187 (loading)
- `packages/opencode/src/plugin/shared.ts` lines 207-212
- `packages/core/src/config/plugin/external.ts` lines 58-77
- `packages/opencode/src/cli/cmd/plug.ts` (review, P5)
- `packages/opencode/src/provider/provider.ts` lines 1836-1850 (`Npm.add` for non-bundled provider packages)
- `packages/opencode/src/format/formatter.ts` lines 71-148 (`Npm.which` for formatters)
- `packages/opencode/src/lsp/server.ts` `Npm.which` call sites (owned by `07`, listed here for the shared decision)
- `packages/opencode/package.json`: no dependency changes. The provider catalog and its auth plugins stay per `01` section 4.

## 3. Changes

| Id | Change | Notes |
|---|---|---|
| P1 | Delete the automatic bootstrap install block in `config.ts:452-470`. | Local `.opencode/plugin/*.ts` files that `import "@opencode-ai/plugin"` need the package resolvable. Verify how `plugin/shared.ts` loads them from the compiled binary; if the import fails without `node_modules`, document `bun add @opencode-ai/plugin` in the config dir, or resolve the specifier to the bundled module. |
| P2 | Keep `Npm` and Arborist. They serve explicit config: `plugin: [...]`, non-bundled provider `npm` values, project-declared formatters, and LSP servers. These are class T. A dependency in a repository's `package.json` is not itself authorization to download or execute it: an LSP server or formatter is fetched only through the paths `07` B2 gates, never because a project lists it. | No change to `npm.ts`. |
| P3 | Log one line naming any npm package about to be installed, the registry destination, and why (config entry, LSP, formatter), before the install runs. | `plugin/shared.ts:207`, `core/src/config/plugin/external.ts:75`, `lsp/server.ts` npm sites. Small. |
| P4 | Delete the Codex WebSocket channel gate that turns the feature on for non-prod channels (`plugin/index.ts:62-73`); leave it flag-only. | The channel default is an implicit behavior change by build channel; make it explicit. |
| P5 | Delete `opencode plug` only if it depends on removed hosted services; otherwise keep. | Check the command body. |

## 4. Preserve

- The plugin hook system itself (`packages/plugin`, `plugin/index.ts` hook dispatch). Local plugins remain supported and are useful for users.
- `formatter` support for binaries found on PATH.

## 5. Verification

- Fresh startup with no configured plugins performs no npm install (harness S6).
- A config with `plugin: ["some-npm-pkg"]` installs, logs the install, and loads.
- A project-level `plugin` entry pointing at an npm package installs only if plugins from project config are already permitted upstream; confirm the current behavior and record it. It must never install silently.
- A local `file://` plugin loads.
- Harness S14 covers tooling downloads with the flag set and unset.

## 6. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
| `packages/opencode/src/config/config.ts` | Deleted the per-config-directory bootstrap install of `@opencode-ai/plugin` and the `Npm` service dependency. `waitForDependencies` stays as the sequencing hook the plugin loader and tool registry call; `deps` is now always empty. | P1. The binary never runs an npm install on its own. |
| `packages/opencode/src/config/tui.ts` | Deleted the same bootstrap install on the TUI config path; `TuiConfig.waitForDependencies` is a no-op. Dropped the `dirs` field `loadState` returned only for that install. | P1. Same bootstrap on the TUI side, not in the original line list because it postdates the audit anchor. |
| `packages/core/src/npm.ts` | `add(pkg, reason)` and `which(pkg, bin?, reason?)`. `reify` logs one INFO line (`installing npm package`: packages, registry, reason, dir) before Arborist runs. Deleted `install(dir, ...)`, which reified a directory's `package.json` dependencies; the bootstrap was its only caller. | P2, P3. The registry is only known inside `reify`, so the log lives there and the reason is threaded in. Deleting `install` removes the only code path that downloaded a directory's declared dependencies. |
| `packages/core/src/config/plugin/external.ts`, `packages/opencode/src/plugin/shared.ts` | `add(..., "config plugin")`. | P3. |
| `packages/opencode/src/provider/provider.ts`, `packages/core/src/plugin/provider/dynamic.ts`, `packages/core/src/plugin/provider/sap-ai-core.ts` | `add(..., "provider <id>")` for non-bundled provider SDK packages. | P3. The two core files are the native-runtime equivalents of the `provider.ts` site and were not in the original line list. |
| `packages/opencode/src/format/formatter.ts`, `packages/opencode/src/format/index.ts` | `Context.disableLspDownload` (from `RuntimeFlags`) gates the prettier, oxfmt, and biome `Npm.which` calls; each passes reason `"formatter"`. | P2. A project listing a formatter in `package.json` is not authorization to download it; the same flag that `07` B2 applies to LSP servers covers formatters. |
| `packages/opencode/src/plugin/index.ts` | Deleted `experimentalWebSocketsEnabled` and the channel-based default; Codex WebSockets follow `OPENCODE_EXPERIMENTAL_WEBSOCKETS` only. | P4. |
| `packages/opencode/src/cli/cmd/plug.ts` | Kept unchanged. It resolves the package through `resolvePluginTarget` and patches local config; no hosted service. | P5. |
| `README.md` | Documented that Hermit never installs on its own and the manual `bun add @opencode-ai/plugin` for local plugins and tools with runtime imports. | P1 note. |
| Tests | Deleted `test/plugin/openai-rollout.test.ts`, `test/fixture/plugin.ts` (and its uses in `provider.test.ts`, `httpapi-provider.test.ts`), the `installs dependencies in writable OPENCODE_CONFIG_DIR` case in `config.test.ts`, and the `Npm.install` case in `core/test/npm.test.ts`. Updated `Npm` mocks and `add` call expectations for the new signature. | Tests removed with the code they covered. |

## 7. Cross-region notes

- `07` (`packages/opencode/src/lsp/server.ts`): pass a reason at each of the ten `Npm.which` sites, e.g. `Npm.which("pyright", "pyright-langserver", "lsp python")`, so the install log names the trigger. Until then those sites log `reason="bin lookup"`. B2's `if (flags.disableLspDownload) return` guard should sit before each `Npm.which` call, matching the shape already used for `@vue/language-server` at line 152 and the one this branch used in `formatter.ts`.
- `07` B3: formatter download logging is already covered by the `reify` log line with reason `"formatter"`; `07` only needs the LSP reasons above and the tree-sitter grammar line.
- `packages/opencode/src/format/index.ts` line 46 is outside this plan's owned list; the one-line change passes `flags.disableLspDownload` into the formatter context.
- `packages/core/src/plugin/provider/dynamic.ts` and `sap-ai-core.ts` are outside the owned list; only the `add` call gained a reason argument.
- `11` S6: the fresh-start run below is the manual equivalent of S6 for the bootstrap install; the harness should assert no `installing npm package` log line and no `node_modules` under the config directory.
- `10`: `packages/opencode/src/provider/provider.ts` was touched only at the `Npm.add` line; the boundary code is unchanged.

## 8. Verification record

- Fresh start, isolated `XDG_*` and `OPENCODE_TEST_HOME`, `OPENCODE_DISABLE_DEFAULT_PLUGINS` unset, `models --print-logs --log-level INFO`: zero `installing npm package` lines; the config directory contains only `.gitignore` and `opencode.jsonc`; no `node_modules`, `package.json`, or lockfile anywhere under the isolated root. No `Npm.install` code path remains in the tree.
- Project `opencode.json` with `plugin: ["hermit-fixture@file:<dir>"]`, same isolation: one INFO line `installing npm package` with `packages`, `registry=https://registry.npmjs.org/`, `reason="config plugin"`, and the cache `dir`; `node_modules` appears under `<cache>/opencode/packages/<spec>/`, and the run completes with no plugin error.
- Project-level `plugin` entries install without a prompt, the same as global entries; upstream's only gate is `--pure` / `OPENCODE_PURE`, which skips every external plugin. Recorded, not changed: a project config entry is an explicit user-written list, so it is class T, and the log line makes it visible.
- `file://` and path plugins never reach `Npm.add` (`isPathPluginSpec` short-circuits in `resolvePluginTarget`); covered by `test/plugin/loader-shared.test.ts`.
- Local TypeScript plugins from the compiled binary (M3): verified with a Bun-compiled test binary that bare specifiers in an externally imported `.ts` file resolve against the filesystem only, not the embedded bundle; `import type` is erased and works without `node_modules`. Hence the manual install documented in `README.md` is required only for runtime imports.
