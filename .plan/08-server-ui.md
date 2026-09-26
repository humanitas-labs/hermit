# 08 Server and UI

**Status:** done (V3 and the reviews landed; V2 and V4 are discretionary and deferred to phase 5)

## 1. Goal

The local server binds loopback only, never proxies to a remote host, and no CLI command talks to OpenCode or GitHub services.

## 2. Owned files

- ~~`packages/opencode/src/server/shared/ui.ts` lines 9, 44-49, 78-108 (`app.opencode.ai` proxy)~~ deleted by `13` Tier 2 (`2f433b5612`)
- `packages/opencode/src/server/proxy-util.ts`
- ~~`packages/opencode/src/effect/runtime-flags.ts` line 20 (`OPENCODE_DISABLE_EMBEDDED_WEB_UI`)~~ deleted by `13` Tier 2
- `packages/opencode/src/server/mdns.ts`, `packages/opencode/src/cli/network.ts` lines 17-26, 67-74
- `packages/opencode/src/cli/cmd/github.ts`, `github.handler.ts`, `github.shared.ts`, `pr.ts` (delete)
- `packages/opencode/src/control-plane/*`, `packages/core/src/control-plane/*`, `httpapi/middleware/workspace-routing.ts`, `middleware/proxy.ts` (decision below)
- ~~`packages/opencode/src/cli/cmd/web.ts` (review; serves the embedded UI locally, keep)~~ deleted by `13` Tier 2
- ~~`packages/app/src/context/highlights.tsx` lines 10, 169-175 (`opencode.ai/changelog.json` fetch in the embedded web UI)~~ deleted by `13` Tier 2
- ~~`packages/app/src/entry.tsx` lines 133-137 (Sentry init, compiled out but present)~~ deleted by `13` Tier 2

## 3. Changes

| Id     | Change                                                                                                                                                                                                                                                                                               | Notes                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~V1~~ | Landed with `13` Tier 2 (`2f433b5612`): `server/shared/ui.ts`, the flag, and the `web` command are gone. Verified: no `app.opencode.ai` or `OPENCODE_DISABLE_EMBEDDED_WEB_UI` reference remains in `packages/*/src`.                                                                                 | Done before this plan ran.                                                                                                                                                                                                                                                                                                                             |
| V2     | Delete mDNS and the `--mdns` options. Keep `--hostname` for users who deliberately expose the server on a LAN, but keep the default `127.0.0.1`.                                                                                                                                                     | mDNS depends on `bonjour-service`; drop the dependency. **Deferred to phase 5** (`README.md` section 4): off by default, opt-in flag, no privacy dependency. `server/mdns.ts` and `cli/network.ts` are untouched.                                                                                                                                      |
| V3     | Delete the `github` command and handler (they depend on `api.opencode.ai` for the GitHub App installation lookup and the OIDC exchange). Keep `pr` if it only uses the GitHub API and `git`; it is user-requested network access. Drop `@actions/*` and any `@octokit/*` package no longer imported. | **Done.** `pr.ts` imports only `Git`, `Process` (`gh` CLI), `UI`, and `InstanceRef`; kept.                                                                                                                                                                                                                                                             |
| V4     | Remote workspaces: delete `control-plane` remote adapter support, the proxy middleware, and `OPENCODE_EXPERIMENTAL_WORKSPACES`. Keep the local `worktree` adapter only if the worktree feature is wanted. Recommendation: keep worktrees, delete remote plumbing.                                    | **Decision: keep worktrees, defer remote-plumbing removal to phase 5.** `OPENCODE_EXPERIMENTAL_WORKSPACES` is off by default and the proxy middleware only forwards to a workspace URL the user configured. `proxy-util.ts` reviewed: it strips hop-by-hop and `x-opencode-*` headers for that proxy and has no fixed destination; kept with its test. |
| ~~V5~~ | `13` Tier 2 ran; `packages/app` no longer exists.                                                                                                                                                                                                                                                    | Nothing to do.                                                                                                                                                                                                                                                                                                                                         |

## 4. Preserve

- Hono server, HttpApi routes for sessions, files, permissions, and events.
- `hermit serve` on loopback (`hermit web` was deleted with the web UI stack).

## 5. Verification

- `lsof -i -P | grep hermit` during a TUI session shows nothing (in-process transport) or only `127.0.0.1` for `serve`.
- Request an unknown UI path with the bundle removed: 404, no outbound connection.

## 6. Divergence log

| Upstream file                                                                      | Change                                                                                                                                                                                                                                                                                             | Reason |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `packages/opencode/src/cli/cmd/github.ts`, `github.handler.ts`, `github.shared.ts` | Deleted. The command looked up the GitHub App installation and exchanged OIDC tokens through `api.opencode.ai`.                                                                                                                                                                                    | V3     |
| `packages/opencode/src/index.ts`                                                   | `GithubCommand` import and registration removed. `PrCommand` stays.                                                                                                                                                                                                                                | V3     |
| `packages/opencode/package.json`, `package.json`, `bun.lock`                       | `@actions/core`, `@actions/github`, `@octokit/graphql`, `@octokit/rest`, `@octokit/webhooks-types` removed (the root catalog entry for `@octokit/rest` had no other consumer). Lockfile diff is deletions only.                                                                                    | V3     |
| `packages/opencode/test/cli/github-action.test.ts`                                 | Deleted with the handler it covered.                                                                                                                                                                                                                                                               | V3     |
| `packages/opencode/test/util/github-remote.test.ts`                                | Moved from `test/cli/` and repointed at `util/repository`, where `parseGitHubRemote` lives and remains.                                                                                                                                                                                            | V3     |
| `packages/opencode/test/cli/help/help-snapshots.test.ts` and snapshot              | `github`, `github install`, `github run` removed from the enumerated commands; snapshot regenerated. The list also still enumerated `web`, deleted by `13` Tier 2, so this test was already failing on master; `web` and its stale snapshot are removed here. The snapshot diff is deletions only. | V3     |

## 7. Cross-region notes

- `packages/server/src/cors.ts` allows any `https://*.opencode.ai` origin by default (`opencodeOrigin` regex) in addition to same-host origins. That default existed for the hosted `app.opencode.ai` UI that V1 removed. It lets a page served from opencode.ai make credentialed browser requests to a local `hermit serve` if the user visits it. Not in this plan's owned list and outside `packages/opencode`; recommend deleting the regex in phase 5 or with `12-branding.md`. `test/server/httpapi-cors.test.ts` asserts that origin and would change with it.
- `packages/opencode/src/util/repository.ts` still exports `parseGitHubRemote`; after V3 it has no production caller. Left in place (not owned, harmless).
- mDNS (`server/mdns.ts`, `cli/network.ts` lines 17-26 and 67-74, `bonjour-service` dependency) and remote-workspace plumbing (`control-plane/*` in opencode and core, `httpapi/middleware/workspace-routing.ts`, `middleware/proxy.ts`, `proxy-util.ts`, `OPENCODE_EXPERIMENTAL_WORKSPACES`) are unchanged, per `README.md` section 4.
