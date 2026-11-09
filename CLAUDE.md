# spike-html-hosting-sqlate

A Pages project site of spike-html-hosting, a `code` project managed with the marathon workflow.
Its goal lives in the coordinator's roadmap, `standards-lab/context/roadmap.toml`, under
`experiment.html.spike-html-hosting`, whose record is in spike-html-hosting.

- [`context/README.md`](context/README.md): the working context.
- [`STANDARDS.md`](STANDARDS.md): the judgement calls the standards-reviewer applies.
- `mise run install`: install the pinned tools and node_modules.
- `mise run check`: the check from spike-html-hosting-sdk's template, which runs the leftover
  lint, the content check, and, on the build, the SDK's shell checks, its palette check, a crawl
  of every page, and the capture run.
- `mise run screenshots`: capture every page, light and dark, at 390px, 1120px, and 1376px, and
  the index with Help open and with Settings open. `--page <name>` captures one page and can be
  given more than once; spike-html-hosting's `context/README.md`, "Taking captures", lists the
  other flags.
- `mise run currency`: report every pin behind its latest.
- The sqlate stand-in's site: https://jaimestill.github.io/spike-html-hosting-sqlate/.
  `.github/workflows/pages.yml` deploys it on each push to main.
