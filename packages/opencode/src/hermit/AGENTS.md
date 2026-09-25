# Hermit inference boundary

Read `docs/privacy-model.md` section 15 and `.plan/10-inference-boundary.md` before touching anything that sends model context.

## Where the check lives

The policy module is `packages/core/src/hermit/policy.ts`. It is pure apart from one process-global ref. Two seams call `HermitPolicy.guardFetch`, and every Hermit-managed model call goes through one of them:

- `packages/opencode/src/provider/provider.ts`, `resolveSDK`: the AI SDK runtime. Primary turns, titles, compaction, subagents, agent generation, project-copy names, and every provider or plugin `fetch` override run under this wrapper. The policy comes from the instance config (`State.policy`).
- `packages/core/src/effect/app-node-platform.ts`, `requestExecutor`: the native runtime and the V2 runner. This executor has its own `FetchHttpClient` whose `Fetch` is guarded by the process-global policy, which `Config.loadInstanceState` narrows on every instance load. The shared `httpClient` node stays unguarded because tools and downloads are governed by permissions, not by the boundary.

If you add a third way to reach a provider, route it through one of these two or add a row to the inventory in `.plan/10-inference-boundary.md` section 3.0 with its own seam and test.

## Rules that are easy to break

- Classification is on the resolved URL, per request. Do not classify by provider ID and do not cache the class across config reloads.
- Loopback is literal only. No DNS, no private ranges, no suffix matching. Config cannot label a remote endpoint `local`.
- `hermit.preset` and `provider.<id>.owner` are user-level config. `Config.loadInstanceState` strips them from project sources, except a stricter project preset. Do not add another read of these keys that bypasses that strip.
- The process-global policy only narrows. Widening needs a restart. This is deliberate so a multi-instance server process stays fail-closed.
- Redirects: local and user endpoints never follow one. Third-party endpoints may follow same-host, same-class redirects only. `guardFetch` follows manually so the target is checked before the body is re-sent.
- `getSmallModel` ignores a plugin `experimental.provider.small_model` result from a different provider. A plugin may pick a smaller model, not a different destination.
- Refusal is a `HermitDestinationError` carrying the origin only. Never put the path, query, or credentials in it.

## Tests

- `packages/core/test/hermit-policy.test.ts`: classification, presets, redirects, `fromConfig`, `narrow`, and `guardFetch` against a loopback server.
- `packages/opencode/test/hermit/boundary.test.ts`: the V1 seam end to end through `Provider.getLanguage`, including user-level versus project-level config.
- `packages/core/test/hermit-executor.test.ts`: the native seam through `RequestExecutor`.

The egress harness in `script/egress-check` verifies the same contract on the built binary.
