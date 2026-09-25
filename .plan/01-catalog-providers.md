# 01 Catalog and Providers

**Status:** done (branch `catalog-telemetry`)

## 1. Goal

The provider list is built from the embedded snapshot plus user config only. No catalog fetch. No OpenCode-hosted provider exists in the binary. Requests carry no identifying metadata beyond what the user configures.

## 2. Owned files

- `packages/core/src/models-dev.ts`
- `packages/core/src/plugin/models-dev.ts`
- `packages/core/src/plugin/provider.ts` (registration list)
- `packages/core/src/plugin/provider/opencode.ts` (delete)
- `packages/core/src/catalog.ts` (small-model special case at :207-210)
- `packages/opencode/src/provider/provider.ts`
- `packages/opencode/src/session/llm/request.ts`
- `packages/opencode/script/generate.ts`
- `packages/opencode/src/session/retry.ts` (Zen upsell strings :11,132)
- `packages/tui/src/component/dialog-provider.tsx` (Zen upsell :378,389)
- `packages/tui/src/component/dialog-retry-action.tsx` (`opencode.ai/go` link)
- Also touched while landing: `packages/core/src/session/runner/llm.ts` (V2 native headers), `packages/core/src/plugin/provider/{kilo,nvidia,zenmux,llmgateway}.ts` (deleted), `packages/core/src/plugin/provider/{openrouter,vercel,cerebras,gitlab,cloudflare-*}.ts`, `packages/opencode/src/cli/cmd/models.ts` (`--refresh`), `packages/opencode/script/models.json` (checked-in snapshot), `packages/tui/src/routes/session/index.tsx` and `packages/tui/src/component/bg-pulse.tsx` (Go upsell trigger and its effect), `packages/tui/src/feature-plugins/home/tips-view.tsx` (Zen tip).

## 3. Changes

| Id | Change | Where | Notes |
|---|---|---|---|
| C1 | Keep the runtime catalog fetch (`fetchApi`, on-disk cache, `refresh`, `OPENCODE_MODELS_URL`, `OPENCODE_DISABLE_MODELS_FETCH`). Log one `Effect.logInfo("model catalog refresh", { url })` before each fetch, send `User-Agent: hermit/<version>`, and filter `opencode*` providers out of every catalog source. Background refresh runs once per process start. | `core/src/models-dev.ts` | User decision: the catalog carries no user context, and freezing it costs stale model metadata for little privacy gain. The fetch is a documented startup destination (see section 8). |
| C2 | Build-time snapshot: keep fetching `models.dev/api.json` at build, but filter out `opencode` and `opencode-go` before embedding. | `script/generate.ts:10-13` | The build machine needs network; the binary does not. Commit a checked-in `models.json` fallback so builds are reproducible offline. |
| C3 | Delete the `opencode` custom loader and `apiKey: "public"` autoload. | `provider/provider.ts:185-207` | Also drop the `opencode` branches at `provider.ts:1971` (small model priority) and `catalog.ts:207-210`. |
| C4 | Delete V2 `OpencodePlugin` and remove from `ProviderPlugins`. | `core/src/plugin/provider/opencode.ts`, `core/src/plugin/provider.ts:24,~60` | Coordinate with `02` which deletes the integration it registers. |
| C5 | Default `disabled_providers` is unnecessary once C2-C4 land, but add a belt-and-braces check: if a provider id starts with `opencode` after merge, drop it and log a warning. | `provider.ts` after the `isProviderAllowed` loop (:1680-1720) | One `if`, clearly commented as Hermit. |
| C6 | Strip identifying headers: remove `x-session-affinity`, `X-Session-Id`, `x-parent-session-id`, and the `opencode*` branch. Keep `User-Agent` but rename to `hermit/<version>`. | `session/llm/request.ts:187-204` | `x-session-affinity` may matter for sticky routing at some gateways; Fireworks does not need it. Document. |
| C7 | Remove `HTTP-Referer: https://opencode.ai/`, `X-Title: opencode`, and OS release/arch User-Agents from V1 and V2 provider definitions. | `provider.ts:472-504,609,631,764,834,887,899`; `core/src/plugin/provider/{openrouter,vercel,kilo,nvidia,llmgateway,zenmux,gitlab,cloudflare-workers-ai,cloudflare-ai-gateway}.ts` | These providers stay (section 4); strip the headers in place. |
| C8 | Remove `opencode.ai/go` upsell UI and Zen-specific retry copy. | `session/retry.ts`, `tui/src/component/dialog-provider.tsx`, `dialog-retry-action.tsx` | |

