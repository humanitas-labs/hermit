# 02 Accounts and Remote Config

**Status:** not started

## 1. Goal

No account concept exists. No config source is remote. The only credential store is the local provider key store.

## 2. Owned files

- `packages/opencode/src/account/*` (delete)
- `packages/core/src/account/*` (delete, includes `sql.ts` tables `account`, `account_state`, `control_account`)
- `packages/opencode/src/cli/cmd/account.ts` (delete) and its registration in `packages/opencode/src/index.ts`
- `packages/opencode/src/config/config.ts` lines 370-409 (well-known loop) and 492-530 (console merge)
- `packages/opencode/src/cli/cmd/providers.ts` lines 324-352 (`login <url>` well-known flow)
- `packages/opencode/src/auth/index.ts` (`wellknown` record type :29-33, `OPENCODE_AUTH_CONTENT` :59-63)
- `packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts` lines 43-80 and the matching group definitions
- `packages/core/src/integration.ts` OAuth refresh for `opencode` (:385-403) and the `opencode` integration id
- `packages/core/src/plugin/provider/opencode.ts` (deleted by `01` C4)
- `packages/opencode/src/share/share-next.ts` org branch (:206-222), deleted wholesale by `03`

## 3. Changes

| Id | Change | Notes |
|---|---|---|
| R1 | Delete the account module, CLI command, SQL tables, and a migration that drops the tables. | Check `packages/core/src/database` for the migration pattern before adding one. |
| R2 | Delete the console-config merge in `config.ts:492-530` and the `OPENCODE_CONSOLE_TOKEN` env write at `:505-506`. | Also remove "console managed" provider tracking wherever `consoleManaged` is read (grep). |
| R3 | Delete the well-known loop `config.ts:370-409`, the `wellknown` auth type, and `providers login <url>`. | This removes the remote-command execution at `providers.ts:334`. |
| R4 | Delete the `experimental` HttpApi org routes and run `bun run generate` from the repo root to rebuild the SDK. | `AGENTS.md` rule. Check `packages/tui` for callers of the removed SDK methods. |
| R5 | Keep `opencode auth login` for API keys (rename to `hermit auth`), keep `auth.json` with types `api` and `oauth`; the provider catalog and its OAuth plugins stay per `01` section 4. | Fireworks uses `api`. |
| R6 | Remove `OPENCODE_AUTH_CONTENT` unless there is a concrete container use case. Recommendation: keep it, it is local-only and useful for containers. | |

## 4. Preserve

- `auth.json` key storage with 0600 permissions.
- `packages/core/src/credential.ts` V2 store, unless the V2 integration system is removed entirely (see `05`).

## 5. Verification

- `bun typecheck` in `packages/core`, `packages/opencode`, `packages/tui`, and `packages/server`.
- `grep -rn "console" packages/opencode/src/config` returns nothing account-related.
- Fresh start with no DB creates no `account` tables.

## 6. Divergence log

| Upstream file | Change | Reason |
|---|---|---|

## 7. Cross-region notes

- `03` depends on the org branch removal; do `02` first or together.
