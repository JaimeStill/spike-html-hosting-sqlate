#!/usr/bin/env bash
# Fails naming mise run install when a tool a task needs is missing: the node_modules tooling, and
# typescript-go's tsc, the pinned mise tool; and with `browser`, the pinned chrome-headless-shell.
# Adapted from spike-html-apps-foundation (d5037b4): scripts/preflight.sh, without the browser
# check.
# Adapted from spike-html-apps-foundation (d5037b4): scripts/preflight.sh, with vite among the
# node_modules tooling.
# From spike-html-hosting (cb0511c): scripts/preflight.sh.
# Adapted from spike-html-hosting-components (0f64672): scripts/preflight.sh, with eslint and tsc.
# Adapted from spike-html-hosting-architecture (8b97a7c): scripts/preflight.sh, its vite and its
# browser check.
# From spike-html-hosting-sdk (v0.1.0): template/scripts/preflight.sh, which runs before
# node_modules exists, so the site holds its own copy rather than the package's.
set -euo pipefail

fail() {
  echo "preflight: $1 isn't installed; run mise run install" >&2
  exit 1
}

for bin in eslint prettier vite spike-html-apps-screenshots; do
  [[ -x node_modules/.bin/$bin ]] || fail "$bin (devDependencies)"
done
mise which tsc > /dev/null 2>&1 || fail "tsc (typescript-go, mise.toml)"

[[ "${1:-}" == browser ]] || exit 0
shell=$(mise which chrome-headless-shell 2>/dev/null) || fail "chrome-headless-shell"
# mise caches downloads by checksum: a version bumped without its sha256 installs the old build.
pin=$(mise current http:chrome-headless-shell)
if [[ "$("$shell" --version)" != *" $pin" ]]; then
  echo "preflight: $shell isn't chrome-headless-shell $pin; give the pin its own sha256" >&2
  exit 1
fi
