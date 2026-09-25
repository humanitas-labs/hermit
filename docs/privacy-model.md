# Hermit Privacy Model

This document defines Hermit's intended privacy architecture.

Hermit is not designed to be an offline coding agent. It may access the web, Git repositories, package registries, documentation, APIs, and other network resources when those capabilities are useful.

The primary privacy objective is different:

> **Private local data and agent context must not be transmitted to model providers, telemetry systems, hosted agent services, or other unintended recipients without an explicit and understandable trust decision.**

## 1. Threat model

Hermit may operate around highly sensitive information, including:

- source code
- credentials
- financial records
- tax documents
- personal documents
- business information
- communications
- local files
- shell output
- conversation history

The primary concern is unintended transmission of this information outside the user's chosen trust boundary.

Hermit should therefore make data egress explicit, auditable, and minimal.

## 2. Network access is not inherently untrusted

Hermit does not treat all network access as equivalent.

The agent should remain capable of using:

- web search
- documentation
- Git repositories
- package registries
- APIs
- remote development resources
- other user-approved network tools

Blocking all networking would unnecessarily reduce the usefulness of the agent.

Instead, Hermit should distinguish between ordinary network access and transmission of private agent context.

## 3. Inference boundary

### 3.1 — Centralized inference

All model inference should pass through a clearly defined inference layer.

Conceptually:

```text
Hermit
   │
   ├── tools
   ├── filesystem
   ├── shell
   ├── web
   └── agent context
          │
          ▼
    INFERENCE BOUNDARY
          │
     ┌────┴───────────────┐
     │                    │
 localhost            remote provider
 llama.cpp             Fireworks / etc.
```

There should not be hidden or secondary model calls elsewhere in the application.

### 3.2 — Local inference

Local inference through llama.cpp should keep model context on the user's machine.

No account should be required.

Local inference must never silently fall back to remote inference.

### 3.3 — Remote inference

Remote inference should always represent an explicit trust decision.

Hermit should make it clear when agent context is being transmitted to an external inference provider.

The configured provider should be the actual destination of the request rather than an intermediary Hermit or OpenCode service.

## 4. Provider trust

Hermit should treat inference endpoints according to their trust boundary.

Potential classifications include:

### 4.1 — Local

Examples:

- llama.cpp
- another inference server on localhost

Agent context remains on the machine.

### 4.2 — User-controlled remote

Examples:

- a GPU server operated by the user
- a private vLLM deployment
- infrastructure controlled by the user's organization

Data leaves the local machine but remains within infrastructure explicitly controlled by the user.

### 4.3 — Third-party inference

Examples:

- Fireworks
- other hosted inference APIs

Agent context is transmitted to a third party.

Hermit should make this distinction visible rather than treating every provider as interchangeable.

## 5. No implicit inference egress

Hermit should never:

- silently change providers
- fall back from local to remote inference
- send context to a secondary model
- perform remote summarization without explicit configuration
- perform remote embeddings without explicit configuration
- send context to hosted routing services
- use cloud inference for background features without explicit configuration

A user choosing local inference should be able to reason that model context remains local.

## 6. Non-inference egress

Inference is not the only possible path for private information to leave the system.

Hermit should remove or disable unnecessary mechanisms such as:

- telemetry
- analytics
- crash reporting containing user data
- hosted session storage
- cloud synchronization
- account synchronization
- remote session sharing
- automatic upload of logs
- remote debugging
- OpenCode-hosted intermediary services

Network behavior unrelated to the user's requested tools or configured inference should be minimized.

## 7. Tool egress

### 7.1 — Tools can transmit data

A web-capable agent can intentionally or accidentally transmit local information through tools.

For example:

```text
curl
git push
HTTP POST
browser upload
API request
```

Hermit should therefore not claim that unrestricted web access makes arbitrary data exfiltration impossible.

### 7.2 — Initial policy

The initial version of Hermit should focus on preventing **implicit application and inference egress**.

Tool-driven network activity should remain visible through the normal tool execution and permission system.

The agent should not receive hidden mechanisms for transmitting data.

### 7.3 — Future egress controls

Hermit may later introduce more sophisticated controls for network-capable tools.

