# 15 Change Summary for Review

**Status:** snapshot at master `559d06114d` with PRs 1 to 5 open

This is the one-page account of what changed between upstream OpenCode `adee738d1e` and the current Hermit tree, including the five open branches. Each item says where it lives (master or a PR), what it does, and what it costs. Decisions already reversed after review are listed separately at the end so the record shows the reasoning.

## 1. The rule everything is measured against

The acceptance contract in `.plan/README.md` and `docs/privacy-model.md` section 15. In short: no Hermit-managed model call goes anywhere the user did not explicitly configure and authorize; no telemetry or hosted upload; tools may use the network under permissions; plugins and inference servers are trusted executables. The proportionality criterion in `.plan/14-proportionality.md` adds the second half: a download or fetch from a trusted source is kept and logged, not deleted, and machinery added to remove something a log line would have covered is overboard.

## 2. On master

### Strip (plan 13, commits `1397b1cc7e`, `2f433b5612`)

Deleted everything that exists to run OpenCode as a company: hosted console, marketing site, desktop app, stats, enterprise, Slack bot, Storybook, SST infra, Nix, GitHub Action, VS Code extension, upstream workflows and release scripts, and the whole web UI stack. Hermit is TUI-only. Tracked files went from 6,631 to 2,114 and the tracked tree from 143 MB to 32 MB. Docs were consolidated under `docs/`. No runtime behavior changed apart from the `web` command going away.

### Inference boundary (plan 10, commit `64dd48459f` plus two small fixes)

The one piece of new mechanism. Every model request is classified by its resolved URL as `local` (literal loopback only), `user` (the origin of a provider marked `owner: "user"` in user config), or `third-party` (everything else), and refused if the active preset does not permit that class. Presets are `private` (default, local only), `trusted` (adds user), and `external` (adds third party). The check runs at the two places bytes actually leave for inference, the AI SDK fetch wrapper and the native request executor, so primary turns, titles, compaction, subagents, agent generation, project-copy names, plugin fetch overrides, the Codex WebSocket, and the V2 runner are all covered. Refusal is an error you can read; there is no fallback. Redirects from local or user endpoints are refused; third-party redirects are followed only within the same host, checked before the body is re-sent. Policy keys are user-level only; a project config can narrow the preset but cannot raise it or mark a provider as yours. Visibility: the prompt footer shows LOCAL, USER, or THIRD PARTY in green, yellow, or red; the model picker greys out refused models; `hermit models` prints the class.

Cost: about 800 lines including tests, two optional fields on the model type, and a regenerated SDK. Behavior change for existing users: a fresh install refuses remote providers until a preset is set.

## 3. Open PRs

### PR 1, hosted services (plans 02, 03, 04)

Removes console accounts and console-pushed config, the well-known remote config fetch, session sharing and every consumer of it, and the startup update check with silent self-upgrade. Adds two migrations dropping the account and share tables. The explicit `upgrade` and `uninstall` commands stay for phase 5. About 6,600 lines deleted. Each of these was a hosted intermediary or a hidden egress path, so all of it is required by the contract.

### PR 2, tools, binaries, server (plans 06, 07, 08)

Websearch no longer sends session metadata and has no OpenCode-provider gate. Webfetch identifies as Hermit. Each remote MCP connect logs its name and URL. Every LSP server and npm download logs destination and reason first, and the existing disable flag now covers all of them. The ripgrep download stays as upstream has it, with a log line naming the pinned GitHub releases URL. The GitHub-app command and its `@actions` and `@octokit` dependencies are gone; `pr` stays. The proxy utility stays for the opt-in workspace proxy. mDNS and remote workspaces are deferred. Also fixes a build break the strip left behind.

### PR 3, plugins and npm (plan 05)

Removes the automatic install of `@opencode-ai/plugin` into every config directory on startup, on both the CLI and TUI paths, and the code path that downloaded a project's declared dependencies. A fresh start performs no npm install; verified in isolation. Configured plugins still install and log packages, registry, and reason. Codex WebSockets follow the explicit flag only. Local TypeScript plugins with runtime imports now need one manual `bun add`, documented in the README.

### PR 4, catalog and telemetry (plans 01, 09)

The OpenCode Zen provider, its public-key autoload, and its upsell UI are deleted. The models.dev catalog fetch stays as upstream has it, logged, once per start, with the removed providers filtered out of the fetched data. Requests carry only `User-Agent: hermit/<version>` plus model headers: session id, session affinity, Referer, X-Title, and OS-fingerprint user agents are gone from every provider. Four provider plugins whose entire bodies were those headers are deleted; their providers still load from the catalog. OTLP export, AI SDK telemetry, the OTEL flags, the `username` key, and all OpenTelemetry dependencies are deleted.

### PR 5, egress harness (plan 11)

No product code. A fake OpenAI-compatible loopback server, a recording proxy with DNS logging, and a scenario runner covering S0 to S15 with isolated config, cold and warm passes, and synthetic context markers. An OS-level layer (network namespace on Linux, `sandbox-exec` on macOS) catches anything that bypasses the proxy, proven by a deliberate bypass fixture. The baseline against the unmodified binary failed 36 of 37 runs: the five failures the audit predicted, plus three the harness found on its own (session headers sent to Fireworks, a redirect followed to another host, per-model `baseURL` silently ignored). All three are now addressed. The GitHub workflow it added will be removed; `run.sh` is the deliverable.

## 4. Decisions reversed after review

| Item                                      | First landed as                       | Now                                            | Reason                                                                                               |
| ----------------------------------------- | ------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ripgrep (07)                              | bundled into the binary at build time | upstream download, logged                      | trusted source; build divergence outweighed the gain                                                 |
| model catalog (01)                        | frozen build-time snapshot            | upstream runtime fetch, logged, once per start | catalog data is not user context; the boundary check governs the destinations it yields              |
| name-based `opencode*` provider drop (01) | planned                               | not implemented                                | classifies by provider id, which the boundary forbids; replaced by a data filter on the fetch result |
| egress-check workflow (11)                | added                                 | to be removed                                  | source-built tool; `run.sh` is enough                                                                |

## 5. Softenings recommended by the proportionality review, pending your go

1. Websearch: keep upstream's env-var gate instead of the new config key. Saves about 300 lines of schema, SDK, and test churn.
2. `import`: restore the local JSON-file import and delete only the share-URL branch.
3. Webfetch: keep upstream's browser user agent and Cloudflare fallback; no privacy effect on user-triggered tool egress and it gets past bot-blocking sites.
4. Delete the leftover share stub once PRs 1 and 2 are both merged.
5. Keep one npm install log line, not two, where PRs 2 and 3 overlap.

## 6. Gaps found, not yet fixed

- `hermit upgrade` still resolves upstream's GitHub releases and the `opencode-ai` npm package, so running it would install OpenCode over Hermit. Hide it or retarget it in plan 12.
- Removing the session-affinity header drops sticky routing at gateways that use it. Needs one line in `docs/upstream.md`.
- `packages/server/src/cors.ts` still allows any `*.opencode.ai` origin by default. Phase 5.

## 7. What is next

Apply the softenings, integrate the five branches in order (harness, hosted services, tools, plugins, catalog), regenerate the SDK once, run the harness against the integrated binary, then phase 5: branding (plan 12) and the discretionary removals.
