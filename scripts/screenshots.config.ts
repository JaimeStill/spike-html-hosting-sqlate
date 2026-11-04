// mise run screenshots' capture description, which the tooling's spike-html-apps-screenshots bin
// runs: every page the site builds, one named page each, in the build's order, read from
// content.json's files with markdown-pages.ts's own mapping, each captured whole, in tiles, at a
// wide and a narrow width; the index also with its theme menu open, wide and narrow. A page's
// name is its built path under the base without .html, a directory's index its directory: the
// root's README.md is --page index, a/README.md --page a, and a/b.md --page a/b. The profile's
// facets, palette, space, and type, at flexoki, regular, and mono; --all's profiles, every palette
// at the defaults, then compact and sans at flexoki; the profiles each page registers, from the
// foundation's registry, every built-in one, as the shell loads the full entry. The site is served
// as the browser tier serves it, by Vite's preview under the base (test/browser/support/served.ts),
// so a capture makes the requests the deployed site makes.
// Adapted from spike-html-apps-foundation (d5037b4): scripts/screenshots.config.ts, its theme
// menu's open step, viewports, facets, --all, and registry read.
// Adapted from spike-html-apps-components (19d4f59): scripts/screenshots.config.ts, its pages
// mapped from a list and its server the browser tier's.
// From spike-html-hosting-architecture (a09e7db): scripts/screenshots.config.ts.

import { until } from "@jaimestill/spike-html-apps-tooling/browser.js";
import type {
  DescribedPage,
  DescribedState,
  Description,
  Step,
  Viewport,
} from "@jaimestill/spike-html-apps-tooling/screenshots.js";

import content from "../content.json" with { type: "json" };
import { pageFile, pageUrl } from "../markdown-pages.ts";
import { served } from "../test/browser/support/served.ts";
import { base } from "../vite.config.ts";

// A desktop's width, and, below the theme menu's 48rem breakpoint, a phone's.
const WIDE: Viewport = { width: 1280, height: 800 };
const NARROW: Viewport = { width: 390, height: 844 };

/**
 * Opens the theme menu: the Theme button's command="--open", as a click sends it to
 * <sl-theme-menu>.
 */
const openThemeMenu: Step = async (page) => {
  await page.evaluate(`document.querySelector("button[commandfor=theme]").click()`);
  await until(page, `document.querySelector("sl-theme-menu dialog")?.open`);
};

/** A page's states: the whole page at each width, and, for the index, the theme menu open at
 * each. A state's name names its files, which hold no directory, so a page name's slashes are
 * dashes there. */
function states(name: string, caption: string, index: boolean): DescribedState[] {
  const file = name.replaceAll("/", "-");
  const whole: DescribedState[] = [
    { name: `${file}-wide`, caption: `${caption}, wide`, viewport: WIDE, full: true },
    { name: `${file}-narrow`, caption: `${caption}, narrow`, viewport: NARROW, full: true },
  ];
  if (!index) return whole;
  return whole.concat(
    {
      name: `${file}-theme-menu-wide`,
      caption: `${caption}, the theme menu open, wide`,
      viewport: WIDE,
      full: false,
      open: openThemeMenu,
    },
    {
      name: `${file}-theme-menu-narrow`,
      caption: `${caption}, the theme menu open, narrow`,
      viewport: NARROW,
      full: false,
      open: openThemeMenu,
    },
  );
}

/** Every copied file's page, in the build's order: the plugin sorts the files it reads. Its path
 * is the page's URL under the base, as the root's index links it, and its name that path's file
 * without .html, a directory's index its directory, the root's index "index". */
const pages: DescribedPage[] = Object.keys(content.files)
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => {
    const built = pageFile(file);
    const name =
      built === "index.html" ? "index" : built.replace(/\/index\.html$/, "").replace(/\.html$/, "");
    const path = pageUrl("README.md", file).replace(/^\.\/$/, "");
    const caption = `${base}${path}`;
    return { name, caption, path, states: states(name, caption, name === "index") };
  });

/** The page's registered names, by flag, read from the foundation's store at its well-known
 * global key; its color facet is palette's. */
const REGISTRY = `(() => {
  const store = globalThis[Symbol.for("spike-html-apps-foundation.registry")] ?? {};
  return { palette: store.color ?? [], space: store.space ?? [], type: store.type ?? [] };
})()`;

const description: Description = {
  pages,
  facets: [
    { flag: "palette", attribute: "data-palette", default: "flexoki" },
    { flag: "space", attribute: "data-space", default: "regular" },
    { flag: "type", attribute: "data-type", default: "mono" },
  ],
  // Every color at the defaults, then the other space and the other type at the default color.
  all: [
    ...["flexoki", "primer", "catppuccin", "everforest"].map((palette) => ({ palette })),
    { space: "compact" },
    { type: "sans" },
  ],
  profiles: (page) => page.evaluate(REGISTRY),
  server: served,
};

export default description;
