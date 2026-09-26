# 14 Proportionality Review

**Status:** review complete

## 1. Goal

Some landed changes removed more than the privacy contract requires. The ripgrep bundling in `07` and the frozen model catalog in `01` were both reversed by user decision after review. This plan audits every change on the region branches against one criterion and lists what to keep, soften, or revert, before integration.

## 2. Criterion

A change is required when it removes one of:

- hidden transmission of model context or user data to any endpoint
- inference to an endpoint the user did not explicitly configure and authorize
- a hosted intermediary between Hermit and the user's chosen provider
- telemetry, analytics, crash reporting, or hosted state

A change is proportionate when it does none of the above but the egress it touches is now explicit: logged with destination and reason, on by default, and user-triggerable. Per `docs/privacy-model.md` section 7 and `AGENTS.md` section 4, network use by tools and dependency downloads is allowed. Trust in the source, such as ripgrep's GitHub releases or models.dev, is a reason to keep a download, not to delete it.

A change is overboard when it deletes or rewrites working upstream behavior whose only egress is explicit, already logged, or user-triggered, or when it adds machinery (build steps, bundling, stubs, new abstractions) to remove something a log line would have made acceptable.

## 3. Review table

Filled by the review. One row per commit on each branch; commits with mixed verdicts are split by file or item. Diffs were read from the main checkout with `git diff master...<branch>`; the ripgrep bundling, the frozen catalog, and C5 are skipped per section 4.