## 4. Provider catalog decision

Under `docs/privacy-model.md`, third-party providers are legitimate explicit trust decisions, so the catalog does not need to shrink for privacy reasons. Recommendation: **keep the full catalog and bundled SDKs**, delete only OpenCode-hosted entries (`opencode`, `opencode-go`) and the Zen autoload. This keeps the diff small and keeps upstream provider fixes portable. The built-in OAuth plugins (Codex, Copilot, xAI, and so on) stay for the same reason; they only make network calls inside an explicit login or when a credential exists.

A later trim to a curated list remains possible if binary size or dependency count becomes a concern, but it is not a privacy requirement.

## 5. Preserve

- `resolveSDK` fetch wrapper with header and chunk timeouts (`provider.ts:1794-1824`). The network guard in `10` hooks here.
- Config-defined provider parsing (`provider.ts:1481-1578`). This is how llama.cpp is configured.
- `getSmallModel` same-provider behavior.

## 6. Verification

- `bun typecheck` in `packages/core`, `packages/opencode`, `packages/tui`.
- `packages/opencode/test/provider/*` after updating fixtures that assume `opencode` exists.
- Manual: `hermit models` with no network shows only snapshot and config providers; with a llama.cpp config the model is selectable and streams.

## 7. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
| `packages/core/src/models-dev.ts` | Catalog User-Agent is `hermit/<version>` (no channel or client). One `Effect.logInfo("model catalog refresh", { url })` before each fetch. `populate` drops providers whose id starts with `opencode` from disk, snapshot, and fetched data. The background refresh forks once at startup instead of repeating every 60 minutes. Fetch, cache, `refresh`, and flags are otherwise upstream. | C1. Upstream's hourly repeat runs more than once per process start; once per start is the smallest change that keeps startup behavior. |
| `packages/opencode/script/generate.ts`, `packages/opencode/script/models.json` | Build fetches `models.dev/api.json`, falls back to the checked-in `script/models.json` when offline, and drops every provider id starting with `opencode` before embedding. | C2. |
| `packages/opencode/src/cli/cmd/models.ts` | Removed the `opencode`-first sort. | C3. |
| `packages/opencode/src/cli/cmd/providers.ts` | Removed the `opencode` priority and "recommended" hint, and the `opencode.ai/auth` message. | C3/C8. |
| `packages/opencode/src/provider/provider.ts` | Deleted the `opencode` custom loader (`apiKey: "public"` autoload), the `opencode` small-model priority, and the `HTTP-Referer`/`X-Title`/`X-Source`/`X-BILLING-INVOKE-ORIGIN`/`X-Cerebras-3rd-Party-Integration` headers and OS-identifying User-Agents in the `llmgateway`, `openrouter`, `nvidia`, `vercel`, `zenmux`, `gitlab`, `cloudflare-*`, `cerebras`, and `kilo` loaders. Loaders that only set headers were removed; `nvidia` keeps its `autoload` rule with empty options. | C3/C7. The Hermit `getSmallModel` cross-provider guard is untouched. |
| `packages/core/src/plugin/provider/opencode.ts` (deleted), `packages/core/src/plugin/provider.ts` | Removed `OpencodePlugin` from `ProviderPlugins`. | C4. |
| `packages/core/src/plugin/provider/{kilo,nvidia,zenmux,llmgateway}.ts` (deleted) | These plugins only injected attribution headers. | C7; prefer deleting a code path. |
| `packages/core/src/plugin/provider/{openrouter,vercel,cerebras}.ts` | Removed the catalog transforms that injected attribution headers. | C7. |
| `packages/core/src/plugin/provider/{gitlab,cloudflare-workers-ai,cloudflare-ai-gateway}.ts` | Removed the `opencode/<v> ... (<platform> <release>; <arch>)` User-Agent. | C7. Bun's `--user-agent=hermit/<version>` covers the default UA. |
| `packages/core/src/catalog.ts` | Removed the `opencode` `gpt-5-nano` small-model special case. | C3. |
| `packages/opencode/src/session/llm/request.ts` | Headers are now `User-Agent: hermit/<version>` plus model/provider headers. Removed `x-session-affinity`, `X-Session-Id`, `x-parent-session-id`, and the `x-opencode-*` branch; dropped the unused `parentSessionID` input (also from `session/llm.ts` and `session/prompt.ts`). | C6. Fireworks and llama.cpp do not need sticky-routing headers; a gateway that does can add them via `provider.<id>.options.headers`. |
| `packages/core/src/session/runner/llm.ts` | Same header removal on the V2 native runner. | C6 applies to every inference seam. |
| `packages/opencode/src/session/retry.ts` | Removed `GO_UPSELL_*`, the `FreeUsageLimitError` and `GoUsageLimitError` branches, and their helpers. `retryable` keeps its `Retryable | undefined` signature. | C8. |
| `packages/tui/src/component/dialog-provider.tsx` | Removed the Zen and Go API-key descriptions. | C8. |
| `packages/tui/src/component/dialog-retry-action.tsx`, `bg-pulse.tsx` (deleted), `packages/tui/src/routes/session/index.tsx` | Removed the Go upsell dialog and its `session.status` trigger. | C8; nothing produces a retry `action` any more. |
| `packages/tui/src/feature-plugins/home/tips-view.tsx` | Removed the "connect with OpenCode Zen" tip. | C8. |
| `packages/opencode/src/plugin/openai/codex.ts` | Codex OAuth `User-Agent` is `opencode/<version>` without OS release/arch. `originator` and `session-id` stay: the ChatGPT backend and the websocket pool key on them. | C7 goal (no OS fingerprint); recorded here because `09` T4 requires `os.release()` to be absent. |
| Tests | Deleted `core/test/plugin/provider-{opencode,kilo,nvidia,zenmux,llmgateway}.test.ts`, the zen native cassette and scenario, the Go upsell retry tests, the header assertions in `core/test/session-runner.test.ts`, `opencode/test/session/llm.test.ts`, `opencode/test/provider/provider.test.ts`, and the core provider plugin tests. `core/test/models.test.ts` asserts the `hermit/<version>` catalog User-Agent. | Tests deleted with the code they covered. |

