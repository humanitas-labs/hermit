# 05 Plugins and npm

**Status:** not started (revised for explicit egress)

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
