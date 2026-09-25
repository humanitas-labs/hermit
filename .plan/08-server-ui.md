# 08 Server and UI

**Status:** not started (revised for explicit egress)

## 1. Goal

The local server binds loopback only, never proxies to a remote host, and no CLI command talks to OpenCode or GitHub services.

## 2. Owned files

- `packages/opencode/src/server/shared/ui.ts` lines 9, 44-49, 78-108 (`app.opencode.ai` proxy)
- `packages/opencode/src/server/proxy-util.ts`
- `packages/opencode/src/effect/runtime-flags.ts` line 20 (`OPENCODE_DISABLE_EMBEDDED_WEB_UI`)
- `packages/opencode/src/server/mdns.ts`, `packages/opencode/src/cli/network.ts` lines 17-26, 67-74
- `packages/opencode/src/cli/cmd/github.ts`, `github.handler.ts`, `github.shared.ts`, `pr.ts` (delete)
- `packages/opencode/src/control-plane/*`, `packages/core/src/control-plane/*`, `httpapi/middleware/workspace-routing.ts`, `middleware/proxy.ts` (decision below)
- `packages/opencode/src/cli/cmd/web.ts` (review; serves the embedded UI locally, keep)
- `packages/app/src/context/highlights.tsx` lines 10, 169-175 (`opencode.ai/changelog.json` fetch in the embedded web UI)
- `packages/app/src/entry.tsx` lines 133-137 (Sentry init, compiled out but present)

## 3. Changes

| Id | Change | Notes |
|---|---|---|
| V1 | Delete the `app.opencode.ai` proxy fallback; a missing bundle returns 404. Delete the flag. Lands with `13` Tier 2 if Tier 2 runs first; otherwise here. | |
| V2 | Delete mDNS and the `--mdns` options. Keep `--hostname` for users who deliberately expose the server on a LAN, but keep the default `127.0.0.1`. | mDNS depends on `bonjour-service`; drop the dependency. |
| V3 | Delete the `github` command and handler (they depend on `api.opencode.ai` for the GitHub App installation lookup and the OIDC exchange). Keep `pr` if it only uses the GitHub API and `git`; it is user-requested network access. Drop `@actions/*` and any `@octokit/*` package no longer imported. | Check `cli/cmd/pr.ts` imports before deciding. |
| V4 | Remote workspaces: delete `control-plane` remote adapter support, the proxy middleware, and `OPENCODE_EXPERIMENTAL_WORKSPACES`. Keep the local `worktree` adapter only if the worktree feature is wanted. Recommendation: keep worktrees, delete remote plumbing. | Large but experimental and off by default; can be deferred to a later pass. |
| V5 | Only if `13` Tier 2 does not run. Embedded web UI: remove the changelog fetch and the Sentry init from `packages/app`. | The app package is bundled into the binary as static files, so it is in scope even though it runs in a browser. |

## 4. Preserve

- Hono server, HttpApi routes for sessions, files, permissions, and events.
- `hermit serve` and `hermit web` on loopback.

## 5. Verification

- `lsof -i -P | grep hermit` during a TUI session shows nothing (in-process transport) or only `127.0.0.1` for `serve`.
- Request an unknown UI path with the bundle removed: 404, no outbound connection.

## 6. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
