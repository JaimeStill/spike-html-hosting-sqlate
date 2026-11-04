// The site's build, as Pages serves it: dist/ under the base, by Vite's preview, loaded in the
// pinned chrome-headless-shell. On the index, the button opens the theme menu, whose CSS module
// script the build rewrote, so its sheet is adopted with no stylesheet fetched for it. From the
// index, every link into the site is followed, breadth first, and each page reached loads with a
// 2xx, its one module script, the entry, render-blocking, every request under the base and none
// failed, and its title its source's front matter name, or, for a source with no name, its first
// h1's text. A page whose source has front matter opens its main with the front matter's table,
// one row per key in source order, each key and value as the source holds it, and shows no key's
// line as body text, a paragraph or a heading; a page whose source has none shows no table. Every
// in-site link reaches a built page, and an element with its fragment's id when it has one. The
// crawl checks a page for every file content.json records, and no other: a page no link from the
// index reaches is crawled from once the links run out, and named in the test's diagnostics.
// Nothing here names a site: a site that copies this layer changes package.json's name and its
// copied tree, and this file not at all.
// Adapted from spike-html-hosting (0a98c8e): test/browser/site.test.ts, its one page a crawl of
// the site's pages.
// From spike-html-hosting-architecture (59b01b2): test/browser/site.test.ts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { after, before, describe, test } from "node:test";

import { launch, until } from "@jaimestill/spike-html-apps-tooling/browser.js";
import type { Browser, Page } from "@jaimestill/spike-html-apps-tooling/browser.js";
import { freePort, start } from "@jaimestill/spike-html-apps-tooling/process.js";
import type { Started } from "@jaimestill/spike-html-apps-tooling/process.js";
import { parse } from "yaml";

import content from "../../content.json" with { type: "json" };
import { base } from "../../vite.config.ts";

const root = join(import.meta.dirname, "../..");

/** A front matter value's text, as its cell's textContent: a sequence's or a mapping's nested
 * table its items', or its keys' and values', text run together, and null nothing. */
const text = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => key + text(item))
      .join("");
  }
  return String(value);
};

/** Each copied file's page, by its path under the base (x.md at x.html, dir/README.md at dir/),
 * to its source's front matter, null when it has none, read with yaml as the build reads it. */
const sources = new Map(
  Object.keys(content.files).map((path) => {
    const dir = posix.dirname(path) === "." ? "" : `${posix.dirname(path)}/`;
    const page =
      posix.basename(path) === "README.md" ? dir : `${dir}${posix.basename(path, ".md")}.html`;
    const source = readFileSync(join(root, "content", path), "utf8");
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
    const data = match ? ((parse(match[1]) ?? {}) as Record<string, unknown>) : null;
    return [page, data];
  }),
);

let preview: Started;
let origin: string;
let browser: Browser;

before(async () => {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  preview = await start(
    join(root, "node_modules", ".bin", "vite"),
    ["preview", "--port", `${port}`],
    {
      cwd: root,
      ready: `${origin}${base}`,
    },
  );
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await preview?.stop();
});

