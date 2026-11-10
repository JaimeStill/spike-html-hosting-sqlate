// The revised quick-start guide against its program: every file the guide writes in full is
// quick-start/'s copy, byte for byte, so the program the check vets, tests, and lints is the one
// the guide builds. A later step rewrites an earlier step's file in full, so the last block for
// a path is the file.
//
// The rule that makes a block a file: the paragraph before the fence is the file's path alone,
// in backticks, followed by a colon (`main.go`:), with a blank line on each side. Every other
// block is no file: a shell block, a program's output, the fragment a sentence introduces, and
// the statement step 10 plants and removes, which a sentence names in its own words.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../..");

/** A caption: a file's path alone, in backticks, and a colon. */
const caption = /^`([^`\s]+)`:$/;

/** Each file the guide's Markdown writes in full, by its path, its last block's text; throws on
 * a fence left open. */
function guideFiles(markdown: string): Map<string, string> {
  const lines = markdown.split("\n");
  const files = new Map<string, string>();
  /** The path the last paragraph captioned, while only blank lines follow it. */
  let captioned: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== undefined) {
      const open = i;
      do i++;
      while (i < lines.length && !new RegExp(`^${fence}${fence[0]}*\\s*$`).test(lines[i]));
      if (i === lines.length) throw new Error(`the fence on line ${open + 1} is never closed`);
      if (captioned !== undefined) files.set(captioned, lines.slice(open + 1, i).join("\n") + "\n");
      captioned = undefined;
      continue;
    }
    if (line === "") continue;
    const alone = (i === 0 || lines[i - 1] === "") && lines[i + 1] === "";
    captioned = alone ? caption.exec(line)?.[1] : undefined;
  }
  return files;
}

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
