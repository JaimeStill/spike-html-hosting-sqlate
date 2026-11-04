// mise run screenshots' command, the tooling's spike-html-apps-screenshots on
// scripts/screenshots.config.ts, run once as the task runs it, with the SDK's capture run: the
// index, light, to the terminal, under a scratch TMPDIR. It leaves nothing there, and with --keep
// leaves what it printed, so the first run's empty TMPDIR is the output's cleanup, not a capture
// that never wrote.
// Adapted from spike-html-hosting-architecture (27d70e1): test/browser/screenshots.test.ts, its
// run and assertions the SDK's.
// From spike-html-hosting-sdk (v0.1.0): template/test/browser/screenshots.test.ts.

import { join } from "node:path";
import { describe, test } from "node:test";

import { keepsCaptures, leavesNoCapture } from "@jaimestill/spike-html-hosting-sdk/screenshots.js";

const root = join(import.meta.dirname, "../..");
const config = join(root, "scripts/screenshots.config.ts");

describe("mise run screenshots' command", () => {
  test("captures the index under TMPDIR and leaves nothing there", () => {
    leavesNoCapture(root, config);
  });

  test("with --keep, leaves every capture file it printed", () => {
    keepsCaptures(root, config);
  });
});
