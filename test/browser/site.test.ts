// The site's build, as Pages serves it: dist/ under the base, by the SDK's served(), Vite's
// preview, loaded in the pinned chrome-headless-shell. Each of the SDK's shell checks is a test on
// a fresh page of the index; the crawl follows every link into the site from the index and checks
// each page it reaches, then each page content.json records that no link reaches, which its
// diagnostics name. The palette check runs on the index, which holds highlighted code: each
// palette the page registers, in light and in dark, recolors its code to its syntax theme's
// colors. The revised note opens each page content.json's revised entry names, the quick-start
// among them, and no other, a muted aside in the palette's secondary text color, --fg-2. The
// quick-start holds each of its recordings in a figure under the step it shows, after the output
// it follows, its video muted, with controls, inline, preloading nothing, named by its caption,
// its source a WebM and its poster a WebP, both served under the base; and at 390px the page
// scrolls nothing sideways. Nothing here names the site: its base is package.json's name.
// Adapted from spike-html-hosting-architecture (27d70e1): test/browser/site.test.ts, its checks
// the SDK's.
// From spike-html-hosting-sdk (v0.2.0): template/test/browser/site.test.ts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { launch } from "@jaimestill/spike-html-apps-tooling/browser.js";
import type { Browser } from "@jaimestill/spike-html-apps-tooling/browser.js";
import type { Server } from "@jaimestill/spike-html-apps-tooling/server.js";
import {
  crawl,
  fitsNarrowWidth,
  highlightsEachPalette,
  shell,
} from "@jaimestill/spike-html-hosting-sdk/browser.js";
import { contentPages } from "@jaimestill/spike-html-hosting-sdk/screenshots.js";
import { served } from "@jaimestill/spike-html-hosting-sdk/served.js";

import { recordings } from "../../scripts/recordings.ts";
import { revisedNotes } from "../../scripts/revised.ts";
import type { Revised } from "../../scripts/revised.ts";

const root = join(import.meta.dirname, "../..");
const content: Revised = JSON.parse(readFileSync(join(root, "content.json"), "utf8"));

let server: Server;
let browser: Browser;

before(async () => {
  server = await served(root);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await server?.stop();
});

describe("the site under its base", () => {
  for (const [name, check] of Object.entries(shell)) {
    test(name, async () => {
      const page = await browser.open("about:blank");
      try {
        await check(page, server.origin);
      } finally {
        await page.close();
      }
    });
  }

  test("each palette's code takes its syntax theme, in light and in dark", async () => {
    const page = await browser.open("about:blank");
    try {
      await highlightsEachPalette(page, server.origin);
    } finally {
      await page.close();
    }
  });

  test("the revised note opens each revised page, after its h1, and no other", async () => {
    const notes = new Map(revisedNotes(content).map((note) => [note.page, note.html]));
    assert.ok(notes.has("docs/quick-start.html"), "the quick-start is not revised");
    const page = await browser.open("about:blank");
    try {
      for (const path of contentPages(root)) {
        await page.goto(new URL(path, server.origin).href);
        const found = await page.evaluate(
          `[...document.querySelectorAll("main .revised-note")].map((note) => {
            const probe = document.createElement("span");
            probe.style.color = "var(--fg-2)";
            note.append(probe);
            const secondary = getComputedStyle(probe).color;
            probe.remove();
            return {
              html: note.outerHTML,
              afterH1: note.previousElementSibling?.localName === "h1",
              secondary: getComputedStyle(note).color === secondary,
              muted: getComputedStyle(note).color !== getComputedStyle(note.parentElement).color,
            };
          })`,
        );
        const want = notes.get(path);
        assert.deepEqual(
          found,
          want === undefined ? [] : [{ html: want, afterH1: true, secondary: true, muted: true }],
          path,
        );
      }
    } finally {
      await page.close();
    }
  });

  test("the quick-start holds each recording under its step, loading under the base", async () => {
    const url = new URL("docs/quick-start.html", server.origin).href;
    const page = await browser.open(url);
    try {
      const found = await page.evaluate(`Promise.all(
        [...document.querySelectorAll("main video")].map(async (video) => {
          let heading = video.closest("figure");
          while (heading && heading.localName !== "h2") heading = heading.previousElementSibling;
          const response = await fetch(video.currentSrc || video.src);
          await response.arrayBuffer();
          const poster = await fetch(video.poster);
          await poster.arrayBuffer();
          return {
            src: new URL(video.getAttribute("src"), location.href).pathname,
            poster: new URL(video.getAttribute("poster"), location.href).pathname,
            posterStatus: poster.status,
            posterType: poster.headers.get("content-type"),
            heading: heading?.id ?? null,
            follows: video.closest("figure")?.previousElementSibling?.localName ?? null,
            muted: video.hasAttribute("muted"),
            controls: video.hasAttribute("controls"),
            playsinline: video.hasAttribute("playsinline"),
            preload: video.getAttribute("preload"),
            name: document.getElementById(video.getAttribute("aria-labelledby"))?.textContent ?? null,
            caption: video.closest("figure")?.querySelector("figcaption")?.textContent ?? null,
            status: response.status,
            type: response.headers.get("content-type"),
          };
        }),
      )`);
      const base = new URL(server.origin).pathname;
      assert.deepEqual(
        found,
        recordings.map((recording) => ({
          src: `${base}recordings/${recording.name}.webm`,
          poster: `${base}recordings/${recording.name}.webp`,
          posterStatus: 200,
          posterType: "image/webp",
          heading: recording.heading,
          follows: "pre",
          muted: true,
          controls: true,
          playsinline: true,
          preload: "none",
          name: recording.label,
          caption: recording.label,
          status: 200,
          type: "video/webm",
        })),
      );
      await fitsNarrowWidth(page, server.origin, url);
    } finally {
      await page.close();
    }
  });

  test("the crawl reaches every page content.json records", async (t) => {
    const page = await browser.open("about:blank");
    try {
      const crawled = await crawl(page, server.origin, root);
      t.diagnostic(`${crawled.pages} pages, ${crawled.links} in-site links`);
      if (crawled.unreachable.length > 0) {
        t.diagnostic(`no link reaches ${crawled.unreachable.join(", ")}`);
      }
      assert.equal(crawled.pages, contentPages(root).length);
    } finally {
      await page.close();
    }
  });
});
