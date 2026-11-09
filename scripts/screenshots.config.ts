// mise run screenshots' capture file, which the tooling's spike-html-apps-screenshots bin runs:
// the SDK's description of every page the site builds, listed from content.json in the build's
// order, each captured whole at 390px, 1120px, and 1376px, and the index also with Help open and
// with Settings open at each. A page's name is its built path without .html, a directory's
// index its directory: the root's README.md is --page index. The site is served as the browser
// tier serves it, by the SDK's served(), under the base.
// Adapted from spike-html-hosting-architecture (27d70e1): scripts/screenshots.config.ts, its
// description the SDK's.
// From spike-html-hosting-sdk (v0.6.0): template/scripts/screenshots.config.ts.

import { join } from "node:path";

import { contentPages, description } from "@jaimestill/spike-html-hosting-sdk/screenshots.js";

const root = join(import.meta.dirname, "..");

export default description({ root, pages: contentPages(root) });
