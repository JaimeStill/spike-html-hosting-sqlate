// The Markdown pages' rendering, on small files: each copied file's page path, the links it
// rewrites (to a copied file's page, relative to the linking page, its fragment kept; to an
// external file's blob at the pinned commit), the links it passes through, and the build failing
// on a relative link it can't place. The front matter is parsed, never rendered as body text,
// and shown as a table of its keys and values in source order, escaped; a file with none shows no
// table and takes its title from its first h1, and one with neither a name nor an h1 fails the
// build. Headings carry GitHub's ids, counted per page. The browser tier crawls the built pages
// themselves.
// From spike-html-hosting-architecture (de46c65): test/unit/markdown-pages.test.ts.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { frontMatterTable, pageFile, pageUrl, render } from "../../markdown-pages.ts";
import type { Source } from "../../markdown-pages.ts";

const source: Source = {
  pages: new Set(["README.md", "a.md", "dir/README.md", "dir/b.md"]),
  external: new Set(["LICENSE"]),
  repository: "https://github.com/owner/repo",
  ref: "0123456789abcdef0123456789abcdef01234567",
};

/** The href of each link the body renders, in order. */
const hrefs = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/** A copied file of front matter and the body. */
const file = (body: string): string => `---\nkey: k\nname: The name\n---\n\n${body}`;

describe("the Markdown pages", () => {
  test("build each file to its page, a README to its directory's index", () => {
    assert.deepEqual(["README.md", "a.md", "dir/README.md", "dir/b.md"].map(pageFile), [
      "index.html",
      "a.html",
      "dir/index.html",
      "dir/b.html",
    ]);
    assert.equal(pageUrl("dir/b.md", "README.md"), "../");
    assert.equal(pageUrl("README.md", "dir/README.md"), "dir/");
    assert.equal(pageUrl("dir/README.md", "dir/README.md"), "./");
    assert.equal(pageUrl("a.md", "dir/b.md"), "dir/b.html");
  });

  test("rewrite each relative link to a copied or external file, the rest passed through", () => {
    const { html } = render(
      "dir/b.md",
      file(
        "[a](../a.md) [b](b.md#x) [i](README.md) [r](../README.md#y) [l](../LICENSE#z) " +
          "[f](#f) [w](https://example.com/c.md) [m](mailto:x@example.com)",
      ),
      source,
    );
    assert.deepEqual(hrefs(html), [
      "../a.html",
      "b.html#x",
      "./",
      "../#y",
      `${source.repository}/blob/${source.ref}/LICENSE#z`,
      "#f",
      "https://example.com/c.md",
      "mailto:x@example.com",
    ]);
  });

  test("fail on a relative link to a file neither copied nor external", () => {
    for (const href of ["c.md", "../dir/c.md#x", "../../a.md", "/a.md", "NOTICE", "a.md?x"]) {
      assert.throws(
        () => render("dir/b.md", file(`[x](${href})`), source),
        /dir\/b\.md links .*neither a copied file nor a listed external one/,
        href,
      );
    }
  });

  test("parse the front matter, titling the page with its name, never rendering it as body", () => {
    const { data, title, html } = render("a.md", file("# A heading\n\nBody."), source);
    assert.deepEqual(data, { key: "k", name: "The name" });
    assert.equal(title, "The name");
    assert.equal(html, '<h1 id="a-heading">A heading</h1>\n<p>Body.</p>\n');
    assert.throws(() => render("a.md", "---\n- k\n---\n", source), /a\.md's front matter isn't/);
    assert.throws(() => render("a.md", "---\nname: 1\n---\n", source), /a\.md's front matter name/);
  });

  test("show the front matter as a table of its keys and values, in source order, escaped", () => {
    const { data } = render(
      "a.md",
      "---\nz: last <b>\nname: A & B\ncount: 2\nempty:\nlist: [x, <y>]\nmap: { k: v }\n---\n",
      source,
    );
    assert.equal(
      frontMatterTable(data),
      '<table class="front-matter"><tbody>' +
        '<tr><th scope="row">z</th><td>last &lt;b&gt;</td></tr>' +
        '<tr><th scope="row">name</th><td>A &amp; B</td></tr>' +
        '<tr><th scope="row">count</th><td>2</td></tr>' +
        '<tr><th scope="row">empty</th><td></td></tr>' +
        '<tr><th scope="row">list</th><td><table><tbody><tr><td>x</td><td>&lt;y&gt;</td></tr>' +
        "</tbody></table></td></tr>" +
        '<tr><th scope="row">map</th><td><table><tbody><tr><th scope="row">k</th><td>v</td></tr>' +
        "</tbody></table></td></tr>" +
        "</tbody></table>\n",
    );
    assert.equal(frontMatterTable(render("a.md", "---\n---\n# T\n", source).data), "");
  });

  test("title a file with no front matter by its first h1, with no table", () => {
    const { data, title, html } = render(
      "a.md",
      "Intro.\n\n## Not this\n\n# The *first* `h1` [link](a.md)\n\n# Second\n",
      source,
    );
    assert.equal(data, null);
    assert.equal(frontMatterTable(data), "");
    assert.equal(title, "The first h1 link");
    assert.ok(html.startsWith("<p>Intro.</p>"), html);
    // Front matter without a name falls back to the h1 too.
    assert.equal(render("a.md", "---\nkey: k\n---\n# Heading\n", source).title, "Heading");
  });

  test("fail on a file with neither a front matter name nor an h1", () => {
    for (const text of ["## Only an h2\n\nBody.\n", "---\nkey: k\n---\nBody.\n", ""]) {
      assert.throws(
        () => render("dir/b.md", text, source),
        /dir\/b\.md has neither a front matter name nor an h1/,
        JSON.stringify(text),
      );
    }
  });

  test("give headings GitHub's ids, counted from none on each page", () => {
    const body = file("# A CLI domain's commands\n\n## Same\n\n## Same\n");
    const ids = (html: string) => [...html.matchAll(/id="([^"]*)"/g)].map((m) => m[1]);
    const want = ["a-cli-domains-commands", "same", "same-1"];
    assert.deepEqual(ids(render("a.md", body, source).html), want);
    assert.deepEqual(ids(render("a.md", body, source).html), want);
  });
});