/** Clicks the element the selector names at its center, as a person's mouse does. */
async function click(page: Page, selector: string): Promise<void> {
  const { x, y } = await page.evaluate(`(() => {
    const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await page.cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  }
}

/** A page's network log: every request, response, and failed load. */
interface Log {
  requests: string[];
  responses: { url: string; status: number }[];
  failures: { url: string; errorText: string }[];
}

/** Opens a blank page, its network log recorded from its first request; take reads the log and
 * starts a new one. */
async function open(): Promise<{ page: Page; take: () => Log }> {
  let log: Log = { requests: [], responses: [], failures: [] };
  const urls = new Map<string, string>();
  const page = await browser.open("about:blank");
  page.on(
    "Network.requestWillBeSent",
    ({ requestId, request }: { requestId: string; request: { url: string } }) => {
      log.requests.push(request.url);
      urls.set(requestId, request.url);
    },
  );
  page.on(
    "Network.responseReceived",
    ({ response }: { response: { url: string; status: number } }) =>
      log.responses.push({ url: response.url, status: response.status }),
  );
  page.on(
    "Network.loadingFailed",
    ({ requestId, errorText }: { requestId: string; errorText: string }) =>
      log.failures.push({ url: urls.get(requestId) ?? requestId, errorText }),
  );
  await page.cdp("Network.enable");
  return {
    page,
    take() {
      const taken = log;
      log = { requests: [], responses: [], failures: [] };
      return taken;
    },
  };
}

/** Asserts a page's log: the page itself loaded with a 2xx, no request failed or answered an
 * error, and every request resolved under the base. */
function assertLoaded(url: string, { requests, responses, failures }: Log): void {
  const status = responses.find((response) => response.url === url)?.status;
  assert.ok(status !== undefined && status >= 200 && status < 300, `${url} loaded with ${status}`);
  assert.deepEqual(failures, [], `${url}: no request failed`);
  assert.deepEqual(
    responses.filter(({ status }) => status >= 400),
    [],
    `${url}: no request answered an error`,
  );
  assert.deepEqual(
    requests.filter((request) => !request.startsWith(`${origin}${base}`)),
    [],
    `${url}: every request resolves under the base`,
  );
}

/** The page's module scripts, each by whether it blocks rendering: the build's entry alone,
 * render-blocking, is [true]. */
const blocking = `[...document.querySelectorAll('script[type="module"]')]
  .map((script) => script.blocking.contains("render"))`;

describe("the site under its base", () => {
  test("opens the theme menu on the index with its sheet adopted", async (t) => {
    const { page, take } = await open();
    try {
      await page.goto(`${origin}${base}`);
      // The entry ran before first paint: sl-theme-menu is defined, the menu itself not loaded.
      assert.deepEqual(await page.evaluate(blocking), [true]);
      assert.equal(await page.evaluate(`!!customElements.get("sl-theme-menu")`), true);
      assert.equal(await page.evaluate("document.adoptedStyleSheets.length"), 0);

      await click(page, "button[commandfor=theme]");
      await until(page, `document.querySelector("sl-theme-menu dialog")?.matches(":modal")`);
      // The menu adopts its sheet, the constructed CSSStyleSheet the build made of its CSS module
      // script, onto the document, in its layer.
      const sheets = await page.evaluate(`document.adoptedStyleSheets.map((sheet) =>
        [...sheet.cssRules].map((rule) => rule.name))`);
      assert.deepEqual(sheets, [["foundation.theme-menu"]]);

      const log = take();
      for (const url of log.requests) t.diagnostic(url);
      assertLoaded(`${origin}${base}`, log);
      // The menu's chunk loaded on the first open, and no stylesheet for it: its sheet is in the
      // chunk.
      assert.ok(
        log.requests.some((url) => /\/assets\/theme-menu-[\w-]+\.js$/.test(url)),
        "the menu's chunk loaded",
      );
      assert.deepEqual(
        log.requests.filter((url) => /theme-menu[\w-]*\.css$/.test(url)),
        [],
      );
    } finally {
      await page.close();
    }
  });

  test("crawls every page from the index, each loaded, titled, and its front matter a table, its links resolving", async (t) => {
    const site = `${origin}${base}`;
    /** Each page reached, by its URL, to the ids its elements carry. */
    const reached = new Map<string, Set<string>>();
    /** Each in-site link: the page it's on, and its href, resolved. */
    const links: { from: string; href: string }[] = [];
    /** The copied files' pages no link from the index reaches: once the links run out, the crawl
     * starts again from the first page not reached, so each is checked as a linked one is. */
    const unreachable: string[] = [];
    const next = (): string | undefined => {
      const url = [...sources.keys()].map((path) => `${site}${path}`).find((u) => !reached.has(u));
      if (url !== undefined) unreachable.push(url.slice(site.length));
      return url;
    };
    const queue = [site];
    const { page, take } = await open();
    try {
      for (let url = queue.shift() ?? next(); url !== undefined; url = queue.shift() ?? next()) {
        if (reached.has(url)) continue;
        take();
        await page.goto(url);
        assertLoaded(url, take());
        assert.deepEqual(await page.evaluate(blocking), [true], `${url}: its entry blocks render`);
        const path = url.slice(site.length);
        assert.ok(sources.has(path), `${url} is a copied file's page`);
        const data = sources.get(path) ?? null;
        const shown: {
          title: string;
          h1: string | null;
          tables: number;
          rows: string[][] | null;
          body: string[];
        } = await page.evaluate(`(() => {
          const table = document.querySelector("main > table.front-matter:first-child");
          return {
            title: document.title,
            h1: document.querySelector("main h1")?.textContent.trim() ?? null,
            tables: document.querySelectorAll("table.front-matter").length,
            rows: table && [...table.tBodies[0].rows].map((row) =>
              [...row.cells].map((cell) => cell.textContent)),
            body: [...document.querySelectorAll("main p, main :is(h1, h2, h3, h4, h5, h6)")]
              .filter((element) => !element.closest("table.front-matter"))
              .map((element) => element.textContent),
          };
        })()`);
        const name = data?.name;
        assert.equal(shown.title, typeof name === "string" ? name : shown.h1, `${url}'s title`);
        assert.ok(shown.title, `${url} has a title`);
        if (data === null || Object.keys(data).length === 0) {
          assert.equal(shown.tables, 0, `${url}: no front matter, no table`);
        } else {
          assert.equal(shown.tables, 1, `${url}: one front matter table`);
          assert.deepEqual(
            shown.rows,
            Object.entries(data).map(([key, value]) => [key, text(value)]),
            `${url}: its main opens with its front matter's table, a row per key in order`,
          );
          for (const [key, value] of Object.entries(data)) {
            const line = `${key}: ${text(value)}`;
            assert.deepEqual(
              shown.body.filter((body) => body.includes(line)),
              [],
              `${url}: ${line} isn't body text`,
            );
          }
        }

        const { ids, hrefs }: { ids: string[]; hrefs: string[] } = await page.evaluate(`({
          ids: [...document.querySelectorAll("[id]")].map((element) => element.id),
          hrefs: [...document.querySelectorAll("a[href]")].map((a) => a.href),
        })`);
        reached.set(url, new Set(ids));
        for (const href of hrefs.filter((href) => href.startsWith(site))) {
          links.push({ from: url, href });
          queue.push(href.split("#")[0]);
        }
      }
      t.diagnostic(`${reached.size} pages, ${links.length} in-site links`);
      for (const path of unreachable) t.diagnostic(`unreachable from the index: ${path}`);

      for (const { from, href } of links) {
        const [url, fragment] = href.split("#");
        const ids = reached.get(url);
        assert.ok(ids, `${from} links ${href}, a page reached`);
        if (fragment) {
          assert.ok(ids.has(decodeURIComponent(fragment)), `${from} links ${href}, an id on it`);
        }
      }
      assert.deepEqual(
        [...reached.keys()].map((url) => url.slice(site.length)).sort(),
        [...sources.keys()].sort(),
        "the crawl checked every copied file's page, and no other",
      );
    } finally {
      await page.close();
    }
  });
});
