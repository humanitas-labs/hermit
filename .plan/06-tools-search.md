# 06 Tools and Search

**Status:** done

## 1. Goal

Network-capable tools stay. Every tool-driven request is visible through tool execution and permissions. No tool carries hidden identifiers or routes through an OpenCode service.

## 2. Owned files

- `packages/opencode/src/tool/websearch.ts`, `packages/opencode/src/tool/mcp-websearch.ts`, `packages/core/src/tool/websearch.ts`
- `packages/opencode/src/tool/registry.ts` lines 58-65, 293-295
- `packages/opencode/src/effect/runtime-flags.ts` lines 31-39
- `packages/opencode/src/tool/webfetch.ts` line 70 (User-Agent), `packages/core/src/tool/webfetch.ts`
- `packages/core/src/v1/config/config.ts` (new `websearch` config key)

## 3. Changes

| Id | Change | Notes |
|---|---|---|
| W1 | `websearch` becomes explicit config: `websearch: { provider: "exa" \| "parallel", apiKey?: string }` or absent. Remove the `opencode`/`opencode-go` provider gate and the `OPENCODE_ENABLE_*` / `OPENCODE_EXPERIMENTAL` flags. Absent config means the tool is not registered. | The upstream gate ties the tool to the Zen provider, which is gone. |
| W2 | Stop sending `session_id` and `model_name` to Parallel (`websearch.ts:73-77`). Send the query only. | Application metadata (class A) riding on a tool call. |
| W3 | Replace the spoofed Chrome User-Agent in `webfetch` with `hermit/<version>`. | Honest identification; no privacy effect. |
| W4 | Add a startup log line listing configured remote MCP servers and their URLs. | Visibility, not restriction. |
| W5 | No change to `webfetch` permissions, remote `instructions[]`, `skills.urls`, `references[].repository`, MCP OAuth, or `bash`. These are user-requested network access per `docs/privacy-model.md` sections 2 and 7. | Future tool-egress controls (section 7.3) are out of scope for this pass. |

## 4. Preserve

- All tools in `tool/registry.ts`.
- Permission system defaults.

## 5. Verification

- With no `websearch` config the tool is absent from the tool list; with it configured, a call reaches only the configured backend with the query in the body and no session identifiers.
- `bun test test/tool` in `packages/opencode`.

## 6. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
| `packages/core/src/v1/config/config.ts` | New `WebSearch` schema and optional `websearch: { provider, apiKey? }` key on `Info`. | W1 |
| `packages/core/src/config.ts`, `packages/core/src/v1/config/migrate.ts` | V2 `Config.Info` carries the same `websearch` key and the V1 migration copies it. | W1 |
| `packages/opencode/src/tool/websearch.ts` | Provider and API key come from `config.websearch`; `selectWebSearchProvider`, `webSearchModelName`, the `OPENCODE_WEBSEARCH_PROVIDER` override, the session-hash provider split, and `PARALLEL_API_KEY` reading are deleted. Parallel receives `objective` and `search_queries` only. | W1, W2 |
| `packages/opencode/src/tool/mcp-websearch.ts` | `EXA_URL` no longer reads `EXA_API_KEY` at import; `exaURL(apiKey)` builds the credentialed URL from config. `ParallelSearchArgs` drops `session_id` and `model_name`. | W1, W2 |
| `packages/opencode/src/tool/registry.ts` | `webSearchEnabled` and the `opencode`/`opencode-go` provider gate are deleted; `websearch` is listed only when `config.websearch` is set. | W1 |
| `packages/opencode/src/effect/runtime-flags.ts` | `enableExa` and `enableParallel` (`OPENCODE_ENABLE_EXA`, `OPENCODE_EXPERIMENTAL_EXA`, `OPENCODE_ENABLE_PARALLEL`, `OPENCODE_EXPERIMENTAL_PARALLEL`, `OPENCODE_EXPERIMENTAL` for websearch) are deleted. | W1 |
| `packages/core/src/tool/websearch.ts` | `ConfigService`, `defaultConfigLayer`, `configNode`, and `selectProvider` are deleted; the tool reads `Config.latest(entries, "websearch")` and registers only when present. Parallel receives the query only. | W1, W2 |
| `packages/opencode/src/tool/webfetch.ts`, `packages/core/src/tool/webfetch.ts` | User-Agent is `hermit/<version>`; the Cloudflare-challenge retry with a second User-Agent is deleted because the first request is already honest. | W3 |
| `packages/opencode/src/mcp/index.ts` | One `Effect.logInfo` line naming each remote MCP server and its URL before connecting. | W4 |
| `packages/sdk/openapi.json`, `packages/sdk/js/src/v2/gen/types.gen.ts` | Regenerated for the new config key. | W1 |
| Tests | `packages/opencode/test/tool/websearch.test.ts` keeps only label and parser tests; `packages/opencode/test/effect/runtime-flags.test.ts` drops the Exa/Parallel flags; `packages/core/test/tool-websearch.test.ts` builds one harness per config and asserts the tool is absent without config and that Parallel gets no session identifiers; `packages/core/test/tool-webfetch.test.ts` replaces the Cloudflare retry test with an honest User-Agent assertion. | W1-W3 |

## 7. Cross-region notes

- `packages/core/src/config.ts` and `packages/core/src/v1/config/migrate.ts` are not in the owned list; each received one line so the V2 config carries `websearch` and the V1 migration copies it. Without this the V2 core tool had no config source.
- `packages/opencode/src/mcp/index.ts` is not in the owned list; W4 required one log line in `connectRemote`. It logs per server at connect time rather than one aggregated startup line, because MCP clients are created lazily per server.
- The Parallel request still sends `User-Agent: opencode/<version>`. Renaming that identifier belongs to `12-branding.md`.
- `packages/opencode/src/config/v2-compat.ts` still lists `websearch` as an unsupported V2-only key when reading a V2 config file through the V1 loader; that check predates this change and refers to the upstream V2 shape, not the new key. Left for `13`/`12` cleanup.
