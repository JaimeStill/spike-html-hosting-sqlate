// The site's build (mise run build): index.html and the foundation modules it loads into dist/,
// static files GitHub Pages serves as the repository's project site, under /<repository>/. The
// base is that path, and the repository's name is package.json's name, the one place it is
// written: a site that copies this layer renames its package and changes its page, and nothing
// here.
//
// Vite drops the entry script's blocking attribute as it rewrites the tag, so renderBlocking puts
// it back on the built entry: the page's module scripts, the foundation's registrations and its
// preferences module, which applies the reader's stored theme choice to the root element before
// first paint, are one entry in the build, and it runs before first paint as they did.
// Adapted from spike-html-apps (529ec52): vite.external.config.ts, its plugins, with the base the
// Pages path and no preview host.
// From spike-html-hosting (cb0511c): vite.config.ts.

import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { standardCssModules } from "vite-plugin-standard-css-modules";

import manifest from "./package.json" with { type: "json" };

/** The path Pages serves the site under: the repository's name, which is the package's. */
export const base = `/${manifest.name}/`;

/** The built page's entry script, as Vite writes its tag, and the same tag render-blocking. */
const entryTag = '<script type="module" crossorigin src=';
const blockingTag = '<script type="module" blocking="render" crossorigin src=';

/** Marks the built page's one entry script render-blocking; fails the build when the page holds no
 * such tag, or more than one, so a change in how Vite writes it can't pass unnoticed. */
const renderBlocking = (): Plugin => ({
  name: "site:render-blocking",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(page) {
      const found = page.split(entryTag).length - 1;
      if (found !== 1) {
        throw new Error(`site: want one entry tag ${entryTag}… in index.html, found ${found}`);
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
    renderBlocking(),
  ],
  // No public directory: the page and what it imports are the whole site.
  publicDir: false,
  build: {
    outDir: "dist",
    target: "es2024",
  },
  // The browser tier's host: Vite's preview of the build, under the base, on the loopback address.
  preview: {
    host: "127.0.0.1",
    strictPort: true,
  },
});
