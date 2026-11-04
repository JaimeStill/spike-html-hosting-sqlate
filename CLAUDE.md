# spike-html-hosting-sqlate

A Pages project site of spike-html-hosting, a `code` project managed with the marathon workflow.
Its goal lives in the coordinator's roadmap, `standards-lab/context/roadmap.toml`, under
`experiment.html.spike-html-hosting`, whose record is in spike-html-hosting.

- [`context/README.md`](context/README.md): the working context.
- [`STANDARDS.md`](STANDARDS.md): the judgement calls the standards-reviewer applies.
- `mise run install`: install the pinned tools and node_modules.
- `mise run check`: spike-html-hosting's check, plus the Markdown pages' unit tests and a
  browser crawl of every page.
- `mise run screenshots`: capture every page, light and dark, wide and narrow, and the index
  with its theme menu open. `--page <name>` captures one page and can be given more than once;
  spike-html-hosting's `context/README.md`, "Taking captures", lists the other flags.
- `mise run currency`: report every pin behind its latest.
- The sqlate stand-in's site: https://jaimestill.github.io/spike-html-hosting-sqlate/.
  `.github/workflows/pages.yml` deploys it on each push to main.
