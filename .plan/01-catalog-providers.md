# 01 Catalog and Providers

**Status:** not started (revised for explicit egress)

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

## 3. Changes

| Id | Change | Where | Notes |
|---|---|---|---|
| C1 | Delete `fetchApi`, `fetchAndWrite`, `refresh` scheduler, and the `HttpClient` dependency. `populate` becomes: disk file from `OPENCODE_MODELS_PATH` if set, else snapshot. Keep `refresh` as a no-op or remove from `Interface` and fix callers. | `core/src/models-dev.ts:160-258` | Keep `Service` shape so `provider.ts` and `plugin/models-dev.ts` compile. Remove `Flag.OPENCODE_MODELS_URL` and `OPENCODE_DISABLE_MODELS_FETCH` once unused. |
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

## 8. Cross-region notes

- `02` deletes the `opencode` integration; C4 must land in the same PR or after.
- `10` wraps the fetch built in `resolveSDK`.