## 8. Cross-region notes

- `02` deletes the `opencode` integration; C4 landed here (the plugin file is gone), so `02` only needs to drop the integration registration and console account code.
- `10` wraps the fetch built in `resolveSDK`; untouched.
- `11`: `https://models.dev/api.json` (or `OPENCODE_MODELS_URL`) is a documented startup destination. It is a `GET` with no user context (`User-Agent: hermit/<version>` only) and belongs on the harness application-egress allowlist; `OPENCODE_DISABLE_MODELS_FETCH=1` suppresses it for scenarios that need a silent process.
- C5 (drop any provider id starting with `opencode` after the allowlist loop) was not implemented as a provider-registry rule. The filter lives in `ModelsDev.populate` as a data filter on every catalog source (C1), and together with the snapshot filter (C2), the deleted loader (C3), and the deleted plugin (C4) it removes every OpenCode-hosted entry; `packages/opencode/src/hermit/AGENTS.md` forbids classifying by provider id; the boundary classifies the resolved URL per request, so a user-defined provider named `opencode` pointing at loopback must keep working. Tests also use `opencode` as a generic provider id.
- `packages/schema/src/models-dev.ts` still defines `ModelsDev.Event.Refreshed` and `packages/schema/src/provider.ts` still exports `ProviderV2.ID.opencode`. Both are inert; removing them needs an SDK regeneration and a `packages/schema` edit that no plan owns.
- Remaining `opencode.ai` hosts in source belong to other regions: `cli/cmd/account.ts` (`02`), `installation/index.ts` install URL (`04`), `cli/cmd/github.handler.ts` (`08`), the `/share` tip in `tips-view.tsx` (`03`), the `$schema` URLs (`12`), `mcp/oauth-provider.ts` `client_uri` (OAuth client metadata, `12`).
- `webfetch` and `websearch` tool User-Agents are owned by `06`. The OAuth login User-Agents in `core/src/plugin/provider/openai.ts` and the auth plugins are plain `opencode/<version>` strings and become `hermit/<version>` under `12`.
- Internal `x-opencode-*` and `x-session-affinity` headers in `server/` and `plugin/openai/ws-pool.ts` are loopback-only server routing keys, not provider headers.
