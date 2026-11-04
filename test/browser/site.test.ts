// The site's build, as Pages serves it: dist/ under the base, by Vite's preview, loaded in the
// pinned chrome-headless-shell. On the index, the button opens the theme menu, whose CSS module
// script the build rewrote, so its sheet is adopted with no stylesheet fetched for it. On the
// index, T opens the menu too, through keys.js, and stepping the color, space, and type rows each
// to a profile past its default, which the full entry registers, sets that facet's attribute on the
// root. From the index, every link into the site is followed, breadth first, and each page reached
// loads with a 2xx, its one module script, the entry, render-blocking, every request under the base
// and none failed, its main held to a reading width, centered, in a 1600px viewport, and its title
// its source's front matter name, or, for a source with no name, its first h1's text. A page whose
// source has front matter opens its main with the front matter's table, one row per key in source
// order, each key and value as the source holds it, and shows no key's line as body text, a
// paragraph or a heading; a page whose source has none shows no table. Every in-site link reaches a
// built page, and an element with its fragment's id when it has one. The crawl checks a page for
// every file content.json records, and no other: a page no link from the index reaches is crawled
// from once the links run out, and named in the test's diagnostics. Nothing here names a site: a
// site that copies this layer changes package.json's name and its copied tree, and this file not at
// all. The preview is support/served.ts's, which the screenshots description starts too.
// Adapted from spike-html-hosting (0a98c8e): test/browser/site.test.ts, its one page a crawl of
// the site's pages.
// From spike-html-hosting-architecture (a20a1e0): test/browser/site.test.ts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { after, before, describe, test } from "node:test";

import { launch, until } from "@jaimestill/spike-html-apps-tooling/browser.js";
import type { Browser, Page } from "@jaimestill/spike-html-apps-tooling/browser.js";
import type { Server } from "@jaimestill/spike-html-apps-tooling/server.js";
import { parse } from "yaml";

import content from "../../content.json" with { type: "json" };
import { served } from "./support/served.ts";

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

let preview: Server;
/** The site's URL under the base, as the preview serves it. */
let site: string;
let browser: Browser;

before(async () => {
  preview = await served();
  site = preview.origin;
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

/** Presses a lowercase letter key as a US keyboard types it: keyDown with its text, then keyUp. */
async function press(page: Page, letter: string): Promise<void> {
  const event = {
    key: letter,
    code: `Key${letter.toUpperCase()}`,
    windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
  };
  await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", ...event, text: letter });
  await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", ...event });
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
    requests.filter((request) => !request.startsWith(site)),
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
      await page.goto(site);
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
      assertLoaded(site, log);
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

  test("opens the theme menu on T, and each row's choice sets its attribute on the root", async () => {
    const { page } = await open();
    try {
      await page.goto(site);
      await press(page, "t");
      await until(page, `document.querySelector("sl-theme-menu dialog")?.matches(":modal")`);

      // Each facet's row, by its section, and the root attribute preferences.js sets for it.
      const facets = [
        ["color", "data-palette"],
        ["space", "data-space"],
        ["type", "data-type"],
      ];
      // Every row lists more than its default: the full entry registered every built-in profile.
      const rows: Record<string, { values: string[]; checked: string }> = await page.evaluate(`
        Object.fromEntries([...document.querySelectorAll("sl-theme-menu [data-section]")].map(
          (row) => [row.dataset.section, {
            values: [...row.querySelectorAll("input")].map((radio) => radio.value),
            checked: row.querySelector(":checked").value,
          }]))`);
      for (const [facet] of facets) {
        assert.ok(rows[facet].values.length > 1, `the ${facet} row offers ${rows[facet].values}`);
      }

      // Focus opens on the first row, color; l steps a row to its next radio, j moves down a row.
      // Each facet's row steps once, past the scheme row, to the radio after its default.
      for (const [index, [facet, attribute]] of facets.entries()) {
        if (index > 0) await press(page, "j");
        if (facet === "space") await press(page, "j");
        await press(page, "l");
        const { values, checked } = rows[facet];
        const chosen = values[(values.indexOf(checked) + 1) % values.length];
        assert.equal(
          await page.evaluate(`document.documentElement.getAttribute("${attribute}")`),
          chosen,
          `choosing ${chosen} in the ${facet} row sets ${attribute}`,
        );
      }
    } finally {
      await page.close();
    }
  });

  test("crawls every page from the index, each loaded, titled, and its front matter a table, its links resolving", async (t) => {
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
    // A viewport wider than any reading width, so main's cap shows.
    await page.cdp("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
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
        // The site's layout holds main to a reading width, centered, well inside the viewport.
        const { width, left, right, viewport }: Record<string, number> =
          await page.evaluate(`(() => {
          const rect = document.querySelector("main").getBoundingClientRect();
          const viewport = document.documentElement.clientWidth;
          return { width: rect.width, left: rect.left, right: viewport - rect.right, viewport };
        })()`);
        assert.ok(width < viewport * 0.75, `${url}: main's ${width}px is capped in ${viewport}px`);
        assert.ok(
          Math.abs(left - right) <= 1,
          `${url}: main is centered, ${left}px and ${right}px`,
        );
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
