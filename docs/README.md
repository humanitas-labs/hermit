# Hermit Documentation

| Document             | Purpose                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `privacy-model.md`   | The privacy architecture: inference boundary, application egress, tool egress, and what counts as a privacy failure.                                        |
| `fork.md`            | How Hermit relates to upstream OpenCode and how divergence is managed.                                                                                      |
| `upstream.md`        | Review log of upstream commits and record of ported changes.                                                                                                |
| `session-runtime.md` | Design of the V2 session runtime: System Context, Session History, Context Epochs.                                                                          |
| `specs/`             | Inherited design specs for the V2 core, storage layer, TUI package, and test-suite performance work.                                                        |
| `strip-treemap.html` | Treemap of the repository at the fork point, sized by source lines, files, or bytes. Hatched red is what Hermit deleted. Self-contained; open in a browser. |
| `strip-treemap.png`  | Static render of the treemap for sharing. Regenerate with the command in `.plan/13-strip.md` section 13.                                                    |

Working plans for the fork live in `.plan/` at the repository root. Agent instructions are in `AGENTS.md`.
