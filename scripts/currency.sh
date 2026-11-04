#!/usr/bin/env bash
# The currency command, outside the check: reports every mise.toml pin, package.json pin, and
# workflow action pin that trails its latest release, as `<file>: ITEM PIN -> LATEST`, one line
# each, and exits nonzero when it reports any; with everything current it prints nothing and exits
# 0. It reads the network and writes nothing. Run it through `mise run currency`.
#
# A package.json pin is a version, compared against the registry's latest, or a github: tag,
# github:<owner>/<repo>#vX.Y.Z (the foundation and the tooling), compared against the repository's
# highest vX.Y.Z tag in `git ls-remote --tags`, which neither the registry nor `pnpm outdated`
# knows; an action pin, <owner>/<repo>[/path]@vX.Y.Z, is compared the same way. A tag trails only
# when that tag is strictly higher: a repository with no such tag, or whose highest is below the
# pin, has an unreleased pin rather than a trailing one. A pin in any other form is reported as one
# this script can't compare, so none is skipped silently.
# Adapted from spike-html-apps (529ec52): scripts/currency.sh, without its go.mod scans and its
# consumer template, with the action pins scanned by its github: tag scan; and from
# spike-html-apps-foundation (d5037b4): scripts/currency.sh, its action scan.
# From spike-html-hosting (6f1155d): scripts/currency.sh.
set -euo pipefail

cd "$(dirname "$0")/.."

stale=0
report() {
  echo "$1"
  stale=1
}

# mise outdated reads each tool's latest, http:chrome-headless-shell's from its version_list_url.
# Errors only: mise warns on every run that npm's GitHub release has no assets as it falls back to
# another source for npm's latest, which would break the silence of a current tree. JSON is read
# with node, a mise pin, not jq.
outdated=$(MISE_LOG_LEVEL=error mise outdated --bump --local --json)
lines=$(node -e '
  const out = JSON.parse(process.argv[1]);
  for (const [tool, v] of Object.entries(out)) console.log(tool + " " + v.requested + " -> " + v.bump);
' "$outdated")
while read -r line; do
  [[ -z "$line" ]] || report "mise.toml: $line"
done <<<"$lines"

# behind A B: whether version A sorts strictly below version B, by version sort.
behind() {
  [[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n 1)" == "$1" ]]
}

# latest_tag OWNER/REPO: sets latest to the repository's highest vX.Y.Z tag, or to nothing if it
# has none; only plain vX.Y.Z tags count. Each repository is listed once; latest_tag sets a
# variable rather than echoing, because a $(...) subshell would drop the cache.
declare -A latest_tags=()
latest_tag() {
  local repo=$1 refs
  if [[ -z "${latest_tags[$repo]+set}" ]]; then
    refs=$(git ls-remote --tags --refs "https://github.com/$repo.git")
    latest_tags[$repo]=$(sed -nE 's#^[0-9a-f]+\trefs/tags/(v[0-9]+\.[0-9]+\.[0-9]+)$#\1#p' <<<"$refs" |
      sort -V | tail -n 1)
  fi
  latest=${latest_tags[$repo]}
}

# tag_behind FILE ITEM REPO PIN: reports the item when its repository has a tag above the pin.
tag_behind() {
  latest_tag "$3"
  if [[ -n "$latest" ]] && behind "$4" "$latest"; then
    report "$1: $2 $4 -> $latest"
  fi
}

# Each package.json pin against its latest: a github: tag against its repository's tags, a version
# against the registry.
pins=$(node -p '
  const { dependencies, devDependencies } = require("./package.json");
  Object.entries({ ...dependencies, ...devDependencies })
    .map(([name, pin]) => name + " " + pin)
    .join("\n")
')
typescript_eslint=$(node -p 'require("./package.json").devDependencies["typescript-eslint"]')
while read -r package pin; do
  [[ -n "$package" ]] || continue
  if [[ $pin =~ ^github:([^#]+)#(v[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    tag_behind package.json "$package" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    continue
  fi
  if [[ ! $pin =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    report "package.json: $package $pin -> can't compare this form of pin"
    continue
  fi
  latest=$(pnpm view "$package" version)
  # typescript is held to the newest version typescript-eslint's peer range accepts.
  if [[ $package == typescript ]]; then
    range=$(pnpm view "typescript-eslint@$typescript_eslint" peerDependencies.typescript)
    accepted=$(pnpm view "typescript@$range" version --json)
    latest=$(node -p '[].concat(JSON.parse(process.argv[1])).join("\n")' "$accepted" |
      sort -V | tail -n 1)
  fi
  [[ $pin == "$latest" ]] || report "package.json: $package $pin -> $latest"
done <<<"$pins"

# Each action a workflow uses, once, against its repository's tags: the repository is the
# action's first two path segments.
uses=$(grep -ho 'uses: *[^ ]*' .github/workflows/*.yml | sed 's/uses: *//' | sort -u)
while read -r action; do
  [[ -n "$action" ]] || continue
  if [[ $action =~ ^([^/@]+/[^/@]+)[^@]*@(v[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    tag_behind .github/workflows "${action%@*}" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
  else
    report ".github/workflows: $action -> can't compare this form of pin"
  fi
done <<<"$uses"

exit "$stale"
