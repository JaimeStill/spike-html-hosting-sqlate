# spike-html-hosting-sqlate

A Pages project site of spike-html-hosting, a `code` project managed with the marathon workflow.
Its goal lives in the coordinator's roadmap, `standards-lab/context/roadmap.toml`, under
`experiment.html.spike-html-hosting`, whose record is in spike-html-hosting.

- [`context/README.md`](context/README.md): the working context.
- [`STANDARDS.md`](STANDARDS.md): the judgement calls the standards-reviewer applies.
- `mise run install`: install the pinned tools, node_modules, and the quick-start program's Go
  modules.
- `mise run check`: the check from spike-html-hosting-sdk's template, which runs the leftover
  lint, the content check, and, on the build, the SDK's shell checks, its palette check, a crawl
  of every page, and the capture run. It adds the site's own checks: the revised quick-start
  against its `revised` record in `content.json`, the guide's files against `quick-start/`, each
  recording against its input hash, `test:program` (go vet, go test, and sqlint over
  `quick-start/`), and each recording placed under its step.
- `mise run screenshots`: capture every page, light and dark, at 390px, 1120px, and 1376px, and
  the index with Help open and with Settings open. `--page <name>` captures one page and can be
  given more than once; spike-html-hosting's `context/README.md`, "Taking captures", lists the
  other flags.
- `mise run currency`: report every pin behind its latest.
- `mise run tapes`: render the quick-start's recordings whose inputs changed, with
  `mise.tapes.toml`'s tools and PostgreSQL in Docker. It reads the network, isn't part of the
  check, and never runs in CI. [`tapes/README.md`](tapes/README.md) holds the practices every
  tape follows.
- `content/docs/quick-start.md` is revised in place, not a byte-for-byte copy of sqlate's;
  `quick-start/` holds the program it builds. The README's "The revised quick-start" describes
  both.
- The sqlate stand-in's site: https://jaimestill.github.io/spike-html-hosting-sqlate/.
  `.github/workflows/pages.yml` deploys it on each push to main.
