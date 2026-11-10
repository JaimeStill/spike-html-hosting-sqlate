// The revised quick-start guide against its program: every file the guide writes in full is
// quick-start/'s copy, byte for byte, so the program the check vets, tests, and lints is the one
// the guide builds. A later step rewrites an earlier step's file in full, so the last block for
// a path is the file.
//
// scripts/guide.ts holds the rule that makes a block a file, which the recordings also read the
// guide by, each at its step.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { guideFiles } from "../../scripts/guide.ts";

const root = join(import.meta.dirname, "../..");

/** What keeps the guide's files from the program's, one line each: a file the program lacks, or
 * one whose text differs; read gives the program's file at a path, undefined when it has none. */
function mismatches(
  files: Map<string, string>,
  read: (path: string) => string | undefined,
): string[] {
  const problems: string[] = [];
  for (const [path, text] of files) {
    const program = read(path);
    if (program === undefined) problems.push(`the guide writes ${path}, which quick-start/ lacks`);
    else if (program !== text)
      problems.push(`the guide's ${path} differs from quick-start/${path}`);
  }
  return problems;
}

/** The program's file at path, undefined when quick-start/ has none. */
function program(path: string): string | undefined {
  const file = join(root, "quick-start", path);
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

test("every file the guide writes is the program's", () => {
  const files = guideFiles(readFileSync(join(root, "content/docs/quick-start.md"), "utf8"));
  assert.ok(
    files.has("main.go") && files.has("projects/projects.go"),
    "the guide writes no program",
  );
  assert.deepEqual(mismatches(files, program), []);
});

test("a captioned block is a file, and the last block of a path wins", () => {
  const guide = [
    "`a.go`:",
    "",
    "```go",
    "one",
    "```",
    "",
    "`a.go`:",
    "",
    "```go",
    "two",
    "",
    "```",
    "",
  ];
  assert.deepEqual(guideFiles(guide.join("\n")), new Map([["a.go", "two\n\n"]]));
});

test("through a step, the blocks of later steps are no file", () => {
  const guide = [
    "## 1. One",
    "",
    "`a.go`:",
    "",
    "```go",
    "one",
    "```",
    "",
    "## 2. Two",
    "",
    "`a.go`:",
    "",
    "```go",
    "two",
    "```",
    "",
    "`b.go`:",
    "",
    "```go",
    "b",
    "```",
    "",
  ];
  assert.deepEqual(guideFiles(guide.join("\n"), 1), new Map([["a.go", "one\n"]]));
  assert.deepEqual(
    guideFiles(guide.join("\n")),
    new Map([
      ["a.go", "two\n"],
      ["b.go", "b\n"],
    ]),
  );
});

test("shell blocks, output, and blocks a sentence introduces are no file", () => {
  const guide = [
    "```sh",
    "mise run program",
    "```",
    "",
    "```",
    "schema version 1",
    "```",
    "",
    "Save it as `teams/statements/touch.sql`:",
    "",
    "```sql",
    "SELECT 1",
    "```",
    "",
    "A caption inside a paragraph",
    "`b.go`:",
    "",
    "```go",
    "fragment",
    "```",
    "",
  ];
  assert.deepEqual(guideFiles(guide.join("\n")), new Map());
});

test("a caption inside a block captions nothing", () => {
  const guide = ["````md", "`c.go`:", "", "```go", "inner", "```", "````", ""];
  assert.deepEqual(guideFiles(guide.join("\n")), new Map());
});

test("a file the program lacks, or one that differs, fails naming it", () => {
  const files = new Map([
    ["kept.go", "same\n"],
    ["changed.go", "guide\n"],
    ["missing.go", "x\n"],
  ]);
  const program = new Map([
    ["kept.go", "same\n"],
    ["changed.go", "program\n"],
  ]);
  assert.deepEqual(
    mismatches(files, (path) => program.get(path)),
    [
      "the guide's changed.go differs from quick-start/changed.go",
      "the guide writes missing.go, which quick-start/ lacks",
    ],
  );
});
