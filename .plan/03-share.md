# 03 Share

**Status:** done

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
|---|---|---|
| `packages/opencode/src/share/share-next.ts` | Deleted. | S1: the share transport (`opncd.ai` / `enterprise.url` sync, create, remove, event subscribers). |
| `packages/opencode/src/share/session.ts` | Replaced by a stub `SessionShare` service whose only method `share()` fails with "Session sharing is not available in Hermit". No config read, no network, no session mutation. | `cli/cmd/github.handler.ts` yields `SessionShare.Service` and is owned by `08`; the stub keeps it compiling until `08` deletes it. Remove the stub with that file. |
| `packages/core/src/share/sql.ts` | Deleted (`session_share` table). | S1. |
| `packages/core/src/session/sql.ts`, `packages/core/src/session/projector.ts` | `share_url` column and projection removed. | S2. |
| `packages/core/src/database/migration/20260925221212_drop_session_share.ts`, `migration.gen.ts`, `schema.gen.ts`, `packages/core/schema.json` | Migration drops `session_share` and `session.share_url`; fresh-install schema no longer creates them. Generated with `bun script/migration.ts --name drop_session_share` from `packages/core`. | S1, S2. |
| `packages/opencode/src/project/bootstrap.ts`, `packages/opencode/src/effect/bootstrap-runtime.ts`, `packages/opencode/src/effect/app-runtime.ts`, `packages/opencode/src/server/routes/instance/httpapi/server.ts` | `ShareNext.node` removed everywhere; `SessionShare.node` (stub) stays only in `app-runtime.ts` for the GitHub handler. | S1. |
| `packages/opencode/src/session/session.ts` | `Share` schema, `Info.share`, `Patch.share`, `setShare`, and the row mapping removed. | S2. |
| `packages/schema/src/v1/session.ts`, `packages/schema/src/tui-event.ts`, `packages/plugin/src/tui.ts` | `SessionInfo.share`, the `session.share` TUI command literal, and the `sidebar_title.share_url` slot prop removed. | S2, S3. |
| `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`, `handlers/session.ts`, `handlers/tui.ts`, `public.ts` | `session.share` / `session.unshare` routes and handlers removed; `session.create` calls `Session.create` directly instead of `SessionShare.create`; `session_share` TUI alias and the `share.url` nullable OpenAPI patch removed. SDK and `packages/sdk/openapi.json` regenerated with `bun run generate`. | S2. |
| `packages/core/src/v1/config/config.ts`, `packages/core/src/config.ts`, `packages/core/src/v1/config/migrate.ts` | `share`, `autoshare`, and `enterprise` config keys removed from V1 and V2 schemas and from the V1 to V2 migration. | S3. `enterprise.url` existed only as the share service base URL. |
| `packages/opencode/src/config/config.ts` | `autoshare` to `share` migration block removed. | S3. |
| `packages/opencode/src/effect/runtime-flags.ts` | `autoShare` (`OPENCODE_AUTO_SHARE`) removed. | S3. |
| `packages/opencode/src/cli/cmd/run.ts`, `packages/opencode/src/cli/cmd/run/runtime.ts` | `--share` flag, the `share()` helper, and the `share` hook on the interactive runtime removed. | S3. |
| `packages/opencode/src/cli/cmd/import.ts`, `packages/opencode/src/index.ts` | `import` command deleted and unregistered. | S3: it pulled transcripts from the share service. |
| `packages/opencode/src/storage/schema.ts` | `SessionShareTable` re-export removed. | S1. |
| `packages/tui/src/config/keybind.ts`, `packages/tui/src/routes/session/index.tsx`, `packages/tui/src/routes/session/sidebar.tsx`, `packages/tui/src/feature-plugins/home/tips-view.tsx` | `session_share` / `session_unshare` keybinds, the `/share` and `/unshare` commands, the sidebar share URL, and four share tips removed. | S3. |
| `packages/core/src/plugin/skill/customize-opencode.md` | `share` key dropped from the config example. | S3. |
| Tests | Deleted `test/share/share-next.test.ts` and `test/cli/import.test.ts`; removed share/autoshare cases from `test/config/config.test.ts`, `test/effect/runtime-flags.test.ts`, `test/server/httpapi-session.test.ts`, `test/session/schema-decoding.test.ts`, `test/session/session-schema.test.ts`, the `httpapi-exercise` scenario list, `packages/core/test/config/config.test.ts`; `test/cli/help` no longer pins `import` and its snapshot was regenerated for `run` and `providers login`. | Tests deleted with the code they cover. |

## 6. Cross-region notes

- `packages/opencode/src/cli/cmd/github.handler.ts` (deleted by `08`) still imports `SessionShare` and reads the `SHARE` env var. Not edited. The stub in `packages/opencode/src/share/session.ts` and its `SessionShare.node` entry in `app-runtime.ts` exist only for it; delete both in `08` together with the handler.
- The legacy JavaScript SDK in `packages/sdk/js/src/gen` has no generator in this tree (`packages/sdk/js/script/build.ts` only formats it), so it still declares `session.share`, `session.unshare`, `Session.share`, and `KeybindsConfig.session_share`. The server no longer serves those routes. Regenerating or deleting the legacy client belongs to whichever plan retires it (`08` or `12`).
- `packages/opencode/test/cli/help/__snapshots__/help-snapshots.test.ts.snap` still carries an `opencode web --help` entry that fails because `13` removed the `web` command; left for `13`/`08`.
- The upstream `20260127222353_familiar_lady_ursula` migration still creates `session_share` and `share_url` for pre-existing databases; the new migration drops them afterwards. Migration history is append-only, so that is intentional.
