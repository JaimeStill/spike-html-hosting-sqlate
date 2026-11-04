// The copied tree's provenance, with the SDK's content check: content.json records the source
// repository, the commit the tree was copied at, and each copied file's git blob hash at that
// commit, and each file in content/ must match its record. An edited copy, a recorded file
// missing, a file no record names, or a source named by anything but a GitHub repository URL and
// a full commit fails here.
// Adapted from spike-html-hosting-architecture (27d70e1): test/unit/content.test.ts, its check the
// SDK's.
// From spike-html-hosting-sdk (v0.1.0): template/test/unit/content.test.ts.

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { checkContent } from "@jaimestill/spike-html-hosting-sdk/content.js";

test("the copied tree is its record", () => {
  assert.deepEqual(checkContent(join(import.meta.dirname, "../..")), []);
});