| Branch | Commit | Change | Verdict | Action |
| --- | --- | --- | --- | --- |
| hosted-services | `817025ce27` | Delete console accounts, console-pushed config, well-known remote config and `providers login <url>`, the `experimental` console routes, account tables plus drop migration, SDK regen | required | keep |
| hosted-services | `ca1a93160d` | Delete share transport (`share-next.ts`), `session_share` table and `share_url` column plus migration, share routes, `share`/`autoshare`/`enterprise` config, `--share`, `/share` and `/unshare`, `Session.Info.share`, SDK regen | required | keep |
| hosted-services | `ca1a93160d` | `packages/opencode/src/share/session.ts` rewritten as a failing stub, `SessionShare.node` kept in `app-runtime.ts`, only to keep `github.handler.ts` compiling | proportionate | revert: delete `share/session.ts` and the `SessionShare.node` registration once `b23a80f88a` (github removal) is integrated; the stub has no other consumer |
| hosted-services | `ca1a93160d` | `packages/opencode/src/cli/cmd/import.ts` deleted wholesale, including the local JSON-file branch that pairs with the kept `export` command | overboard | soften: restore `import <file>` for local JSON export files and delete only the share-URL branch (`parseShareUrl`, `shouldAttachShareAuthHeaders`, `transformShareData`, the `fetch` path); about 120 lines of upstream kept |
| hosted-services | `41542bb169` | Delete the startup `checkUpgrade` call, `cli/upgrade.ts`, silent self-upgrade, `global.upgrade` route, TUI update dialog, `autoupdate` config, `OPENCODE_DISABLE_AUTOUPDATE`/`ALWAYS_NOTIFY_UPDATE`, `installation.*` events; the explicit `upgrade` command and `Installation.latest`/`upgrade` stay | proportionate | keep |
| hosted-services | `41542bb169` | `Installation.latest` and `Installation.upgrade` still resolve `api.github.com/repos/anomalyco/opencode` and `opencode-ai@<version>`, so `hermit upgrade` would replace the binary with upstream OpenCode | gap | add: point the release lookup and install targets at Hermit's distribution in plan `12`, or hide the `upgrade` command until then |
| plugins-npm | `971059bece` | Delete the bootstrap `@opencode-ai/plugin` install into every `.opencode` directory (`config/config.ts`, `config/tui.ts`, `Npm.install`); README documents `bun add @opencode-ai/plugin` for local plugins that import runtime values | proportionate | keep; it wrote `node_modules` into user projects on every startup with no prompt, and the replacement is one documented command |
| plugins-npm | `971059bece` | `Npm.add`/`which` take a `reason`; one `logInfo` naming package, registry, reason, and directory before Arborist runs; call sites in `plugin/shared.ts`, `config/plugin/external.ts`, `provider.ts`, `dynamic.ts`, `sap-ai-core.ts` pass a reason | proportionate | keep |
| plugins-npm | `971059bece` | Delete the Codex WebSocket channel default (`experimentalWebSocketsEnabled`); flag-only | proportionate | keep |
| plugins-npm | `971059bece` | `formatter.ts` npm-backed prettier/oxfmt/biome honor `disableLspDownload`; `Formatter.Context` gains the field | proportionate | keep |
| tools-binaries-server | `7099868ee2` | `websearch`: drop the `opencode`/`opencode-go` provider gate and the session-checksum exa/parallel coin flip; stop sending `session_id` and `model_name` to Parallel (W2) | proportionate | keep |
| tools-binaries-server | `7099868ee2` | `websearch`: new `websearch: { provider, apiKey }` config key in V1 and V2 config, `migrate.ts`, SDK and openapi regen, `RuntimeFlags` flags removed, `core/test/tool-websearch.test.ts` and `opencode/test/tool/websearch.test.ts` rewritten (about 300 lines of churn) | overboard | soften: keep upstream's explicit switches (`OPENCODE_ENABLE_EXA`/`OPENCODE_ENABLE_PARALLEL`, `OPENCODE_WEBSEARCH_PROVIDER`, `EXA_API_KEY`/`PARALLEL_API_KEY`) as the gate and drop only the provider-id branch and checksum fallback; no schema field, no migration, no SDK regen, tests keep their shape |
| tools-binaries-server | `7099868ee2` | `webfetch` (`core/src/tool/webfetch.ts`, `opencode/src/tool/webfetch.ts`): replace the Chrome User-Agent with `hermit/<version>` and delete the Cloudflare-challenge retry | overboard | revert: restore upstream's browser UA and challenge fallback, rename the fallback string from `opencode` to `hermit/<version>`; the UA is user-triggered tool egress with no privacy effect and the honest-only UA loses fetches on bot-blocking sites |
| tools-binaries-server | `7099868ee2` | `mcp/index.ts` logs name and URL before connecting to a remote MCP server (W4) | proportionate | keep |
| tools-binaries-server | `7d5ebf269c` | `packages/script/src/index.ts` tolerates the deleted `.github/TEAM_MEMBERS` | required | keep |
| tools-binaries-server | `185e639b07` | `lsp/server.ts`: `disableLspDownload` gates the `Npm.which` branches (typescript, vue, biome, pyright, svelte, astro, yaml, intelephense, bash, dockerfile) and one log line before each direct archive or release download via a small `ManagedRuntime` | proportionate | keep |
| tools-binaries-server | `185e639b07` | `core/src/npm.ts`: a second "installing npm package" log inside `which`, duplicating the `reify` log that `971059bece` adds | proportionate | soften: drop this line on merge and pass `reason: "lsp <id>"` at the LSP `Npm.which` sites instead, so each install logs once with its reason |
| tools-binaries-server | `185e639b07` | `ripgrep/binary.ts` log line; `Ide.install` (dead `code --install-extension`) deleted | proportionate | keep (ripgrep itself per section 4) |
| tools-binaries-server | `b23a80f88a` | Delete `github` command, handler, and shared helpers (they call `api.opencode.ai` for the app installation lookup and OIDC token exchange and upload the session via share); drop `@actions/*`, `@octokit/*`; keep `pr` | required | keep |
| catalog-telemetry | `da1ca90f50` | Frozen catalog: `models-dev.ts` fetch removal, `generate.ts`, `script/models.json`, `OPENCODE_MODELS_URL`/`DISABLE_MODELS_FETCH`, `models --refresh`, `providers login` refresh | skipped | per section 4 |
| catalog-telemetry | `da1ca90f50` | Delete the OpenCode Zen V1 loader and `apiKey: "public"` autoload, V2 `OpencodePlugin`, `catalog.ts` gpt-5-nano case, `opencode*` small-model priority, `x-opencode-*` headers and project-id lookup in `llm/request.ts` | required | keep |
| catalog-telemetry | `da1ca90f50` | Strip `x-session-affinity`, `X-Session-Id`, `x-parent-session-id` from V1 and V2 requests; remove `parentSessionID` plumbing; `User-Agent: hermit/<version>` | proportionate | keep; note in `docs/upstream.md` that gateways relying on session affinity lose sticky routing |
| catalog-telemetry | `da1ca90f50` | Strip `HTTP-Referer: opencode.ai`, `X-Title`, `X-Source`, `X-BILLING-INVOKE-ORIGIN`, `X-Cerebras-3rd-Party-Integration`, and OS release/arch User-Agents in place (cerebras, cloudflare x2, gitlab, openrouter, vercel, and the V1 custom loaders) | proportionate | keep |
| catalog-telemetry | `da1ca90f50` | Delete `kilo.ts`, `nvidia.ts`, `zenmux.ts`, `llmgateway.ts` V2 plugins and their tests; the V1 `nvidia` loader stays with `options: {}` | proportionate | keep; each plugin body was only the stripped headers, so an empty plugin would be the larger divergence; providers still load from the catalog |
| catalog-telemetry | `da1ca90f50` | Codex `chat.headers` User-Agent drops `(platform release; arch)`; `originator: opencode` and the `opencode/` prefix stay because the Codex backend gates on them | proportionate | keep |
| catalog-telemetry | `da1ca90f50` | Delete Go upsell copy in `retry.ts`, `dialog-retry-action.tsx`, `bg-pulse.tsx` (its only consumer), the Zen prompt in `dialog-provider.tsx`, the Zen tip | required | keep |
| catalog-telemetry | `52fbc7b96e` | Delete OTLP log and trace exporter, `OTEL_*` flag reads, `experimental.openTelemetry`, AI SDK `experimental_telemetry`, five `@opentelemetry`/`@effect/opentelemetry` deps, OTEL env forwarding in `workspace.ts` | required | keep; note it was opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT` to a user-chosen host, so no contract violation existed, and the dependency drop is the concrete gain |
| catalog-telemetry | `52fbc7b96e` | Remove the `username` config key and the `os.userInfo()` fallback; only consumer was the OTLP `userId` (the TUI does not read it) | proportionate | keep |
| catalog-telemetry | `52fbc7b96e` | Bun `--user-agent=hermit/<version>` in `script/build.ts` | proportionate | keep |
| master | `64dd48459f` | `core/src/hermit/policy.ts` (classify, presets, `check`, `guardFetch`, process-global `narrow`), `hermit.preset` and `provider.<id>.owner` config keys, `stripPolicy` in config loading, guarded fetch in `resolveSDK`, guarded `FetchHttpClient` for `RequestExecutor`, `getSmallModel` cross-provider rejection, three test files | required | keep |
| master | `64dd48459f` | `Model.boundary`/`permitted` fields, SDK regen, startup policy log, `models` command class column, TUI footer label and picker footer/disabled state, `src/hermit/AGENTS.md` | proportionate | keep; the plan's 3.3 visibility, and the TUI cannot resolve endpoints itself |
| master | `64dd48459f` | Redirect rule refuses every redirect from `local` and `user` endpoints, including same-origin ones (a trailing-slash 301 from a local reverse proxy fails the turn) | proportionate | keep per plan 3.2; if it bites, permit same-origin redirects whose target classifies the same, which keeps the destination check intact |
| master | `64dd48459f` | `packages/llm/src/route/executor.ts` keeps the wrapped fetch error's message | proportionate | keep |

## 4. Decisions so far

| Item | Decision | Reason |
| --- | --- | --- |
| `07` B1 ripgrep bundling | reverted to logged download | trusted source, build divergence outweighs the gain |
| `01` C1 frozen catalog | reverted to logged runtime fetch, `opencode*` providers filtered | catalog data is not user context; the boundary check governs the destinations it yields |
| `01` C5 name-based `opencode*` provider drop | not implemented | classifies by provider id, which the boundary forbids; replaced by a data filter on the fetch result |

## 5. Cross-region notes

Each verdict of "soften" or "revert" names the branch and commit; the branch owner applies it before integration.

## 6. Summary

The large deletions are required and should stay: console accounts and remote config, session sharing, the Zen provider and its upsells, the `github` command, and the telemetry exporter each removed a hosted intermediary or a hidden egress path. The boundary commit on master is the required mechanism and its visibility fields are proportionate. Revert or soften the following, ordered by upstream divergence removed.

1. `tools-binaries-server` `7099868ee2`, websearch config key: soften to upstream's env-flag gate and delete only the `opencode` provider branch and the checksum fallback. Removes about 300 lines of schema, migration, SDK, and test churn; the trade-off is a config-file switch that reads better than env flags.
2. `hosted-services` `ca1a93160d`, `import` command: restore the local JSON-file path and delete only the share-URL branch. Keeps about 120 lines of upstream and the `export`/`import` pair; the trade-off is one more upstream file to port.
3. `tools-binaries-server` `7099868ee2`, webfetch User-Agent: revert to the browser UA and Cloudflare fallback, renaming the fallback to `hermit/<version>`. Removes about 60 lines of rewrite and preserves fetch success on bot-blocking sites; the trade-off is a spoofed UA, which has no privacy effect on user-triggered tool egress.
4. `hosted-services` `ca1a93160d`, `share/session.ts` stub: delete it and its `app-runtime.ts` registration once `b23a80f88a` merges. Removes the last share symbol; no trade-off.
5. `tools-binaries-server` `185e639b07`, duplicate npm log in `Npm.which`: drop it and pass `reason` at the LSP sites when merging with `971059bece`. One log line per install instead of two; no trade-off.

Gaps: `hermit upgrade` still resolves `anomalyco/opencode` releases and `opencode-ai` on npm, so it would install upstream over Hermit; fix the targets in plan `12` or hide the command until then. Note in `docs/upstream.md` that stripping `x-session-affinity` drops sticky routing at gateways that use it.
