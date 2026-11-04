// mise run screenshots' command, the tooling's spike-html-apps-screenshots on
// scripts/screenshots.config.ts, run as the task runs it: the index alone, light alone, to the
// terminal, with TMPDIR a scratch directory of its own and node's compile cache, which writes
// there too, off. The run exits 0, prints each capture's file under that TMPDIR, and leaves it
// empty: none of the files, nor the directory it made for them. With --keep, the same run leaves
// them, so the first run's empty TMPDIR is the output's cleanup, not a capture that never wrote.
// The scratch directory is removed after.
// From spike-html-hosting-architecture (a09e7db): test/browser/screenshots.test.ts.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

const root = join(import.meta.dirname, "../..");

const scratch = mkdtempSync(join(tmpdir(), "screenshots-test."));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Runs the command on the index, light, to the terminal, with TMPDIR a fresh directory under the
 * scratch one and node's compile cache off; returns its exit status, its stderr, the capture files
 * it printed, and its TMPDIR's files after, each relative to it. */
function run(...flags: string[]): {
  status: number | null;
  stderr: string;
  printed: string[];
  left: string[];
} {
  const dir = mkdtempSync(join(scratch, "tmpdir."));
  const bin = join(root, "node_modules", ".bin", "spike-html-apps-screenshots");
  const args = ["scripts/screenshots.config.ts", "--page", "index", "--scheme", "light"];
  const { status, stdout, stderr } = spawnSync(bin, [...args, "--output", "terminal", ...flags], {
    cwd: root,
    env: { ...process.env, TMPDIR: dir, NODE_DISABLE_COMPILE_CACHE: "1" },
    encoding: "utf8",
  });
  const printed = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".png"));
  for (const path of printed) assert.ok(path.startsWith(`${dir}/`), `${path} is under ${dir}`);
  return {
    status,
    stderr,
    printed: printed.map((path) => path.slice(dir.length + 1)),
    left: readdirSync(dir, { recursive: true, encoding: "utf8" }),
  };
}

describe("mise run screenshots' command", () => {
  test("captures the index under TMPDIR and leaves nothing there", () => {
    const { status, stderr, printed, left } = run();
    assert.equal(status, 0, stderr);
    // The index's four states: whole, wide and narrow, and the theme menu open at each.
    for (const state of ["wide", "narrow", "theme-menu-wide", "theme-menu-narrow"]) {
      assert.ok(
        printed.some((path) => path.includes(`-index-${state}--`)),
        `a capture of index-${state} among ${printed}`,
      );
    }
    assert.deepEqual(left, [], "TMPDIR is left empty");
  });

  test("with --keep, leaves every capture file it printed", () => {
    const { status, stderr, printed, left } = run("--keep");
    assert.equal(status, 0, stderr);
    assert.ok(printed.length > 0, "it printed its captures");
    for (const path of printed) assert.ok(left.includes(path), `${path} is kept`);
  });
});
