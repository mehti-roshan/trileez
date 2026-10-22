#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -n "${DOTNET:-}" ]]; then
  DOTNET_BIN="$DOTNET"
elif command -v dotnet >/dev/null 2>&1; then
  DOTNET_BIN="$(command -v dotnet)"
elif [[ -x "$HOME/.dotnet/dotnet" ]]; then
  DOTNET_BIN="$HOME/.dotnet/dotnet"
else
  echo "dotnet SDK 8 was not found. Install it, then set DOTNET to the executable." >&2
  echo "  curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0" >&2
  echo "  export DOTNET=\"\$HOME/.dotnet/dotnet\"" >&2
  echo "  export PATH=\"\$HOME/.dotnet:\$PATH\"" >&2
  echo "  export DOTNET_ROOT=\"\$HOME/.dotnet\"" >&2
  exit 127
fi
DOTNET_ROOT_DIR="$(cd "$(dirname "$DOTNET_BIN")" && pwd)"
export DOTNET_ROOT="${DOTNET_ROOT:-$DOTNET_ROOT_DIR}"
export PATH="$DOTNET_ROOT_DIR:$PATH"

CONFIGURATION="${CONFIGURATION:-Release}"
SLN="$ROOT/Trilez.Agent.sln"
AVALONIA="$ROOT/src/Trilez.Agent.Avalonia/Trilez.Agent.Avalonia.csproj"
CORE="$ROOT/src/Trilez.Agent.Core/Trilez.Agent.Core.csproj"

usage() {
  cat <<'EOF'
Usage: scripts/linux/dev.sh <command>

Commands:
  restore       Restore Trilez.Agent.sln
  build-core    Build the shared core
  build         Build the solution for this Linux machine
  test          Run unit and presentation tests
  run           Launch the Avalonia employee desktop
  publish-win   Publish the Avalonia app for win-x64 (compile only; not a Windows runtime test)
  check-deps    Fail if the Linux Avalonia build references WPF
  all           restore, build, test, check-deps

Environment:
  DOTNET          Path to the dotnet executable
  CONFIGURATION   Debug or Release (default Release)
  TRILEZ_API_BASE Optional API origin shown after you type it in the login form
EOF
}

restore() {
  # HTTP/2 package downloads from nuget.org have timed out on this Linux host.
  DOTNET_SYSTEM_NET_HTTP_SOCKETSHTTPHANDLER_HTTP2SUPPORT="${DOTNET_SYSTEM_NET_HTTP_SOCKETSHTTPHANDLER_HTTP2SUPPORT:-false}" \
    "$DOTNET_BIN" restore "$SLN"
}

build_core() {
  "$DOTNET_BIN" build "$CORE" -c "$CONFIGURATION" --nologo
}

build() {
  "$DOTNET_BIN" build "$SLN" -c "$CONFIGURATION" --nologo
}

test() {
  "$DOTNET_BIN" test "$SLN" -c "$CONFIGURATION" --nologo --logger "console;verbosity=minimal"
}

run() {
  "$DOTNET_BIN" run --project "$AVALONIA" -c "$CONFIGURATION" --no-build
}

publish_win() {
  "$DOTNET_BIN" publish "$AVALONIA" -c "$CONFIGURATION" -r win-x64 --self-contained false --nologo
}

check_deps() {
  local deps
  deps="$(find "$ROOT/src/Trilez.Agent.Avalonia/bin/$CONFIGURATION/net8.0" -name 'Trilez.Agent.Avalonia.deps.json' ! -path '*/win-*/*' | head -n 1)"
  if [[ -z "$deps" ]]; then
    echo "Linux Avalonia deps.json was not found. Build first." >&2
    exit 1
  fi
  if grep -E '"PresentationFramework"|"PresentationCore"|"WindowsBase"|"System.Windows.Forms"' "$deps" >/dev/null; then
    echo "Linux Avalonia build unexpectedly references WPF or Windows Forms: $deps" >&2
    exit 1
  fi
  echo "Linux Avalonia deps.json has no WPF references: $deps"
}

cmd="${1:-}"
case "$cmd" in
  restore) restore ;;
  build-core) build_core ;;
  build) build ;;
  test) test ;;
  run) run ;;
  publish-win) publish_win ;;
  check-deps) check_deps ;;
  all) restore; build_core; build; test; check_deps ;;
  -h|--help|help|"") usage ;;
  *) echo "Unknown command: $cmd" >&2; usage; exit 2 ;;
esac
