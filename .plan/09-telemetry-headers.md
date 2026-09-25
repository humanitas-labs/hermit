# 09 Telemetry and Headers

**Status:** done (branch `catalog-telemetry`)

## 1. Goal

No telemetry exporter exists in the binary. Requests to inference hosts carry no identifiers beyond a plain product User-Agent.

## 2. Owned files

- `packages/core/src/observability/otlp.ts` (delete), `observability/shared.ts`, `observability.ts` wiring in `bootstrap-runtime.ts:17`, `app-runtime.ts:109`, `run-service.ts:35`, `httpapi/server.ts:311`
- `packages/core/src/flag/flag.ts` lines 16-17 (`OTEL_*`)
- `packages/opencode/src/session/llm.ts` lines 208-222, 344-351 (`experimental_telemetry`)
- `packages/opencode/src/agent/agent.ts` lines 381-395
- `packages/core/src/v1/config/config.ts` lines 173-175 (`experimental.openTelemetry`)
- `packages/core/src/config.ts` lines 57-59 (`username`, only used for OTLP `userId`)
- `packages/opencode/package.json` `@opentelemetry/*`, `@effect/opentelemetry` deps
- Headers in `session/llm/request.ts` and provider files (owned by `01` C6-C7; listed for the cross-check)
- `packages/opencode/script/build.ts` line 179 (`--user-agent=opencode/<version>` Bun flag)
- `packages/core/src/models-dev.ts` line 23 (catalog UA, removed with `01` C1)

## 3. Changes

| Id | Change |
|---|---|
| T1 | Delete OTLP exporter, `OTEL_*` flag reads, `experimental.openTelemetry`, AI SDK `experimental_telemetry`, and the OpenTelemetry dependencies. Keep Effect's local tracer if other code depends on spans (`Effect.withSpan` is harmless without an exporter). |
| T2 | Remove `username` config if nothing else uses it. |
| T3 | Bun `--user-agent=hermit/<version>`. |
| T4 | Cross-check after `01` lands: `grep -rn "x-session\|X-Session\|x-opencode\|HTTP-Referer\|X-Title\|os.release()" packages/opencode/src packages/core/src` is empty. |

## 4. Verification

- `bun typecheck` in `packages/core` and `packages/opencode`.
- Capture one llama.cpp request with a loopback proxy or `llama-server --verbose` and confirm headers are `content-type`, `authorization` (if configured), `user-agent: hermit/<v>` only.

## 5. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
| `packages/core/src/observability/otlp.ts` (deleted), `packages/core/src/observability.ts` | The observability layer is the file/console logger plus the minimum log level; no OTLP logger, tracer, or HTTP client. | T1. `Effect.withSpan` calls elsewhere are harmless without an exporter. |
| `packages/core/src/flag/flag.ts` | Removed `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS`. | T1. |
| `packages/opencode/src/session/llm.ts`, `packages/opencode/src/agent/agent.ts` | Removed the `OtelTracer` lookup and the AI SDK `experimental_telemetry` option. | T1. |
| `packages/core/src/v1/config/config.ts`, `packages/core/src/config.ts`, `packages/core/src/v1/config/migrate.ts` | Removed `experimental.openTelemetry` and `username`. | T1/T2. `username` was only read by the telemetry `userId`. |
| `packages/opencode/src/config/config.ts` | Removed the `os.userInfo()` username default. | T2. |
| `packages/opencode/src/control-plane/workspace.ts` | Workspace adapters no longer receive `OTEL_*` env. | T1. |
| `packages/opencode/package.json`, `packages/core/package.json`, `package.json`, `bun.lock` | Dropped `@effect/opentelemetry` and `@opentelemetry/*`, including the root catalog entry. | T1. |
| `packages/opencode/script/build.ts` | Bun `--user-agent=hermit/<version>`. | T3. |
| `packages/sdk/openapi.json`, `packages/sdk/js/src/v2/gen/types.gen.ts` | Regenerated: `Config.username` and `Config.experimental.openTelemetry` removed. | Follows the schema change. |
| Tests | Removed the OTLP `resource` tests, the workspace `OTEL_*` forwarding assertions, and the `username` config tests; config tests that used `username` as a generic string field now use `shell`. | Tests deleted with the code they covered. |

## 6. Cross-region notes

- T4 cross-check after `01`: `grep -rn "x-session\|X-Session\|x-opencode\|HTTP-Referer\|X-Title\|os.release()" packages/opencode/src packages/core/src` leaves only loopback server routing keys (`server/proxy-util.ts`, `server/shared/*`, `plugin/openai/ws-pool.ts`), the `debug` CLI command's OS line, and the Codex OAuth plugin's `session-id`/`originator` headers, which the ChatGPT backend requires. The Codex User-Agent lost its OS release and arch under `01`.
- The root `package.json` catalog entry for `@effect/opentelemetry` was removed because nothing consumed it; that file is shared with `05` and `07`.
- `packages/opencode/test/config/fixtures/v2-compat/**` and `test/server/httpapi-exercise/index.ts` now patch `shell` instead of `username`.
- Manual llama.cpp header capture (section 4) was not run on this branch; the egress harness in `11` covers it.
