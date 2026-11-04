# spike-html-hosting-sqlate

spike-html-hosting-sqlate is the sqlate stand-in's Pages project site in spike-html-hosting. Its
build renders sqlate's README and docs/ guide from their Markdown. This context records only
working knowledge the code does not express.

- `content/` holds byte-for-byte copies of sqlate's README.md and docs/ at v0.6.1, and
  `content.json` records the repository, the commit the tag points to (f2b2117), and each file's
  git blob hash. STANDARDS.md records this exception to the per-file provenance line.
- The shared files come from spike-html-hosting-sdk by tag; the site was scaffolded at v0.1.0
  and keeps pace by bumping the tag, in `package.json` and both workflows' `uses:` lines. The
  renderer, the stylesheet, the shell and browser checks, the capture run, the content check, the
  ESLint, Prettier, and tsconfig bases, and the currency bin are the SDK's exports; the template's
  files, each marked `From|Adapted from spike-html-hosting-sdk (v0.1.0): template/<path>`, are the
  site's own copies to take again when a release's CHANGELOG names them.
- The site adapts three template files: `index.html`, its title and text this site's;
  `vite.config.ts`, its `external` the source's LICENSE, which the copied README links; and
  `.gitignore`, with marathon's working files.
