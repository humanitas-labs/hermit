# 12 Branding and Scaffolding

**Status:** in progress (docs and `docs/privacy-model.md` landed; code untouched)

## 1. Goal

The product is called Hermit everywhere a user sees it, with the minimum code churn. Internal package names and module identifiers stay as upstream to keep ports cheap.

## 2. Done

- `README.md`, `docs/fork.md`, `docs/upstream.md`, `AGENTS.md` (Hermit instructions plus inherited conventions), `docs/hermit.png`.
- Translated READMEs and `screenshot-uk.png` removed.

## 3. Changes

| Id | Change | Notes |
|---|---|---|
| N1 | Binary name `hermit`: `packages/opencode/package.json` `bin`, `script/build.ts` output name, `install` script. | Keep the npm package scope decision open; not publishing yet. |
| N2 | Config file and directories: `hermit.json`/`hermit.jsonc`, `~/.config/hermit`, `$XDG_DATA_HOME/hermit`, `$XDG_CACHE_HOME/hermit`, `.hermit/` project dir. Single change in `packages/core/src/global.ts` and `packages/opencode/src/config/paths.ts` (or equivalent); grep for the literal `"opencode"` in path code. Keep reading `opencode.json` as a fallback for one release, or do not; recommendation: no fallback, clean break. | Env var prefix stays `OPENCODE_` internally until the flag set is finalized in `01`-`10`, then rename the survivors to `HERMIT_` in one commit. |
| N3 | `$schema` URL in generated configs: point to a checked-in `schema/hermit.json` path or remove the key. | Never a remote URL. |
| N4 | TUI title, logo (`cli/logo.ts`), docs links (`tui/src/app.tsx:824`), help text. | |
| N5 | Superseded by `13-strip.md`, which deletes the non-shipped packages in its Tier 1. | |
| N6 | `SECURITY.md` and `LICENSE` attribution (`CONTRIBUTING.md` is deleted by `13`) note for OpenCode and for bundled ripgrep. | |
| N7 | Default theme `hermit`: blacked-out backgrounds with the crab orange from `docs/hermit.png` as the primary accent and the shell tan as secondary. Add `packages/tui/src/theme/assets/hermit.json` following the `opencode.json` structure (`defs` plus `theme` with dark and light variants), import it in `packages/tui/src/theme/index.ts`, and change the three `"opencode"` defaults in `packages/tui/src/context/theme.tsx` (:96, :121-122, :143, :162, :177, :266) to `"hermit"`. Keep `opencode.json` available as a selectable theme. Starting palette, dark variant: background `#000000`, panel `#0a0a0a`, element `#141414`, menu `#1a1a1a`, borders `#262626` / `#3a3a3a`, text `#ececec`, muted `#8a8a8a`, primary `#f2773a` (crab orange, sampled from the claws), accent `#ffa46b` (highlight orange), secondary `#d9b48f` (shell tan), success `#7fd88f`, warning `#f5a742`, error `#e06c75`, info `#d9b48f`, diff added/removed keep upstream values. Light variant: white base with the same orange and tan darkened for contrast. Sample the exact orange from the PNG before finalizing. | |

## 4. Not renamed

- Workspace package names `@opencode-ai/*`, module namespaces, Effect service tags, SQL table names, event names. These are internal, and renaming them turns every future upstream port into a conflict.

## 5. Divergence log

| Upstream file | Change | Reason |
|---|---|---|
