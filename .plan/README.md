# Hermit Plan

This folder holds the audit of upstream OpenCode and the per-region implementation plans for turning it into Hermit. It is the coordination surface for humans and coding agents working on the fork.

## Acceptance contract

Every plan in this folder is evaluated against this contract. It uses the same wording as `docs/privacy-model.md` section 15.

In local mode, all Hermit-managed inference, including background inference, uses approved local endpoints. Hermit does not upload context through telemetry or hosted application services. Network tools can transmit their arguments and other data under the configured tool permissions.

Remote inference must be deliberate and self-controlled: the user selects and authorizes the endpoint and supplies credentials directly. Self-controlled means the user controls provider selection, endpoint, credentials, and authorization; it does not require owning the remote hardware, so a directly configured third-party API such as Fireworks qualifies. Hermit does not introduce a hosted routing or configuration service.

This contract covers primary inference, titles, compaction, subagents, agent generation, and every other Hermit-managed model call.

Local inference does not guarantee that network tools cannot disclose private information. Tool-egress enforcement is outside this phase.

Installed plugins and inference servers are trusted executable components. Hermit cannot guarantee that they do not forward data.

## 1. Files

| File | Purpose |
|---|---|
| `00-audit.md` | The full audit: architecture map, inference paths, every outbound network surface, categorization, risks, and the proposed sequence. Read this first. |
| `01-catalog-providers.md` | Model catalog (models.dev), provider registry, OpenCode Zen autoload, provider allowlist, request headers. |
| `02-accounts-remote-config.md` | OpenCode console accounts, console-pushed config, well-known remote config, V2 opencode integration. |
| `03-share.md` | Session sharing transport. |
| `04-update-install.md` | Update check, silent self-upgrade, install script. |
| `05-plugins-npm.md` | Runtime npm installs: bootstrap `@opencode-ai/plugin`, config plugins, built-in auth plugins. |
| `06-tools-search.md` | `websearch` made explicit config with no session metadata; `webfetch` User-Agent; tools otherwise preserved. |
| `07-binaries-lsp.md` | Bundle ripgrep; make the LSP download flag cover npm servers; log downloads. |
| `08-server-ui.md` | Local HTTP server, `app.opencode.ai` UI proxy, mDNS, GitHub command. |
| `09-telemetry-headers.md` | OTLP export, AI SDK telemetry, identifying headers sent to providers. |
| `10-inference-boundary.md` | Inference policy: inventory of every Hermit-managed model call path, per-request endpoint classification (local, user-controlled, third party), fail-closed destination check, policy ownership, presets, visible trust class in the TUI. |
| `11-verification.md` | Network-inspection test harness that verifies the acceptance contract across the supported execution paths and records coverage and limitations; optional strict deployment docs. |
| `12-branding.md` | Rename to Hermit: binary, config paths, default theme, docs. |
| `13-strip.md` | Delete everything that is not the agent: hosted services, marketing, packaging, ops, and optionally the web UI stack. Runs first. |

## 2. Status legend

Each plan file carries a status line: `not started`, `in progress`, `done`, or `blocked`. Update it when work begins and when it lands.

## 3. Rules for agents executing a plan

1. One plan file per agent per task. Do not edit files owned by another region without noting it in that region's plan first.
2. Every plan lists the exact files it owns. Stay inside them. If a change is needed outside, stop and record it in the plan under "Cross-region notes".
3. Prefer deletion of a code path over a flag. Prefer a flag over a rewrite. Never add an abstraction to remove a feature.
4. Do not change behavior the plan classifies as "preserve".
5. Run `bun typecheck` from `packages/opencode` (and `packages/core` when core changed) before reporting done. Run the package tests listed in the plan.
6. Record every meaningful divergence from upstream in the plan's "Divergence log" table with file paths. That table is the source for `docs/upstream.md` section 4 later.
7. Commit messages follow the conventional format in `AGENTS.md`, with scope `hermit` for privacy changes, for example `chore(hermit): remove console account login`.

## 4. Execution order

Each step leaves a typechecking, runnable binary. See `00-audit.md` section 9 for the per-region order inside each phase.

0. Strip the repository (`13`). Done: Tier 1 in `1397b1cc7e`, Tier 2 in `2f433b5612`. Line references in `00`-`12` are anchored at upstream `adee738d1e` inside `packages/opencode`, `core`, `tui`, and `plugin`, which the strip did not touch. The only privacy item the strip already landed is `08` V1 and V5.
1. Finalize the acceptance contract above and the inference-path inventory in `10` section 3.0.
2. Build the verification harness in `11` and record the baseline failures against the stripped but otherwise unmodified binary.
3. Implement the inference policy (`10`) and remove implicit application egress (`01`-`09`), adding a passing harness assertion as each region lands.
4. Verify the complete supported execution matrix in `11`.
5. Finish branding (`12`) and the optional surface-area reductions marked as such in `04`, `08`, and `13` Tier 3.

Keep privacy-required changes and discretionary feature removal in separate commits. Removal of the explicit `upgrade` command body, mDNS, and remote-workspace plumbing is discretionary: it stays in the plans but lands in phase 5, and is skipped if no concrete privacy dependency requires it.

Unauthorized inference or application egress violates the contract. Tool egress follows the separately documented permissions model in `docs/privacy-model.md` section 7 and is not a contract failure.
