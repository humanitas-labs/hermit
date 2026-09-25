# 06 Tools and Search

**Status:** not started (revised for explicit egress)

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
