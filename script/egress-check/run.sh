#!/usr/bin/env bash
# Egress verification: build the binary, run the scenarios in
# .plan/11-verification.md under a recording proxy plus an OS isolation layer,
# and assert every recorded destination against allowlist.json.
#
# Usage: script/egress-check/run.sh [--skip-build] [--only S1,S2] [--binary PATH] [--out DIR] [--idle SECONDS] [--isolation MODE]
#
# Isolation: macOS uses sandbox-exec (non-loopback outbound and the system
# resolver denied; denials read from the unified log). Linux re-executes itself
# inside `unshare -rnm`, routes every address to loopback, and installs a
# recording resolver, so nothing can leave the namespace and every attempt is
# recorded. `--isolation none` runs without the OS layer; the bypass fixture
# (S0) then fails by design because the harness cannot see proxy bypasses.
#
# Requires: bun matching the root package.json `packageManager` (set BUN to a
# specific binary), openssl, python3, git. Linux also needs util-linux
# `unshare` and iproute2.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BUN="${BUN:-bun}"
SKIP_BUILD=0
ARGS=()
BINARY=""
OUT="$HERE/results"
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --binary) BINARY="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --only|--idle|--isolation) ARGS+=("$1" "$2"); shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) TARGET=opencode-darwin-arm64 ;;
  Darwin-x86_64) TARGET=opencode-darwin-x64 ;;
  Linux-aarch64) TARGET=opencode-linux-arm64 ;;
  Linux-x86_64) TARGET=opencode-linux-x64 ;;
  *) echo "unsupported platform" >&2; exit 2 ;;
esac
[ -n "$BINARY" ] || BINARY="$ROOT/packages/opencode/dist/$TARGET/bin/opencode"

if [ "$SKIP_BUILD" = 0 ]; then
  # packages/script/src/index.ts reads .github/TEAM_MEMBERS at import time and
  # resolves the version from npm unless OPENCODE_VERSION is set; the strip
  # removed the file (see plan 11 cross-region notes). Stub it for the build only.
  STUB=0
  if [ ! -f "$ROOT/.github/TEAM_MEMBERS" ]; then
    mkdir -p "$ROOT/.github"
    : > "$ROOT/.github/TEAM_MEMBERS"
    STUB=1
  fi
  (
    cd "$ROOT/packages/opencode"
    PATH="$(dirname "$(command -v "$BUN")"):$PATH" OPENCODE_CHANNEL="${OPENCODE_CHANNEL:-egress}" OPENCODE_VERSION="${OPENCODE_VERSION:-0.0.0-egress}" \
      "$BUN" run script/build.ts --single --skip-install
  ) || { [ "$STUB" = 0 ] || rm -f "$ROOT/.github/TEAM_MEMBERS"; exit 1; }
  [ "$STUB" = 0 ] || rm -f "$ROOT/.github/TEAM_MEMBERS"
fi
[ -x "$BINARY" ] || { echo "binary not found: $BINARY" >&2; exit 2; }

HARNESS=("$BUN" "$HERE/harness.ts" --binary "$BINARY" --out "$OUT" "${ARGS[@]+"${ARGS[@]}"}")

if [ "$(uname -s)" = Linux ] && [ "${EGRESS_IN_NETNS:-0}" = 0 ] && ! printf '%s\n' "${ARGS[@]+"${ARGS[@]}"}" | grep -q '^none$\|^sandbox-exec$'; then
  if ! command -v unshare >/dev/null; then
    echo "unshare not found; running without namespace isolation (S0 will fail)" >&2
    exec "${HARNESS[@]}" --isolation none
  fi
  RESOLV="$(mktemp)"
  echo "nameserver 127.0.0.1" > "$RESOLV"
  # Inside the namespace: loopback up, every address local (so any-IP connects
  # reach the sink), and the resolver pointed at the recording DNS on :53.
  exec unshare -rnm bash -c '
    set -e
    ip link set lo up
    ip route add local 0.0.0.0/0 dev lo
    ip -6 route add local ::/0 dev lo 2>/dev/null || true
    mount --bind "$1" /etc/resolv.conf
    shift
    export EGRESS_IN_NETNS=1
    exec "$@" --isolation netns
  ' _ "$RESOLV" "${HARNESS[@]}"
fi

exec "${HARNESS[@]}"
