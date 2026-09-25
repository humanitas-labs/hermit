# 09 Telemetry and Headers

**Status:** not started

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
