# 07 Binaries, LSP, Tree-sitter

**Status:** not started (revised for explicit egress)

## 1. Goal

Core tools work without a first-use download. Executable downloads that remain are governed by one flag that actually covers all of them, and are logged when they happen.

## 2. Owned files

- `packages/core/src/ripgrep/binary.ts` lines 94-118
- `packages/opencode/script/build.ts` (bundle `rg`)
- `packages/opencode/src/lsp/server.ts` npm branches (:125,153,340,494,1078,1111,1370,1524,1605,1783)
- `packages/opencode/src/effect/runtime-flags.ts` line 22
- `packages/opencode/src/ide/index.ts` line 40 (dead `code --install-extension`)

## 3. Changes

| Id | Change | Notes |
|---|---|---|
| B1 | Bundle ripgrep: fetch per-target `rg` at build time and embed with `with { type: "file" }` (same pattern as `image.ts:5`). Delete the runtime download. Resolution order: bundled, then PATH. | Add the ripgrep license notice to the repo. |
| B2 | Make `OPENCODE_DISABLE_LSP_DOWNLOAD` gate the ten `Npm.which` LSP branches the same way it gates the direct downloads. | One-line condition per site. Keep the downloads themselves; they are user-visible tooling (class A only because they run without a prompt, no user data). |
| B3 | Log one line before an LSP server, formatter, or grammar download, naming the destination and the reason (which file type triggered it). | Visibility. Harness S14 asserts the log and the absence of context markers. |
| B4 | Tree-sitter: no change beyond B3 logging. Grammar fetches carry no user data and are class T under `docs/privacy-model.md` section 6. Record in the divergence log that this is a known first-use download. | Vendoring can be a later improvement. Downloads stay on by default; turning them off would degrade first run for no privacy gain. |
| B5 | Delete `Ide.install`. | Dead code. |

## 4. Preserve

- LSP client, diagnostics, `lsp` tool, formatter integration.

## 5. Verification

- Binary run on a machine with no `rg` on PATH: grep and glob tools work with no download.
- `OPENCODE_DISABLE_LSP_DOWNLOAD=1` and open a `.py` file with no pyright: no npm install, one log line.

## 6. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
