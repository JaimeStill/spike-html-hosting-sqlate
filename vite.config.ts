// The site's build (mise run build): a page for each Markdown file copied into content/, each
// index.html's shell filled with the file, and the foundation modules the shell loads, into dist/:
// static files GitHub Pages serves as the repository's project site, under /<repository>/. The
// base is that path, and the repository's name is package.json's name, the one place it is
// written; the SDK's served(), which the browser tier and the captures serve the build with, reads
// the same name.
//
// The plugins, each the SDK's: cssModuleScripts, the CSS module script rewrite of the foundation's
// modules, first; markdownPages, which renders the copied tree into pages and fails the build on
// a relative link it can't place; and renderBlocking, which keeps each page's one entry script
// render-blocking. Then the site's own: revisedPages (scripts/revised.ts), which opens each page of
// a file content.json's revised entry names with a note linking the original it revises; and
// recordingPages (scripts/recordings.ts), which places each of the quick-start's recordings,
// tapes/*.webm, under the step it shows and writes it to recordings/ under the base.
// content.json records the copied tree's source, its repository and commit, which pin the links
// the pages make into the source on GitHub; test/unit/content.test.ts holds the copies to it.
// Adapted from spike-html-apps (529ec52): vite.external.config.ts, its plugins, with the base the
// Pages path and no preview host.
// Adapted from spike-html-hosting (cb0511c): vite.config.ts, its one page a page for each copied
// Markdown file.
// Adapted from spike-html-hosting-architecture (27d70e1): vite.config.ts, its plugins and its base
// the SDK's.
// Adapted from spike-html-hosting-sdk (v0.1.0): template/vite.config.ts, its external the source's
// LICENSE.

import { fileURLToPath } from "node:url";

import { cssModuleScripts } from "@jaimestill/spike-html-hosting-sdk/css-module-scripts.js";
import { markdownPages } from "@jaimestill/spike-html-hosting-sdk/markdown-pages.js";
import { renderBlocking } from "@jaimestill/spike-html-hosting-sdk/render-blocking.js";
import { base } from "@jaimestill/spike-html-hosting-sdk/served.js";
import { defineConfig } from "vite";

import content from "./content.json" with { type: "json" };
import { recordingPages } from "./scripts/recordings.ts";
import { revisedPages } from "./scripts/revised.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: base(root),
  plugins: [
    cssModuleScripts(),
    // external lists the files the source holds, and its pages link, that the site doesn't copy:
    // the source's LICENSE, which its README links.
    markdownPages({
      dir: "content",
      repository: content.url,
      ref: content.commit,
      external: ["LICENSE"],
    }),
    renderBlocking(),
    revisedPages(content),
    recordingPages(),
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
});
