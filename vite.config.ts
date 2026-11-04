// The site's build (mise run build): a page for each Markdown file copied into content/, each
// index.html's shell filled with the file (markdown-pages.ts), and the foundation modules the
// shell loads, into dist/: static files GitHub Pages serves as the repository's project site,
// under /<repository>/. The
// base is that path, and the repository's name is package.json's name, the one place it is
// written: a site that copies this layer renames its package and changes its page, and nothing
// here.
//
// Vite drops the entry script's blocking attribute as it rewrites the tag, so renderBlocking puts
// it back on each page's built entry: the page's module scripts, the foundation's registrations and its
// preferences module, which applies the reader's stored theme choice to the root element before
// first paint, are one entry in the build, and it runs before first paint as they did.
//
// content.json records the copied tree's source, its repository and commit, which pin the links
// the pages make into the source on GitHub; test/unit/content.test.ts holds the copies to it.
// Adapted from spike-html-apps (529ec52): vite.external.config.ts, its plugins, with the base the
// Pages path and no preview host.
// From spike-html-hosting (cb0511c): vite.config.ts.
// From spike-html-hosting-architecture (c4deeff): vite.config.ts.

import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { standardCssModules } from "vite-plugin-standard-css-modules";

import content from "./content.json" with { type: "json" };
import { markdownPages } from "./markdown-pages.ts";
import manifest from "./package.json" with { type: "json" };

/** The path Pages serves the site under: the repository's name, which is the package's. */
export const base = `/${manifest.name}/`;

/** The built page's entry script, as Vite writes its tag, and the same tag render-blocking. */
const entryTag = '<script type="module" crossorigin src=';
const blockingTag = '<script type="module" blocking="render" crossorigin src=';

/** Marks each built page's one entry script render-blocking; fails the build when a page holds no
 * such tag, or more than one, so a change in how Vite writes it can't pass unnoticed. */
const renderBlocking = (): Plugin => ({
  name: "site:render-blocking",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(page, { path }) {
      const found = page.split(entryTag).length - 1;
      if (found !== 1) {
        throw new Error(`site: want one entry tag ${entryTag}… in ${path}, found ${found}`);
      }
      return page.replace(entryTag, blockingTag);
    },
  },
});

export default defineConfig({
  base,
  // CSS module scripts, `import sheet from "./x.css" with { type: "css" }`, which the
  // foundation's theme menu uses to adopt its sheet, and which Vite doesn't support. The plugin
  // rewrites each import carrying that attribute to a module whose default export is one
  // constructed CSSStyleSheet per file; include names the importers it parses, the layers'
  // modules, the only ones holding CSS module scripts. outputMode pins the CSSStyleSheet the menu
  // adopts, never Lit's CSSResult. It parses with rolldown/utils, which it doesn't declare, so
  // package.json declares rolldown at the version Vite resolves. The check's lint fails on any CSS
  // module script left in dist/ (eslint.config.js).
  plugins: [
    standardCssModules({
      include: ["**/node_modules/@jaimestill/**/*.js"],
      outputMode: "CSSStyleSheet",
    }),
    // The source's LICENSE, which its README links, is the one file the pages link and the site
    // doesn't copy.
    markdownPages({
      dir: "content",
      repository: content.url,
      ref: content.commit,
      external: ["LICENSE"],
    }),
    renderBlocking(),
  ],
  // No public directory: the pages and what they import are the whole site.
  publicDir: false,
  build: {
    outDir: "dist",
    target: "es2024",
  },
  // A multi-page site: a path no page builds to is a 404 in the preview, as it is on Pages, never
  // a fallback to the index.
  appType: "mpa",
  // The browser tier's host: Vite's preview of the build, under the base, on the loopback address.
  preview: {
    host: "127.0.0.1",
    strictPort: true,
  },
});
