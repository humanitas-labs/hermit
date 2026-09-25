# 10 Inference Boundary

**Status:** not started

## 1. Goal

Every Hermit-managed model call must satisfy the same inference policy before transmitting context. Reuse the existing inference paths and add shared policy checks at their enforcement points. Do not add a new routing layer.

A supported inference path is complete only when policy enforcement and a corresponding test in `11` cover it. Any path not in the inventory below is unsupported and must be removed or gated off until it is inventoried.

## 2. Owned files

- New `packages/opencode/src/hermit/policy.ts`: endpoint classification, policy resolution, and the destination check.
- New `packages/opencode/src/hermit/AGENTS.md`: boundary notes.
- `packages/core/src/v1/config/config.ts`: `hermit.preset` and `provider.<id>.owner: "user"` (see 3.2); the config layering rule in 3.5.
- `packages/opencode/src/provider/provider.ts`: expose the resolved per-model endpoint and its class on `Provider.Model`; `resolveSDK` fetch wrapper is the enforcement point for V1.
- `packages/opencode/src/session/llm.ts`, `session/prompt.ts` lines 218-221, `session/compaction.ts`, subagent and agent-generation call sites: policy check before `streamText`.
- `packages/opencode/src/plugin/index.ts`: the `experimental.provider.small_model` hook output is subject to the same check.
- V2 runner and native-runtime paths (inventory in 3.0 names the files).
- `packages/tui/src` status line and `dialog-provider.tsx`: render the class.
- `packages/protocol` / SDK: class field on provider and model info; regenerate.

## 3. Design

### 3.0 Inference-path inventory

First deliverable. Enumerate every place Hermit sends model context to a provider, with file and line, transport, and how the endpoint is resolved:

| Path | Where | Transport | Status |
|---|---|---|---|
| V1 primary turn | `session/llm.ts` → `resolveSDK` fetch | HTTP | to inventory |
| V1 title generation | `session/prompt.ts:218-221` via `getSmallModel` or `small_model` config | HTTP | to inventory |
| V1 compaction | `session/compaction.ts:359-361`, uses the `compaction` agent's model override or the session model, not the small model | HTTP | to inventory |
| V1 subagents | task tool → `SessionPrompt` with parent's or agent's model | HTTP | to inventory |
| Agent generation | `agent/generate.ts` | HTTP | to inventory |
| Plugin small-model hook | `experimental.provider.small_model` (`packages/plugin/src/index.ts:297`) can substitute the title model | HTTP | to inventory |
| Project copy | `httpapi/handlers/project-copy.ts:31` uses `getSmallModel` | HTTP | to inventory |
| V2 runner | `SessionRunner` `llm.stream(request)` | HTTP | to inventory |
| Native runtimes | Claude Code / Codex runtimes if retained | HTTP, WebSocket | to inventory |
| Codex WebSocket transport | `plugin/index.ts:62-73` | WebSocket | to inventory |

Fill the table by reading code, not docs. Each row gets a test in `11` or is removed.

### 3.1 Classification

`policy.ts` exports `classify(endpoint: URL, config): "local" | "user" | "third-party"`. Classification is derived from the effective request endpoint, per request, not per provider ID. A provider whose models resolve to different `baseURL`s gets a class per model.

1. Loopback host (`127.0.0.0/8`, `::1`, `localhost`, literal, no DNS) is `local`. Configuration cannot label a remote endpoint as local.
2. Any other host defaults to `third-party`.
3. The user may explicitly designate a remote endpoint `user` via `provider.<id>.owner: "user"` in user-level config. That designation describes ownership, not locality, and cannot produce `local`.

No DNS. No suffix matching. A private-range IP is `third-party` unless the user designates it `user`.

Loopback classification assumes the local inference service is trusted and does not forward context remotely. That assumption is stated in the acceptance contract.

### 3.2 Destination check

Before sending context, validate the effective inference destination against the active policy (3.4) and the user's authorized endpoint configuration. An unchanged provider ID is not sufficient authorization; the check runs on the resolved URL.

- Fail closed on an unauthorized destination with a tagged error the UI can show. Never automatically fall back to another provider or endpoint.
- Reject HTTP redirects from `local` and `user` endpoints in the initial implementation. Third-party providers may legitimately redirect; for them, the redirect target must classify the same and stay on the same registrable host, else fail. A provider that needs cross-host redirects needs an explicit design and tests before support.
- Title, compaction, small-model, subagent, agent-generation, and plugin small-model hook results must pass the same check. Explicit secondary-model configuration is permitted only inside the authorized boundary.
- The Codex WebSocket transport enforces the same check on its connect URL or is unavailable under `private` and `trusted` presets.
- Retry logic (`session/retry.ts`) must never select a different endpoint. Verify by reading it; upstream currently retries the same model only.

### 3.3 Visibility

TUI status line shows `LOCAL`, `USER`, or `THIRD PARTY` next to the model name, colored by the Hermit theme (green, orange, red). The model picker groups models by class. `hermit models` prints the class per model.

### 3.4 Presets

`hermit.preset`:

- `private` permits only `local` inference.
- `trusted` permits `local` and explicitly designated `user` inference.
- `external` additionally permits `third-party` inference.

Default is `private`. Remote use requires deliberate user configuration or selection that updates the applicable policy.

A catalog entry or stored credential may exist without being usable under the current policy. Reject forbidden model selections and requests; do not reject startup merely because credentials for another provider exist. This lets a user keep a Fireworks key while running a genuinely local session.

Validate the policy at startup (report which configured models are usable) and enforce it on every inference request.

### 3.5 Policy ownership

Privacy policy and endpoint authorization come from user-level configuration outside the repository, or from a deliberate user action in the UI. Project configuration may narrow the policy but cannot weaken it. Concretely, project config cannot:

- authorize a new inference destination
- change an endpoint's ownership classification
- enable remote secondary inference
- raise the preset

Credentials discovered in the environment make authentication available; their presence alone does not authorize context transmission.

Implement as a merge rule in config loading: `hermit.*` and `provider.<id>.owner` are read from user-level config only; a project value for those keys is ignored with a logged warning, except a project preset that is stricter than the user's.

## 4. Verification

- Unit tests for `classify` covering IPv4 loopback, IPv6, `localhost`, mixed case, userinfo tricks (`http://localhost@evil/`), private ranges, `owner: "user"`, and a project-config attempt to set `owner` or a looser preset. Tests in `packages/opencode/test/hermit/`.
- Unit tests for the destination check on each inventoried path, including a `small_model` override to a remote provider during a `private` session and a plugin small-model hook returning a remote model.
- Integration in `11`: scenarios S1, S3, S5, S7-S12.

## 5. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
