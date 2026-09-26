# 03 Share

**Status:** not started

## 1. Goal

No code path can transmit a session transcript. The `share` concept is removed from config, protocol, TUI, and CLI.

## 2. Owned files

- `packages/opencode/src/share/*` (delete)
- `packages/core/src/share/*` (delete, `session_share` table)
- `packages/opencode/src/project/bootstrap.ts` lines 28,41-44 (`ShareNext.init`)
- `packages/opencode/src/session/session.ts` (`setShare`, `Info.share`)
- `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts` lines 156, 259-261 and route definitions
- `packages/opencode/src/cli/cmd/run.ts` lines 161-164, 535-548 (`--share`)
- `packages/opencode/src/cli/cmd/import.ts` (delete)
- `packages/opencode/src/cli/cmd/github.handler.ts` (deleted by `08`)
- `packages/core/src/v1/config/config.ts` lines 57-63 (`share`, `autoshare`)
- `packages/opencode/src/config/config.ts` lines 589-591 (`autoshare` migration)
- `packages/opencode/src/effect/runtime-flags.ts` line 17 (`OPENCODE_AUTO_SHARE`)
- `packages/tui/src` `/share` command and tips (`feature-plugins/home/tips-view.tsx:170` and the command registration)

## 3. Changes

| Id  | Change                                                                                     | Notes                                                |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| S1  | Delete share modules, table, and bootstrap init. Add a migration dropping `session_share`. |                                                      |
| S2  | Remove `share` from `Session.Info` in the protocol and `setShare`. Regenerate the SDK.     | Remove the field; the only consumer left is the TUI. |
| S3  | Remove config keys, flag, CLI flag, `import` command, TUI command.                         |                                                      |

## 4. Verification

- `grep -rni "share" packages/opencode/src packages/core/src` shows only unrelated words (e.g. `SharedArrayBuffer`, "shared" helpers).
- `bun run generate` from the repo root clean; `bun typecheck` in all touched packages.

## 5. Divergence log

| Upstream file | Change | Reason |
| ------------- | ------ | ------ |
