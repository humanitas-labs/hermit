# 11 Verification

**Status:** done (baseline recorded)

## 1. Goal

Automated tests verify the acceptance contract (`.plan/README.md`, `docs/privacy-model.md` section 15) against the real binary for every supported inference path in `10` section 3.0 and the scenarios below. Record coverage and limitations in `coverage.md` so the guarantee claimed matches what is tested. Tool-driven network use is expected and asserted separately.

## 2. Owned files (new)

- `script/egress-check/fake-inference.ts`: OpenAI-compatible server on loopback that streams a scripted reply with tool calls and records every request and header.
- `script/egress-check/recorder.ts`: recording HTTP(S) proxy, recording DNS responder and any-address sink (Linux namespace mode), macOS `sandbox-exec` profile and unified-log reader.
- `script/egress-check/harness.ts`: scenario definitions, isolated-home setup, cold and warm runs, allowlist evaluation, report.
- `script/egress-check/bypass-fixture.ts`: deliberate proxy bypass (raw connect to 192.0.2.1:443) that the OS layer must catch.
- `script/egress-check/tsconfig.json`: typecheck config for the harness (`tsgo --noEmit -p script/egress-check/tsconfig.json`).
- `script/egress-check/run.sh`: builds the binary, runs the scenarios, asserts.
- `script/egress-check/allowlist.json`: documented destinations per scenario.
- `script/egress-check/coverage.md`: which inference paths, transports, and scenarios are covered and which are not.
- `.github/workflows/egress-check.yml`: not kept. `13` deletes upstream `.github/` wholesale and the review decided against GitHub-hosted CI; `run.sh` is the deliverable and the namespace-level layer is documented as a manual Linux step.
- `docs/strict-deployment.md`: optional external enforcement for users who want it.

## 3. Method

Network inspection, not source assumptions. Two capture layers so the test is not fooled by a bypass of one:

1. **Process-level**: run the binary with `HTTPS_PROXY`/`HTTP_PROXY` pointed at a recording proxy on loopback and a resolver that logs every DNS query (`dnsmasq` with `log-queries`, or a tiny UDP responder in the test). Bun `fetch` honors the proxy env; Arborist and child processes honor it too for HTTP.
2. **Namespace-level** (Linux CI): run inside `unshare -n` with only loopback plus a veth to the recording proxy, so anything that ignores the proxy env shows up as a connection failure in the log and fails the run.

Rules for every run:

- Isolated config directory, credentials file, caches, and environment. Nothing from the developer's machine leaks in.
- Run each scenario cold-cache and warm-cache.
- Record attempted connections as well as completed requests (proxy CONNECT attempts, DNS queries, and namespace-level connection failures). Network isolation alone is not evidence that no connection was tried.
- Include a deliberate forbidden connection made by a test fixture that bypasses the proxy environment variables, to verify the harness detects proxy bypass. If the harness misses it, the run fails.
- Seed sessions with synthetic context markers (unique strings in the prompt and in a file the agent reads) and scan every recorded non-inference request body and header for them.
- Failure output names the destination, path, and scenario. Never print credentials or complete request bodies.

Scenarios:

| Scenario                     | Config                                                                                                                         | Expect                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| S1 local session             | one loopback provider, `preset: private`                                                                                       | inference requests only to `127.0.0.1:<port>`; no DNS queries; no other connections                                |
| S2 local session with tools  | S1 plus a scripted `webfetch` to a second loopback server                                                                      | S1 plus exactly that fetch, attributed to the tool call in the session log                                         |
| S3 local model down          | S1, server stopped mid-session                                                                                                 | request fails; no other host contacted; session reports the error                                                  |
| S4 third-party session       | provider `baseURL` pointing at the fake server via an `/etc/hosts` alias for `api.fireworks.ai` and a trusted self-signed cert | inference requests only to that host; headers contain no session identifiers; TUI/`run` output shows `THIRD PARTY` |
| S5 preset conflict           | `preset: private` with a third-party provider enabled                                                                          | startup error naming the provider                                                                                  |
| S6 background quiet          | start the TUI, idle 90 seconds, exit                                                                                           | no connections at all (catches update check, catalog refresh, bootstrap install regressions)                       |
| S7 secondary calls           | S1 plus a session long enough to trigger title generation, compaction, a subagent, and agent generation                        | every model call goes to the loopback endpoint                                                                     |
| S8 remote secondary override | S1 with `small_model` pointing at a third-party provider, and separately a plugin small-model hook returning one               | the secondary call is rejected; primary session continues; no remote contact                                       |
| S9 project weakening         | S1 with a project `opencode.json` that sets `preset: external`, adds a provider, or sets `owner: "user"` on a remote endpoint  | project values ignored with a warning; no remote contact                                                           |
| S10 false local              | provider `baseURL` remote with `owner: "user"` and a config attempt to mark it local                                           | classified `USER`, never `LOCAL`; rejected under `private`                                                         |
| S11 endpoint drift           | same provider ID, one model with a per-model `baseURL` to a second fake host                                                   | the per-model endpoint is classified and checked on its own                                                        |
| S12 redirect                 | fake local server answers 307 to a second host                                                                                 | request fails; second host never contacted                                                                         |
| S13 idle credentials         | S1 with a Fireworks key present in the isolated auth file                                                                      | startup succeeds; Fireworks never contacted; model rejected only if selected                                       |
| S14 tooling downloads        | open a TypeScript file with empty caches, once with `OPENCODE_DISABLE_LSP_DOWNLOAD` set and once without                       | no download when set; expected download logged when unset, no context markers in the request                       |
| S15 every runtime            | repeat S1 and S7 for each retained inference runtime and transport in `10` section 3.0                                         | same as S1/S7                                                                                                      |

Assertions compare the recorded destination list, including attempts, to `allowlist.json` per scenario. Any unexpected destination or attempt fails the run and prints the destination and path.

## 4. Optional strict deployment

For users who want the model-context guarantee enforced outside the application, `docs/strict-deployment.md` documents running Hermit and `llama-server` in one container with `--network none`, and per-user firewall rules on Linux (`nftables` `meta skuid`) and macOS (`pf` `user` rules). This is not the primary boundary and is not required for CI. It exists because `bash` can always run `curl`.

## 5. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
| none | The harness is additive (`script/egress-check/`, `docs/strict-deployment.md`). No file under `packages/` was changed. | |

## 6. Baseline

Recorded 2026-09-25 against the stripped, otherwise unmodified binary at `785fed388e` (built as `0.0.0-egress`), on macOS 26.6 arm64 with `sandbox-exec` isolation, by `script/egress-check/run.sh`. 37 runs: S0 passed, 36 failed. Cold and warm results were identical for every scenario, so each row below covers both. "Expected" is the audit's prediction for the unmodified binary. Every `run` and TUI invocation attempted `models.opencode.ai:443` (catalog refresh, plan `01`) and `registry.npmjs.org:443` (`@opencode-ai/plugin` bootstrap install, plan `05`); those two are abbreviated as "catalog, npm" below and are the sole failure cause wherever nothing else is listed.

