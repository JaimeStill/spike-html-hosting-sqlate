// The copied tree's provenance: content.json records the source repository, the commit the tree was
// copied at, and each copied file's git blob hash at that commit. Each file in content/ is hashed
// as git hashes a blob, the sha1 of "blob <length>\0" and its bytes, and must match its record:
// an edited copy, a recorded file missing, or a file no record names fails here.
// From spike-html-hosting-architecture (c4deeff): test/unit/content.test.ts.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import content from "../../content.json" with { type: "json" };

const dir = join(import.meta.dirname, "../..", "content");

/** The git blob hash of the bytes, as `git hash-object` computes it. */
function blob(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** Every file under content/, by its path from content/, with forward slashes. */
const files = readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) =>
    join(entry.parentPath, entry.name)
      .slice(dir.length + 1)
      .replaceAll("\\", "/"),
  )
  .sort();

describe("the copied tree", () => {
  test("names its source at a full commit", () => {
    assert.equal(content.url, `https://github.com/standards-lab/${content.repository}`);
    assert.match(content.commit, /^[0-9a-f]{40}$/);
  });

  test("holds every recorded file and no other", () => {
    assert.deepEqual(files, Object.keys(content.files).sort());
  });

  test("holds each file byte for byte as the source did at the commit", () => {
    for (const [path, hash] of Object.entries(content.files)) {
      assert.equal(blob(readFileSync(join(dir, path))), hash, `${path}'s blob hash`);
    }
  });
});
