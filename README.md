<div align="center">
  <img src="docs/hermit.png" alt="Hermit" width="240">
  <h1>Hermit</h1>
</div>

Hermit is a privacy-focused fork of OpenCode.

It is designed around a simple principle: users should have explicit control over where their private data and model context go.

Hermit can use the web and other network resources while keeping model inference local. Network access and private-data egress are treated as separate concerns.

## 1. Goals

Hermit prioritizes:

1. Privacy and auditability
2. Reliable model and tool execution
3. Local inference
4. Explicit data-egress boundaries
5. Simple architecture
6. Maintainability

Hermit is not intended to track every OpenCode feature or remain feature-equivalent with upstream.

## 2. Inference

### 2.1 — Local inference

Hermit supports local inference through llama.cpp / `llama-server`.

Local inference means that model context remains on the user's machine.

It does not mean that the agent is offline.

Hermit may still use network-capable tools for web search, documentation, Git repositories, package registries, APIs, and other resources.

Local inference must never silently fall back to remote inference.

### 2.2 — Remote inference

Hermit may support explicitly configured remote inference providers such as Fireworks or user-controlled inference servers.

Remote inference is an explicit trust decision.

Hermit should clearly identify when model context is being transmitted to infrastructure outside the local machine.

Hermit does not require a Hermit or OpenCode account.

## 3. Core functionality

Hermit preserves the parts of OpenCode that provide the core coding-agent experience, including:

- model interaction
- tool calling
- shell execution
- filesystem access
- file editing and patching
- git integration
- web and network-capable tools
- context management and compaction
- permissions
- sessions
- terminal interfaces

Features outside this core are evaluated against Hermit's privacy and simplicity goals.

## 4. Relationship with OpenCode

Hermit is a fork of OpenCode and benefits from the substantial engineering work of the upstream project.

Hermit intentionally maintains an independent product and architectural direction.

OpenCode is treated as an upstream source of useful bug fixes, compatibility work, performance improvements, security fixes, and ideas. Hermit does not automatically merge upstream releases.

See `docs/fork.md` for the project's upstream and divergence policy.

## 5. Privacy model

Hermit's privacy model is based on **explicit egress**.

The objective is not to prevent Hermit from accessing the internet.

The objective is to prevent private data and agent context from being transmitted to model providers, telemetry systems, hosted agent services, or other unintended recipients without an explicit and understandable trust decision.

Conceptually:

```text
Hermit
   │
   ├── web / documentation / Git / packages ──→ network
   │
   ├── shell / filesystem / local tools
   │
   └── model context
            │
            ▼
       INFERENCE BOUNDARY
         │          │
      localhost   configured remote
      llama.cpp    provider
```

**Local inference ≠ offline.**

Local inference means model context stays local. Network-capable tools may still access the internet.

Any transmission of private context to an inference provider or application service should cross an explicit trust boundary.

See `docs/privacy-model.md` for the complete privacy architecture.

## 6. Security limitations

An agent with shell and network access can itself execute commands that transmit information.

For example, an agent could theoretically use `curl`, `git push`, an API request, or another network-capable tool to transmit local data.

Hermit therefore distinguishes between:

- application and inference egress controlled by Hermit
- network actions explicitly performed through agent tools

The initial privacy model focuses on eliminating hidden application and inference egress.

More granular tool-egress controls may be introduced separately.

## 7. License and attribution

Hermit contains software derived from OpenCode.

Upstream copyright and license notices must be preserved as required by the applicable licenses.

Hermit is an independent project and is not affiliated with or endorsed by the OpenCode project or its maintainers.
