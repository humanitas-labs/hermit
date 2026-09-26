<div align="center">
  <img src="docs/hermit.png" alt="Hermit" width="240">
  <h1>Hermit</h1>
  <p>A coding agent for your terminal that tells you exactly where your context goes.</p>
</div>

Hermit is a privacy-focused fork of [OpenCode](https://github.com/anomalyco/opencode). It keeps the parts that make a good coding agent, drops the hosted product around it, and adds one rule: your conversation goes only to a model endpoint you configured yourself, and the UI always shows which kind of endpoint that is.

Hermit is not an offline tool. The agent can still search the web, clone repositories, and hit APIs when a task needs it. What it will not do is quietly send your code, prompts, or session data to a model provider, a telemetry service, or a hosted account you did not ask for.

## 1. Why Hermit

Coding agents see everything: your source, your shell, your notes. Most of them also phone home in ways you never see, whether that is a title-generation call to a cloud model, an account sync, or a session shared to a hosted viewer. Hermit's answer is a single visible inference boundary.

Every model request is classified by the address it is about to hit:

| Class | Meaning | Shown as |
| --- | --- | --- |
| local | a literal loopback address, such as `127.0.0.1` or `localhost` | LOCAL, green |
| user | a remote endpoint you marked as yours in your own config | USER, yellow |
| third party | anything else, including cloud providers you have keys for | THIRD PARTY, red |

A preset in your user config says which classes are allowed. `private` is the default and allows only local. `trusted` adds user. `external` adds third party. Anything outside the preset is refused with an error that names the destination. There is no fallback to another model or endpoint, and titles, compaction, and subagents follow the same rule as your main conversation. A project's config can make the preset stricter but can never loosen it.

## 2. Quick start

Hermit builds from source. You need [Bun](https://bun.sh) and a local model server on loopback. The two most common are [Ollama](https://ollama.com) (`ollama serve`, port 11434) and [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`, port 8080). LM Studio and anything else that speaks the OpenAI API on loopback also works.

```sh
git clone https://github.com/humanitas-labs/hermit.git
cd hermit
bun install
bun dev
```

Then point a provider at your local server in your user config (`~/.config/opencode/opencode.json` until the rename lands). For Ollama, list the models you have pulled:

```json
{
  "model": "ollama/qwen3.5:9b",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama",
      "options": { "baseURL": "http://127.0.0.1:11434/v1" },
      "models": { "qwen3.5:9b": { "name": "Qwen 3.5 9B", "tool_call": true } }
    }
  }
}
```

For llama.cpp, the same block with `"baseURL": "http://127.0.0.1:8080/v1"` and whichever model `llama-server` loaded. Pick a model that supports tool calling; without it the agent can talk but not edit files or run commands.

Pick the model in the TUI and the footer shows LOCAL. To use a cloud provider such as Fireworks or OpenRouter, add its key the same way you would in OpenCode. Its models then appear in the picker marked THIRD PARTY and not permitted, and choosing one explains what would be sent where and offers to change the preset for you. You can also set it by hand:

```json
{ "hermit": { "preset": "external" } }
```

OpenRouter requests ask for zero data retention endpoints by default, so prompts are routed only to upstreams that do not keep them. Set `provider.zdr` to `false` in a model's options to override that.

To restrict cloud use to a single provider, combine `external` with OpenCode's existing `enabled_providers` list. To mark a remote box you run as your own, so it works under `trusted`, add `"owner": "user"` to that provider alongside its `baseURL`.

`hermit models` prints every model with its class and whether the current preset permits it.

## 3. What Hermit keeps from OpenCode

The core agent: model interaction, tool calling, shell, filesystem, file editing, git, web and network tools, context compaction, permissions, sessions, and the terminal UI. Upstream bug fixes and improvements to these are ported selectively; see `docs/fork.md` for how.

## 4. What Hermit removes

Accounts and hosted config, session sharing, the update check and silent self-upgrade, telemetry export, identifying request headers, the startup npm install into your config directory, the OpenCode Zen provider, the web and desktop UIs, and all of the infrastructure, marketing, and release tooling that exists to run OpenCode as a company. Downloads that the agent genuinely needs, such as ripgrep, language servers, and configured plugins, stay on and log their destination before they run.

## 5. Status

The strip and the inference boundary are on `master`. The remaining privacy removals are in review as separate branches, and the rename from `opencode` paths and names to `hermit` comes after that. Until then, a fresh start still contacts the model catalog and the npm registry once. The audit, per-region plans, and a one-page summary of every change live in `.plan/`.

## 6. Limits worth knowing

- **Tools can still transmit.** An agent with a shell can run `curl` or `git push`. Hermit governs that through the normal tool permission prompts, not the inference boundary. Finer tool-egress controls are a separate, future feature.
- **Local inference trusts the local server.** If your inference server forwards data somewhere, Hermit cannot see that. The same goes for plugins, which are executable code you chose to install.
- **Loopback means loopback.** A box on your LAN is third party until you mark it as yours. That is deliberate.

Read `docs/privacy-model.md` for the full model, including the acceptance contract the test harness checks against.

## 7. Verifying it yourself

`script/egress-check/run.sh` builds the binary, runs scripted sessions against a fake model server on loopback, records every network destination the process attempts, and fails on anything outside a documented allowlist. On Linux it runs inside a network namespace; on macOS it uses `sandbox-exec`. See `script/egress-check/coverage.md` for what is and is not covered.

## 8. License and attribution

Hermit contains software derived from OpenCode and preserves upstream copyright and license notices as the licenses require. Hermit is an independent project and is not affiliated with or endorsed by the OpenCode project or its maintainers.
