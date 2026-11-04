// The leftover check: eslint.config.js's block over dist/, run on small fixtures of built output in
// a scratch directory of TMPDIR, removed after. It fails on a build that still holds a CSS module
// script, in each form one takes (a static import, an export-from, an export-all, and an
// import()), and passes on one whose sheets the build rewrote, look-alikes included.
// Adapted from spike-html-apps-foundation (d5037b4): test/unit/layers.test.ts, its ESLint run in a
// scratch directory.
// From spike-html-hosting (cb0511c): test/unit/leftover.test.ts.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";

const root = join(import.meta.dirname, "../..");

/** One message ESLint reports, as -f json writes it. */
interface Message {
  ruleId: string | null;
  fatal?: boolean;
  line: number;
}

/** Writes the files, each under dist/ by its path, into dir, and lints dir's dist/ with the
 * repository's config, as the check does; resolves to each linted file's messages by its path. */
function lint(dir: string, files: Record<string, string>): Record<string, Message[]> {
  for (const [path, text] of Object.entries(files)) {
    const file = join(dir, "dist", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const eslint = join(root, "node_modules", ".bin", "eslint");
  const run = spawnSync(eslint, ["-c", join(root, "eslint.config.js"), "-f", "json", "dist"], {
    cwd: dir,
    encoding: "utf8",
  });
  if (run.error) throw new Error(`eslint didn't run: ${run.error}`);
  if (run.status !== 0 && run.status !== 1) {
    throw new Error(`eslint exited ${run.status}: ${run.stderr}`);
  }
  const report: { filePath: string; messages: Message[] }[] = JSON.parse(run.stdout);
  return Object.fromEntries(
    report.map(({ filePath, messages }) => [
      filePath.slice(join(dir, "dist").length + 1),
      messages,
    ]),
  );
}

/** Each form a CSS module script takes in minified output, one a line, with its attribute's key
 * bare or quoted. */
const leftovers = [
  'import s from"./a.css"with{type:"css"};',
  'import t from"./a.css"with{"type":"css"};',
  'export{default as u}from"./b.css"with{type:"css"};',
  'export*from"./c.css"with{type:"css"};',
  'import("./d.css",{with:{type:"css"}});',
  'import("./e.css",{"with":{"type":"css"}});',
];

/** Built output with no CSS module script: the rewritten sheet, a constructed CSSStyleSheet, and
 * imports that look like one but aren't, another attribute, an import() of a module, and a .css
 * import without the attribute. */
const clean = [
  "var s=new CSSStyleSheet;s.replaceSync(`@layer foundation.theme-menu{}`);export{s as t};",
  'import j from"./x.json"with{type:"json"};',
  'import("./y.js");import("./z.js",{with:{type:"json"}});',
  'import"./z.css";export{a}from"./a.js";',
];

describe("the leftover check", () => {
  let scratch: string;
  let found: Record<string, Message[]>;
  before(() => {
    scratch = mkdtempSync(join(tmpdir(), "leftover-"));
    found = lint(scratch, {
      "assets/leftover.js": leftovers.join("\n"),
      "assets/clean.js": clean.join("\n"),
    });
  });
  after(() => rmSync(scratch, { recursive: true, force: true }));

  test("lints every .js file the build holds, each parsing", () => {
    assert.deepEqual(Object.keys(found).sort(), ["assets/clean.js", "assets/leftover.js"]);
    assert.deepEqual(
      Object.values(found)
        .flat()
        .filter((m) => m.fatal),
      [],
    );
  });

  test("fails on a build still holding a CSS module script, in every form", () => {
    assert.deepEqual(
      found["assets/leftover.js"].map(({ ruleId, line }) => [ruleId, line]),
      leftovers.map((_, i) => ["no-restricted-syntax", i + 1]),
    );
  });

  test("passes on a build whose sheets were rewritten", () => {
    assert.deepEqual(found["assets/clean.js"], []);
  });
});
