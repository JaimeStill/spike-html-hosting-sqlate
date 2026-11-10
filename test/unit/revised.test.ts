// The copied tree's revisions: content.json's revised entry holds each revised file to its record,
// the record's current blob hash a change from the original the entry names, and the build's note
// links that original. The fixtures prove each failure the check names.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { checkRevised, revisedNotes } from "../../scripts/revised.ts";
import type { Revised } from "../../scripts/revised.ts";

const root = join(import.meta.dirname, "../..");
const content: Revised = JSON.parse(readFileSync(join(root, "content.json"), "utf8"));

const commit = "f2b2117245c3e0913d437e63d1f8312dbb66d269";
const original = "0c545076b009e55d9eb11dcaf9257352bc18c494";

/** A one-tree record whose guide's current blob is given, revised from original. */
function fixture(current: string, revised = "docs/guide.md"): Revised {
  return {
    repository: "lib",
    url: "https://github.com/example/lib",
    commit,
    files: { "README.md": "bccc15ab0f4b5f9876b0a4743d31a464cb856d3c", "docs/guide.md": current },
    revised: { [revised]: { commit, original, status: "proposed to lib" } },
  };
}

test("each revision is a change its record holds", () => {
  assert.deepEqual(checkRevised(content), []);
  assert.ok(Object.keys(content.revised ?? {}).length > 0, "content.json revises no file");
});

test("a revised file whose current blob is its original fails", () => {
  assert.deepEqual(checkRevised(fixture(original)), [
    `content/docs/guide.md's blob is its original ${original}, unrevised`,
  ]);
});

test("a revision naming a file no tree records fails", () => {
  assert.deepEqual(
    checkRevised(fixture("f3c2e9fdb4afc5dedfeb47a9c715223a77be2ce4", "docs/gone.md")),
    ["content.json's revised names docs/gone.md, which no tree records"],
  );
});

test("a revision whose commit or original isn't a full hash fails", () => {
  const record = fixture("f3c2e9fdb4afc5dedfeb47a9c715223a77be2ce4");
  record.revised = {
    "docs/guide.md": { commit: "f2b2117", original: "0c54507", status: "proposed to lib" },
  };
  assert.deepEqual(checkRevised(record), [
    "content.json's revised docs/guide.md commit f2b2117 isn't a full commit",
    "content.json's revised docs/guide.md original 0c54507 isn't a blob hash",
  ]);
});

test("a revised file's note links its original at its commit", () => {
  assert.deepEqual(revisedNotes(fixture("f3c2e9fdb4afc5dedfeb47a9c715223a77be2ce4")), [
    {
      page: "docs/guide.html",
      html:
        '<p class="revised-note">Revised from <a href="https://github.com/example/lib/blob/' +
        `${commit}/docs/guide.md">lib@f2b2117</a>.</p>`,
    },
  ]);
});
