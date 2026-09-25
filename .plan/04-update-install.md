# 04 Update and Install

**Status:** done (privacy-required items; explicit `upgrade` command body deferred to phase 5)

## 1. Goal

The binary never checks for, downloads, or installs a new version. Updates are a manual package-manager action outside the app.

## 2. Owned files

- `packages/opencode/src/cli/upgrade.ts` (delete)
- `packages/opencode/src/cli/cmd/upgrade.ts` (delete) and registration in `index.ts:8`
- `packages/opencode/src/cli/tui/worker.ts` lines 59-62 (`checkUpgrade`)
- `packages/opencode/src/cli/cmd/tui.ts` line 266 (schedule)
- `packages/opencode/src/installation/index.ts` lines 144-321 (`latest`, `upgrade`, `method`, install script)
- `packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts` lines 88-98 (`global.upgrade` route)
- `packages/tui/src/app.tsx` lines 1033-1060 (update dialog)
- `packages/core/src/flag/flag.ts` lines 23-24 (`OPENCODE_DISABLE_AUTOUPDATE`, `OPENCODE_ALWAYS_NOTIFY_UPDATE`)
- `packages/core/src/v1/config/config.ts` lines 64-67 (`autoupdate`)
- `packages/opencode/src/cli/cmd/uninstall.ts` (review; local-only, likely keep)
- `install` script at repo root (review; it is the curl installer, keep for distribution but it is not called by the binary)

## 3. Changes

| Id | Change |
|---|---|
| U1 | Delete the startup check, the CLI command, the HttpApi route, the TUI dialog, the `Installation.latest/upgrade/method` functions, the two flags, and the `autoupdate` config key. Keep `Installation.Event` only if other events remain in that namespace. |
| U2 | Regenerate the client after removing `global.upgrade`. |

## 4. Verification

- `grep -rn "upgrade\|autoupdate\|latest" packages/opencode/src/installation packages/opencode/src/cli` shows nothing network-related.
- Start the TUI with `OPENCODE_DISABLE_AUTOUPDATE` unset and confirm no outbound connection in the loopback-only test (`11`).

## 5. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
| `packages/opencode/src/cli/upgrade.ts` | Deleted. | U1: the startup version check and silent self-upgrade. |
| `packages/opencode/src/cli/tui/worker.ts`, `packages/opencode/src/cli/cmd/tui.ts` | `checkUpgrade` RPC and the 1s post-start schedule removed. | U1. |
| `packages/opencode/src/server/routes/instance/httpapi/groups/global.ts`, `handlers/global.ts` | `global.upgrade` route, `GlobalUpgradeInput`/`GlobalUpgradeResult`, handler, and the `Installation` dependency removed; `semver` import dropped with them. SDK and `packages/sdk/openapi.json` regenerated with `bun run generate`. | U1, U2. |
| `packages/tui/src/app.tsx` | `installation.update-available` handler (update dialog, `skipped_version` KV, `global.upgrade` call), `isVersionGreater`, and the `DialogAlert` import removed. | U1. |
| `packages/schema/src/installation-event.ts`, `packages/schema/src/event-manifest.ts` | `installation.updated` / `installation.update-available` events deleted and removed from the manifest. | U1: no emitter remains once the startup check and the route are gone. |
| `packages/opencode/src/installation/index.ts` | `Installation.Event`, `ReleaseType`, and `getReleaseType` removed (only the startup check used them). `method`, `latest`, `upgrade`, `info`, `UpgradeFailedError` and the install-script download remain for the explicit command. | U1 partial; see cross-region notes. |
| `packages/core/src/flag/flag.ts` | `OPENCODE_DISABLE_AUTOUPDATE` and `OPENCODE_ALWAYS_NOTIFY_UPDATE` removed. | U1. |
| `packages/core/src/v1/config/config.ts`, `packages/core/src/config.ts`, `packages/core/src/v1/config/migrate.ts`, `packages/core/src/plugin/skill/customize-opencode.md` | `autoupdate` config key removed from V1 and V2 schemas, the V1 to V2 migration, and the config example. | U1. |
| Tests | Deleted `test/server/httpapi-global.test.ts` (upgrade-only). Removed the `global.upgrade` scenario from `httpapi-exercise`, `OPENCODE_DISABLE_AUTOUPDATE` from `test/lib/cli-process.ts`, `autoupdate` cases from `test/config/config.test.ts` and `packages/core/test/config/config.test.ts` (managed-settings tests now assert on `snapshot`), and switched `packages/tui/test/cli/tui/use-event.test.tsx` to `server.connected` as its sample global event. | Tests deleted with the code they cover. |

## 6. Cross-region notes

- Left for phase 5 (discretionary, per `README.md` section 4): `packages/opencode/src/cli/cmd/upgrade.ts` (`opencode upgrade [target]`, still registered in `index.ts`), `packages/opencode/src/cli/cmd/uninstall.ts` (uses `Installation.method()`), and in `packages/opencode/src/installation/index.ts` the `method`, `latest`, `upgrade`, `info`, `Info`, `UpgradeFailedError`, `upgradeCurl` (downloads `https://opencode.ai/install`), and the brew/npm/choco/scoop/GitHub version lookups in `latest`. None of these run without an explicit user command. `test/installation/installation.test.ts` still covers `latest` and `upgrade` and passes.
- The binary now performs no version check or download on its own: nothing calls `Installation.latest` or `Installation.upgrade` except the explicit `upgrade` command, and `Installation.info` has no callers.
- `install` at the repo root was not reviewed here; it is not invoked by the binary.
