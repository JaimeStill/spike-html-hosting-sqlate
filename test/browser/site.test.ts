// The site's build, as Pages serves it: dist/ under the base, by Vite's preview, loaded in the
// pinned chrome-headless-shell. The page is the site's index.html, its entry render-blocking. The
// page's button opens the theme menu, whose CSS module script the build rewrote, so its sheet is
// adopted with no stylesheet fetched for it; and every request the page makes resolves under the
// base, with none failed. Nothing here names a site: a site that copies this layer changes only
// package.json's name and index.html's page text, and this file not at all.
// From spike-html-hosting (0a98c8e): test/browser/site.test.ts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { launch, until } from "@jaimestill/spike-html-apps-tooling/browser.js";
import type { Browser, Page } from "@jaimestill/spike-html-apps-tooling/browser.js";
import { freePort, start } from "@jaimestill/spike-html-apps-tooling/process.js";
import type { Started } from "@jaimestill/spike-html-apps-tooling/process.js";

import { base } from "../../vite.config.ts";

const root = join(import.meta.dirname, "../..");

/** The page's title as the site's index.html writes it, which the built page must carry. */
const title = /<title>([^<]*)<\/title>/.exec(readFileSync(join(root, "index.html"), "utf8"))?.[1];

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

describe("the site under its base", () => {
  test("opens the theme menu with its sheet adopted, every request under the base", async (t) => {
    // Every request, response, and failed load the page's network log records, from the first.
    const requests: string[] = [];
    const responses: { url: string; status: number }[] = [];
    const failures: { url: string; errorText: string }[] = [];
    const urls = new Map<string, string>();
    const page = await browser.open("about:blank");
    try {
      page.on(
        "Network.requestWillBeSent",
        ({ requestId, request }: { requestId: string; request: { url: string } }) => {
          requests.push(request.url);
          urls.set(requestId, request.url);
        },
      );
      page.on(
        "Network.responseReceived",
        ({ response }: { response: { url: string; status: number } }) =>
          responses.push({ url: response.url, status: response.status }),
      );
      page.on(
        "Network.loadingFailed",
        ({ requestId, errorText }: { requestId: string; errorText: string }) =>
          failures.push({ url: urls.get(requestId) ?? requestId, errorText }),
      );
      await page.cdp("Network.enable");
      await page.goto(`${origin}${base}`);
      assert.ok(title, "index.html has a title");
      assert.equal(await page.evaluate("document.title"), title);

      // The build's one module script, its entry, is render-blocking, so it ran before first
      // paint: sl-theme-menu is defined, the menu itself not loaded.
      assert.deepEqual(
        await page.evaluate(`[...document.querySelectorAll('script[type="module"]')]
          .map((script) => script.blocking.contains("render"))`),
        [true],
      );
      assert.equal(await page.evaluate(`!!customElements.get("sl-theme-menu")`), true);
      assert.equal(await page.evaluate("document.adoptedStyleSheets.length"), 0);

      await click(page, "button[commandfor=theme]");
      await until(page, `document.querySelector("sl-theme-menu dialog")?.matches(":modal")`);
      // The menu adopts its sheet, the constructed CSSStyleSheet the build made of its CSS module
      // script, onto the document, in its layer.
      const sheets = await page.evaluate(`document.adoptedStyleSheets.map((sheet) =>
        [...sheet.cssRules].map((rule) => rule.name))`);
      assert.deepEqual(sheets, [["foundation.theme-menu"]]);

      for (const url of requests) t.diagnostic(url);
      assert.deepEqual(failures, []);
      assert.deepEqual(
        responses.filter(({ status }) => status >= 400),
        [],
      );
      assert.deepEqual(
        requests.filter((url) => !url.startsWith(`${origin}${base}`)),
        [],
        "every request resolves under the base",
      );
      // The page, its entry and stylesheet, and the menu's chunk, loaded on the first open; no
      // stylesheet is fetched for the menu, whose sheet is in its chunk.
      assert.ok(requests.includes(`${origin}${base}`), "the page loaded");
      const assets = requests.filter((url) => url.startsWith(`${origin}${base}assets/`));
      for (const pattern of [
        /\/index-[\w-]+\.js$/,
        /\/index-[\w-]+\.css$/,
        /\/theme-menu-[\w-]+\.js$/,
      ]) {
        assert.ok(
          assets.some((url) => pattern.test(url)),
          `an asset matching ${pattern} loaded`,
        );
      }
      assert.deepEqual(
        requests.filter((url) => /theme-menu[\w-]*\.css$/.test(url)),
        [],
      );
    } finally {
      await page.close();
    }
  });
});
