# spike-html-hosting-sqlate

spike-html-hosting-sqlate is the sqlate stand-in's Pages project site in spike-html-hosting. Its
build renders sqlate's README and docs/ guide from their Markdown. This context records only
working knowledge the code does not express.

- `content/` holds byte-for-byte copies of sqlate's README.md and docs/ at v0.6.1, and
  `content.json` records the repository, the commit the tag points to (f2b2117), and each file's
  git blob hash. STANDARDS.md records this exception to the per-file provenance line.
- `content/docs/quick-start.md` is the one exception to byte for byte: the site revises it in
  place, and `content.json`'s `revised` entry names its original, blob 0c54507 at f2b2117. The
  revision goes to sqlate at the intake, so the Markdown holds no site markup; the build adds the
  revision note and the five recordings. The README's "The revised quick-start" describes the
  program and the recordings.
- The shared files come from spike-html-hosting-sdk by tag. The site was scaffolded at v0.1.0
  and pins v0.6.1. It keeps pace by bumping the tag in `package.json` and in both workflows'
  `uses:` lines. The v0.6.1 shell loads spike-html-hosting-components at v0.5.0, and its glyphs
  come from spike-html-hosting-icons at v0.1.0, the tags the template names.
- The renderer, the stylesheet, the shell and browser checks, the capture run, the content check,
  the ESLint, Prettier, and tsconfig bases, and the currency bin are the SDK's exports, so a tag
  bump moves them.
- Each template file the site holds is its own copy, marked `From|Adapted from
  spike-html-hosting-sdk (<tag>): template/<path>`, where the tag is the release whose content the
  file carries. The site takes a file again when an SDK release's GitHub release notes name it.
  The release workflow builds those notes from the SDK's CHANGELOG, which a tag's tree doesn't
  carry, since the tree holds only the packed files.
- The site adapts three template files: `index.html`, its title and text this site's;
  `vite.config.ts`, its `external` the source's LICENSE, which the copied README links; and
  `.gitignore`, with marathon's working files.
- The browser test runs the SDK's palette check, `highlightsEachPalette`, on the index, which
  holds highlighted code.
