# Hermit Fork Policy

This document defines how Hermit relates to upstream OpenCode and how intentional divergence should be managed.

## 1. Philosophy

Hermit is intentionally not a continuously synchronized distribution of OpenCode.

OpenCode is treated as a valuable upstream source of engineering work, including:

- bug fixes
- model compatibility fixes
- tool-calling improvements
- performance improvements
- security fixes
- context-management improvements
- useful architectural ideas

Hermit selectively adopts upstream work when it advances Hermit's goals.

Upstream changes are not inherently desirable simply because they are newer.

## 2. Priorities

When priorities conflict, Hermit generally favors:

1. Privacy and auditability
2. Reliable model and tool execution
3. Local inference
4. Explicit data-egress boundaries
5. Security
6. Architectural simplicity
7. Maintainability
8. Performance
9. New features

Feature parity with OpenCode is not a project objective.

Local inference should not be confused with offline operation. Hermit may retain web and network-capable tools while keeping model context local.

## 3. Upstream review

### 3.1 — Periodic review

OpenCode releases and commits should be reviewed periodically.

The purpose of this review is to identify useful engineering work, not to synchronize Hermit with upstream.

The last reviewed upstream commit must be recorded in `docs/upstream.md`.

### 3.2 — Changes worth adopting

Give particular attention to upstream changes involving:

- model compatibility
- tool calling
- agent reliability
- context management and compaction
- editing and patching
- shell execution
- filesystem operations
- web and network tools
- performance
- security
- llama.cpp
- supported remote inference providers
- important dependency fixes

### 3.3 — Changes generally not relevant

Changes primarily involving the following should normally be ignored unless they provide some independent value to Hermit:

- accounts
- hosted OpenCode services
- telemetry or analytics
- cloud synchronization
- sharing
- social functionality
- unnecessary integrations
- implicit remote inference
- unrelated UI complexity

## 4. Adopting upstream work

### 4.1 — Selective adoption

Do not automatically merge upstream releases.

When useful upstream work is identified, prefer:

1. cherry-picking the relevant commit when clean and appropriate
2. porting the smallest relevant portion of the change
3. independently implementing the same fix when upstream implementation would introduce unwanted dependencies or egress paths

Avoid importing unrelated upstream functionality merely because it appears in the same release.

### 4.2 — Provenance

Meaningful upstream ports should record:

- upstream commit or PR
- purpose of the change
- Hermit commit implementing or importing it
- any meaningful differences from upstream

Record this information in `docs/upstream.md`.

## 5. Managing divergence

### 5.1 — Necessary divergence

Divergence from OpenCode is acceptable when it materially improves:

- privacy
- auditability
- explicit control over data egress
- security
- simplicity
- local inference
- core agent reliability

Hermit should not avoid a valuable architectural decision merely to make future upstream merges easier.

### 5.2 — Unnecessary divergence

Before significantly modifying inherited OpenCode code, consider:

1. Is this change necessary for Hermit's goals?
2. Does upstream already solve the problem adequately?
3. Can the same result be achieved with a smaller change?
4. Does the change make useful upstream fixes unnecessarily difficult to port?
5. Is the change architectural, or merely stylistic?

Avoid divergence based solely on stylistic preference or unnecessary refactoring.

## 6. Privacy boundary

Hermit's objective is not to eliminate networking.

Web search, Git, package registries, documentation, APIs, and other network resources may remain useful parts of the agent.

The architectural requirement is that private agent context must not cross an inference or application trust boundary implicitly.

In particular:

- local inference must not silently fall back to remote inference
- hidden secondary model calls should not exist
- telemetry should not carry private context
- hosted services should not receive workspace or session data implicitly
- remote inference should always be explicitly configured

See `docs/privacy-model.md` for the complete model.

## 7. Ownership boundary

Hermit should own as little infrastructure as necessary.

Where OpenCode already provides reliable implementations of generic coding-agent functionality, Hermit should generally preserve them unless there is a concrete reason not to.

The core value of Hermit is its privacy model, constrained surface area, and explicit control over inference and data egress, not rewriting commodity agent infrastructure.

## 8. Guiding principle

OpenCode is upstream, not the roadmap.

Hermit should periodically mine upstream for valuable engineering work while retaining independent control over its architecture, privacy model, feature surface, and direction.
