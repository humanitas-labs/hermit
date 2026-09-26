# 04 Update and Install

**Status:** not started

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

| Id  | Change                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Delete the startup check, the CLI command, the HttpApi route, the TUI dialog, the `Installation.latest/upgrade/method` functions, the two flags, and the `autoupdate` config key. Keep `Installation.Event` only if other events remain in that namespace. |
| U2  | Regenerate the client after removing `global.upgrade`.                                                                                                                                                                                                     |

## 4. Verification

- `grep -rn "upgrade\|autoupdate\|latest" packages/opencode/src/installation packages/opencode/src/cli` shows nothing network-related.
- Start the TUI with `OPENCODE_DISABLE_AUTOUPDATE` unset and confirm no outbound connection in the loopback-only test (`11`).

## 5. Divergence log

| Upstream file | Change | Reason |
| ------------- | ------ | ------ |