Examples include:

- requiring approval before uploading local files
- distinguishing GET-like retrieval from data-bearing outbound requests
- warning when local file contents are being sent to a remote host
- domain allowlists
- per-tool network permissions
- sensitive-directory policies

These controls should be introduced only when their security properties can be clearly explained.

## 8. Sensitive local data

Hermit should assume that any accessible local file may be sensitive.

The application should therefore avoid architectural features that automatically:

- index local files remotely
- upload repositories
- generate cloud embeddings
- synchronize workspace state
- send diagnostics containing file contents
- include unrelated files in model context

Only information necessary for the current operation should enter model context.

## 9. Auditing

Hermit's privacy properties should be verified against actual code paths.

Audits should identify:

1. every model request
2. every external service contacted by Hermit itself
3. every background network request
4. telemetry and analytics behavior
5. crash-reporting behavior
6. account and synchronization behavior
7. remote storage
8. automatic update behavior
9. remote model discovery
10. any feature capable of transmitting agent context or local data

Documentation alone should not be treated as proof of privacy behavior.

## 10. Verification

Hermit should eventually provide tests that verify:

- local inference communicates only with the configured local inference server
- local inference never triggers remote model requests
- remote providers communicate directly with the configured endpoint
- provider fallback cannot occur silently
- disabling telemetry and hosted functionality actually prevents those network requests
- sensitive context is not transmitted through unrelated background services

Network inspection may be used in automated tests to detect unexpected destinations.

## 11. User experience

The current inference trust boundary should be obvious.

For example:

```text
Model: Qwen3-Coder
Inference: LOCAL
Endpoint: localhost:8080
```

or:

```text
Model: ...
Inference: THIRD PARTY
Provider: Fireworks
```

Users should not need to inspect configuration files to determine whether their model context is leaving the machine.

## 12. Future privacy modes

Hermit may eventually provide simple privacy presets.

For example:

### 12.1 — Private

- local inference only
- web/tools allowed
- no telemetry
- no hosted Hermit services
- no remote model fallback

### 12.2 — Trusted infrastructure

- local or user-controlled inference
- web/tools allowed
- no third-party inference
- no telemetry

### 12.3 — External inference

- explicitly configured third-party inference permitted
- clear indication that model context crosses a third-party trust boundary

These should describe data trust boundaries rather than simply whether networking is enabled.

## 13. Security boundary

Hermit should distinguish between two claims.

### 13.1 — Application guarantee

Hermit can guarantee that it does not intentionally transmit agent context or local data through undocumented application-level channels.

This includes telemetry, hosted services, hidden inference calls, and provider fallback.

### 13.2 — Agent capability

If an agent is given unrestricted shell and internet access, it may itself execute operations that transmit data.

That is a separate security problem and should not be obscured by the application's privacy claims.

Future tool-egress controls may strengthen this boundary.

## 14. Design principle

Hermit's privacy model is based on **explicit egress**.

The objective is not:

> Hermit cannot access the internet.

The objective is:

> **Hermit makes it clear where private data can go, prevents hidden or unintended model and application egress, and gives the user explicit control over the systems trusted with their context.**

Local inference should mean that model context stays local.

Remote inference should be an explicit trust decision.

Ordinary web access should remain available without quietly converting the agent into a cloud service.

## 15. Acceptance contract

This is the testable statement of the model above. Implementation plans and verification tests are evaluated against it.

In local mode, all Hermit-managed inference, including background inference, uses approved local endpoints. Hermit does not upload context through telemetry or hosted application services. Network tools can transmit their arguments and other data under the configured tool permissions.

Remote inference must be deliberate and self-controlled: the user selects and authorizes the endpoint and supplies credentials directly. Self-controlled means the user controls provider selection, endpoint, credentials, and authorization; it does not require owning the remote hardware. Hermit does not introduce a hosted routing or configuration service.

This contract covers primary inference, titles, compaction, subagents, agent generation, and every other Hermit-managed model call.

Local inference does not guarantee that network tools cannot disclose private information. Tool-egress enforcement is a separate feature.

Installed plugins and inference servers are trusted executable components. Hermit cannot guarantee that they do not forward data.