| Scenario | Expected | Observed | Destinations and findings |
|---|---|---|---|
| S0 bypass fixture | pass | pass | raw connect to 192.0.2.1:443 killed by the sandbox and recorded; the OS layer is live |
| S1 local session | fail | fail | loopback primary and title; catalog, npm |
| S2 tools | pass | fail | S1 plus the scripted `webfetch` to the loopback tool target, attributed to the tool call in the JSON event stream; catalog, npm |
| S3 local model down | pass | fail | loopback attempts only through five retries (65 s), session reports `APIError`, exit 1; catalog, npm |
| S4 third-party session | fail | fail | primary and title to `api.fireworks.ai` only, no other remote host; `x-session-id` and `x-session-affinity` headers carry the session ID to the remote endpoint (plan `09`); no `THIRD PARTY` label in output (plan `10` 3.3); catalog, npm |
| S5 preset conflict | fail | fail | `hermit.preset` is unknown to the binary: normal session on loopback, exit 0, no error naming the remote provider; catalog, npm |
| S6 background quiet | fail | fail | TUI idle 90 s: catalog, npm; no update-check destination observed |
| S7 secondary calls | pass | fail | title, compaction, subagent, and agent generation all reached loopback; catalog, npm (twice, once per command) |
| S8a `small_model` remote | fail | fail | title generation went to `api.fireworks.ai` while the primary turn stayed on loopback; session headers sent; catalog, npm |
| S8b plugin small-model hook | fail | fail | same as S8a via `experimental.provider.small_model`; catalog, npm |
| S9 project weakening | fail | fail | project `opencode.json` `small_model` was honored: title to `api.fireworks.ai`; project `hermit.preset` and `owner` ignored only because the keys do not exist yet; catalog, npm |
| S10 false local | fail | fail | primary and title to `api.fireworks.ai`, exit 0; catalog, npm |
| S11 endpoint drift | fail | fail | per-model `options.baseURL` was not applied (both requests hit the provider-level loopback URL), so the drift was silently ignored rather than rejected; exit 0; catalog, npm |
| S12 redirect | fail | fail | on the loopback 307 the binary followed the redirect to `redirect.example.test` (system resolver lookup, killed by the sandbox); catalog, npm |
| S13 idle credentials | pass | fail | Fireworks never contacted, startup fine; catalog, npm |
| S14a LSP download disabled | pass | fail | no language-server download; catalog, npm |
| S14b LSP download enabled | pass | fail | the required `registry.npmjs.org` attempt appeared, but the harness cannot separate the `typescript-language-server` fetch from the plugin bootstrap fetch at baseline; no context markers in non-inference traffic; catalog |
| S15a native runtime local | fail | fail | as S1 on `OPENCODE_EXPERIMENTAL_NATIVE_LLM`; catalog, npm |
| S15b native runtime secondary | pass | fail | title, compaction, subagent on loopback; catalog, npm |

Rows the audit predicted as passing fail only because of the catalog and npm attempts; once plans `01` and `05` land they should pass without changes to the harness. S4, S8, S9, S10, S11, S12 need plans `09` and `10`.

## 7. Cross-region notes

- `packages/script/src/index.ts` (owned by `13`) reads `.github/TEAM_MEMBERS` at import time and, without `OPENCODE_VERSION`, fetches the latest version from `registry.npmjs.org`. The strip deleted `.github/`, so `bun run build` fails on a clean checkout. `run.sh` works around it by stubbing an empty `.github/TEAM_MEMBERS` for the build and setting `OPENCODE_VERSION=0.0.0-egress`. Plan `13` should drop the team-member read and the npm version lookup from `packages/script` (or delete the package), after which the stub goes away.
- `packages/opencode/script/build.ts` (owned by `13`) requires Bun matching the root `packageManager` (`^1.3.14`). The harness inherits that; `run.sh` takes `BUN=<path>` to a suitable binary.
- The scenarios configure `hermit.preset`, `provider.<id>.owner`, and a per-model `options.baseURL` as plan `10` specifies. The current binary ignores unknown config keys silently, which is why S5, S9, S10, and S11 produce a normal session at baseline. Per-model `options.baseURL` is also not applied by the current provider loader (S11), so plan `10` must decide whether per-model endpoints are supported at all before classifying them. No product hook was needed for the harness itself.
- Observed at baseline, for the owning plans: every `run` invocation attempts `models.opencode.ai:443` (plan `01`) and `registry.npmjs.org:443` for the `@opencode-ai/plugin` bootstrap install (plan `05`), including with `OPENCODE_PURE` unset and `formatter: false`; inference requests carry `x-session-id` and `x-session-affinity` headers (plan `09`); on a 307 from the loopback model the redirect target is resolved directly, bypassing the proxy (plan `10` redirect rule).
- The TUI idle scenario (S6) attempts only the two destinations above. No update-check destination (`api.github.com`, `formulae.brew.sh`, or the npm registry `opencode-ai` path) was observed within 90 seconds with `OPENCODE_DISABLE_AUTOUPDATE` unset; the harness did not determine why (`Installation.method()` shells out to package managers first, and the fake build reports version `0.0.0-egress`). Plan `04` should remove the check regardless and re-run S6.
