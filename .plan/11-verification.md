# 11 Verification

**Status:** not started

## 1. Goal

Automated tests verify the acceptance contract (`.plan/README.md`, `docs/privacy-model.md` section 15) against the real binary for every supported inference path in `10` section 3.0 and the scenarios below. Record coverage and limitations in `coverage.md` so the guarantee claimed matches what is tested. Tool-driven network use is expected and asserted separately.

## 2. Owned files (new)

- `script/egress-check/fake-inference.ts`: OpenAI-compatible server on loopback that streams a scripted reply with tool calls and records every request and header.
- `script/egress-check/run.sh`: builds the binary, runs the scenarios, asserts.
- `script/egress-check/allowlist.json`: documented destinations per scenario.
- `script/egress-check/coverage.md`: which inference paths, transports, and scenarios are covered and which are not.
- `.github/workflows/egress-check.yml`: `13` deletes upstream `.github/` wholesale. Recreate the directory with only this workflow. If GitHub-hosted CI is not wanted, `run.sh` is the deliverable and the namespace-level layer is documented as a manual Linux step.
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

| Scenario | Config | Expect |
|---|---|---|
| S1 local session | one loopback provider, `preset: private` | inference requests only to `127.0.0.1:<port>`; no DNS queries; no other connections |
| S2 local session with tools | S1 plus a scripted `webfetch` to a second loopback server | S1 plus exactly that fetch, attributed to the tool call in the session log |
| S3 local model down | S1, server stopped mid-session | request fails; no other host contacted; session reports the error |
| S4 third-party session | provider `baseURL` pointing at the fake server via an `/etc/hosts` alias for `api.fireworks.ai` and a trusted self-signed cert | inference requests only to that host; headers contain no session identifiers; TUI/`run` output shows `THIRD PARTY` |
| S5 preset conflict | `preset: private` with a third-party provider enabled | startup error naming the provider |
| S6 background quiet | start the TUI, idle 90 seconds, exit | no connections at all (catches update check, catalog refresh, bootstrap install regressions) |
| S7 secondary calls | S1 plus a session long enough to trigger title generation, compaction, a subagent, and agent generation | every model call goes to the loopback endpoint |
| S8 remote secondary override | S1 with `small_model` pointing at a third-party provider, and separately a plugin small-model hook returning one | the secondary call is rejected; primary session continues; no remote contact |
| S9 project weakening | S1 with a project `opencode.json` that sets `preset: external`, adds a provider, or sets `owner: "user"` on a remote endpoint | project values ignored with a warning; no remote contact |
| S10 false local | provider `baseURL` remote with `owner: "user"` and a config attempt to mark it local | classified `USER`, never `LOCAL`; rejected under `private` |
| S11 endpoint drift | same provider ID, one model with a per-model `baseURL` to a second fake host | the per-model endpoint is classified and checked on its own |
| S12 redirect | fake local server answers 307 to a second host | request fails; second host never contacted |
| S13 idle credentials | S1 with a Fireworks key present in the isolated auth file | startup succeeds; Fireworks never contacted; model rejected only if selected |
| S14 tooling downloads | open a TypeScript file with empty caches, once with `OPENCODE_DISABLE_LSP_DOWNLOAD` set and once without | no download when set; expected download logged when unset, no context markers in the request |
| S15 every runtime | repeat S1 and S7 for each retained inference runtime and transport in `10` section 3.0 | same as S1/S7 |

Assertions compare the recorded destination list, including attempts, to `allowlist.json` per scenario. Any unexpected destination or attempt fails the run and prints the destination and path.

## 4. Optional strict deployment

For users who want the model-context guarantee enforced outside the application, `docs/strict-deployment.md` documents running Hermit and `llama-server` in one container with `--network none`, and per-user firewall rules on Linux (`nftables` `meta skuid`) and macOS (`pf` `user` rules). This is not the primary boundary and is not required for CI. It exists because `bash` can always run `curl`.

## 5. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
