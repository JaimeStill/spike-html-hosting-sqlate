<!-- Adapted from spike-html-hosting-sdk (v0.6.0): template/README.md, its revised quick-start,
     the program, and the recordings. -->

# spike-html-hosting-sqlate

The GitHub Pages site of
spike-html-hosting-sqlate,
made from the template of
[spike-html-hosting-sdk](https://github.com/JaimeStill/spike-html-hosting-sdk) v0.6.1.
Each Markdown file copied into `content/` is a page, in `index.html`'s shell, served under
`/spike-html-hosting-sqlate/`.
`content.json` records the copied tree's source: its repository, the commit it was copied at,
and each file's git blob hash.

## The revised quick-start

The site revises one copied file in place, `content/docs/quick-start.md`, so that file is not a
byte-for-byte copy of sqlate's. `content.json`'s `revised` entry names the original's commit and
blob hash, and the revision is proposed to sqlate at the intake. The build opens the page with a
note linking the original (`scripts/revised.ts`).

- `quick-start/` holds the program the guide builds, as its own Go module. Every file the guide
  writes in full is the program's copy of that file (`scripts/guide.ts`).
- `tapes/` holds five VHS recordings of the program, each a tape, a committed WebM, and a WebP
  poster. The build places each video under the step it shows (`scripts/recordings.ts`).
  [`tapes/README.md`](tapes/README.md) holds the practices every tape follows.

## Tasks

- `mise run install`: install the pinned tools, node_modules, and the program's Go modules; reads
  the network.
- `mise run check`: ESLint, with the check that no CSS module script is left in the build;
  Prettier, shellcheck, and actionlint; tsc's type check; the build; the unit tier: the copied
  tree against `content.json`, the revision against its record, the guide against
  `quick-start/`, and each recording against its input hash; `test:program`: go vet, go test, and
  sqlint over `quick-start/`; and the browser tier, the SDK's checks on the build in the pinned
  chrome-headless-shell, with each recording under its step. It reads no network.
- `mise run screenshots`: capture the pages, light and dark, at 390px, 1120px, and 1376px.
- `mise run currency`: every pin behind its latest, the SDK's tag among them.
- `mise run tapes`: render each recording whose inputs changed, or each one named, with
  `mise.tapes.toml`'s vhs, ttyd, and ffmpeg in the pinned chrome-headless-shell; reads the
  network and runs PostgreSQL in Docker. It isn't part of the check, and CI never runs it.

## Keeping pace with the SDK

The SDK is pinned by its release tag, in `package.json` and in both workflows'
`uses:` lines. To move to a newer release, bump the tag in all three, run `pnpm install`, and run
`mise run check`.
