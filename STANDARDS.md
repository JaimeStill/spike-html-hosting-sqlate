# Standards

The judgement calls the check can't enforce, one line each, for the standards-reviewer. What
`mise run check` enforces is never restated here.

The architecture pages that apply, in the architecture repository:

- `principles/minimal-footprint.md`
- `principles/rolling-currency.md`
- `principles/independent-releases.md`
- `principles/downward-dependencies.md`

## Sites

- A Markdown source stays Markdown; the build renders it, and no hand-written HTML copy of it
  exists.
- HTML is for persistent artifacts; a page that is notes or a guide is Markdown.
- Every link and asset resolves under the site's `/<repo>/` base path; nothing assumes the
  origin root.
- A site resolves the foundation and the documentation components only through their release
  tags, as a consumer does.
- The shared files come from spike-html-hosting-sdk by tag; the site was scaffolded at v0.1.0
  and keeps pace by bumping the tag. No hand copy of a file another site owns is kept.
- A copied file names its source repository and commit, or the SDK's release tag, in a provenance
  line, which reads `From|Adapted from <repo> (<commit>|<tag>): <path>`.
- The copied Markdown tree, `content/`, carries no provenance lines: its files stay byte for byte
  the source's, and `content.json` records the tree's repository, commit, and each file's blob
  hash in their place.

## Design

- spike-html-apps-foundation v0.3.0 is the visual baseline: native elements keep its styling,
  and every profile renders as it does there.
- Focus is always visible, motion honours reduced motion, and spacing comes from the
  foundation's tokens, never a literal.
- A UI task's session brief carries its screenshots per site and profile; the architect's
  acceptance is the design review.
