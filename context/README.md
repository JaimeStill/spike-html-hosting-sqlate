# spike-html-hosting-sqlate

spike-html-hosting-sqlate is the sqlate stand-in's Pages project site in spike-html-hosting. Its
build renders sqlate's README and docs/ guide from their Markdown. This context records only
working knowledge the code does not express.

- `content/` holds byte-for-byte copies of sqlate's README.md and docs/ at v0.6.1, and
  `content.json` records the repository, the commit the tag points to (f2b2117), and each file's
  git blob hash. STANDARDS.md records this exception to the per-file provenance line.
- spike-html-hosting-architecture owns the content renderer, `markdown-pages.ts`, its tests, and
  the files that build Markdown pages: `index.html`, `vite.config.ts`, `mise.toml`,
  `tsconfig.json`, and `test/browser/site.test.ts`. This site copies them, with its own title and
  text in `index.html`: a change there is copied here by hand.
- spike-html-hosting-architecture owns the site layout, `site.css`, and this site copies it
  unchanged: a change there is copied here by hand.
- spike-html-hosting-architecture owns the screenshot files, `scripts/screenshots.config.ts`,
  `test/browser/support/served.ts`, `test/browser/screenshots.test.ts`, and `tsconfig.test.json`,
  and this site copies them unchanged: a change there is copied here by hand.
- spike-html-hosting owns the remaining build, check, and deploy files, and this site copies them
  unchanged: a change there is copied here by hand.
- The planned `template` task moves the shared files into a site SDK released by tag.
