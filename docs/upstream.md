# Upstream Review Log

This document records Hermit's review and selective adoption of changes from upstream OpenCode.

It is not a changelog of every upstream release.

## 1. Current upstream position

**Upstream repository:** `anomalyco/opencode` (https://github.com/anomalyco/opencode)

**Last reviewed commit:** `adee738d1e4597a2d0d317ca61a1625eff289efa`

**Last reviewed date:** `2026-09-25`

**Hermit baseline:** `adee738d1e4597a2d0d317ca61a1625eff289efa` (upstream `dev`, opencode package version 1.18.32)

Future upstream reviews should begin after the commit recorded above.

## 2. Review classifications

### 2.1 — Adopt

Changes that provide clear value to Hermit and should be ported.

Typical examples include:

- model compatibility fixes
- tool-calling fixes
- agent reliability fixes
- context-management improvements
- security fixes
- important performance improvements

### 2.2 — Consider

Changes that may be useful but do not currently justify additional complexity or divergence.

These can be reconsidered during future work.

### 2.3 — Ignore

Changes that do not align with Hermit's goals or feature surface.

Ignoring a change does not mean the upstream implementation is poor. It means Hermit does not currently need it.

## 3. Review log

### 3.1 — `2026-09-25` baseline

**Range reviewed:** none (fork point)

**OpenCode releases covered:** baseline at 1.18.32

No upstream changes have been reviewed since the fork point. The next review starts at the commit in Section 1.

#### Adopt

| Upstream | Area | Reason | Hermit |
|---|---|---|---|

#### Consider

| Upstream | Area | Reason |
|---|---|---|

#### Ignore

| Upstream | Area | Reason |
|---|---|---|

## 4. Ported upstream changes

This section provides a durable record of significant upstream work incorporated into Hermit.

| Upstream | Hermit | Description | Notes |
|---|---|---|---|

## 5. Review procedure

When performing an upstream review:

1. Start from the `Last reviewed commit` recorded in Section 1.
2. Inspect upstream commits and releases since that point.
3. Focus first on the areas identified in `docs/fork.md`.
4. Classify relevant changes as Adopt, Consider, or Ignore.
5. Port Adopt items selectively rather than merging upstream wholesale.
6. Test adopted changes against Hermit's existing behavior and privacy guarantees.
7. Record meaningful ports in Section 4.
8. Update the `Last reviewed commit` and date only after the review is complete.

The objective is to benefit from upstream engineering without allowing upstream development to implicitly determine Hermit's architecture or roadmap.
