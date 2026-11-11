<!-- Adapted from spike-html-hosting-sdk (v0.6.0): template/README.md, its revised quick-start. -->

# spike-html-hosting-sqlate

The GitHub Pages site of
spike-html-hosting-sqlate,
made from the template of
[spike-html-hosting-sdk](https://github.com/JaimeStill/spike-html-hosting-sdk) v0.6.2.
Each Markdown file copied into `content/` is a page, in `index.html`'s shell, served under
`/spike-html-hosting-sqlate/`.
`content.json` records the copied tree's source: its repository, the commit it was copied at,
and each file's git blob hash.

## The revised quick-start

The site revises one copied file in place, `content/docs/quick-start.md`, so that file is not a
byte-for-byte copy of sqlate's. `content.json`'s `revised` entry names the original's commit and
blob hash, and the revision is proposed to sqlate at the intake. The build opens the page with a
note linking the original (`scripts/revised.ts`).

## Tasks

- `mise run install`: install the pinned tools and node_modules; reads the network.
- `mise run check`: ESLint, with the check that no CSS module script is left in the build;
  Prettier, shellcheck, and actionlint; tsc's type check; the build; the unit tier: the copied
  tree against `content.json` and the revision against its record; and the browser tier, the
  SDK's checks on the build in the pinned chrome-headless-shell, with the revised note on the
  quick-start alone. It reads no network.
- `mise run screenshots`: capture the pages, light and dark, at 390px, 1120px, and 1376px.
- `mise run currency`: every pin behind its latest, the SDK's tag among them.

## Keeping pace with the SDK

The SDK is pinned by its release tag, in `package.json` and in both workflows'
`uses:` lines. To move to a newer release, bump the tag in all three, run `pnpm install`, and run
`mise run check`.
