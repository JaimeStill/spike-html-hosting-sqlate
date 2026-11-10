// The quick-start's recordings against their inputs: each WebM in tapes/ is rendered from its
// tape, the program as the guide has it at its step, and the rendering tools' pins as they are
// now, by the input hash mise run tapes recorded for it in tapes/rendered.json. The check reads
// no network and never renders: a recording whose inputs changed fails here, named, until mise
// run tapes renders it again. The fixtures change one input in memory and prove the failure names
// each recording it stales, and no other.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  checkRecordings,
  inputs,
  placeRecordings,
  programAt,
  recordings,
  stepOf,
} from "../../scripts/recordings.ts";
import type { Inputs, Recording } from "../../scripts/recordings.ts";

const root = join(import.meta.dirname, "../..");

/** The stale line checkRecordings gives for a recording. */
function stale(recording: Recording): string {
  return (
    `tapes/${recording.name}.webm is stale: its tape, the program at step ${stepOf(recording)}, ` +
    "or a pin changed since it was rendered; run mise run tapes"
  );
}

/** Each recording's inputs as they are, changed by change for those it returns true for. */
function changed(change: (recording: Recording, inputs: Inputs) => boolean) {
  return (recording: Recording) => {
    const read = inputs(root, recording);
    const copy = { ...read, program: new Map(read.program), pins: { ...read.pins } };
    return change(recording, copy) ? copy : read;
  };
}

test("every recording is rendered from its inputs as they are", () => {
  assert.deepEqual(checkRecordings(root), []);
});

test("a tape's changed byte fails naming its recording, and no other", () => {
  const lint = recordings.find((recording) => recording.name === "step-10-lint")!;
  const read = changed((recording, inputs) => {
    if (recording !== lint) return false;
    inputs.tape = Buffer.from(inputs.tape);
    inputs.tape[inputs.tape.length - 2] ^= 1;
    return true;
  });
  assert.deepEqual(checkRecordings(root, read), [stale(lint)]);
});

test("a program file stales each recording whose step has it, and no other", () => {
  const read = changed((_, inputs) => {
    if (!inputs.program.has("projects/sql_test.go")) return false;
    inputs.program.set("projects/sql_test.go", Buffer.from("package projects_test\n"));
    return true;
  });
  assert.deepEqual(
    checkRecordings(root, read),
    recordings.filter((recording) => stepOf(recording) === 12).map(stale),
  );
});

test("a pin's bump stales every recording", () => {
  const read = changed((_, inputs) => {
    inputs.pins.ffmpeg = "9.0.3";
    return true;
  });
  assert.deepEqual(checkRecordings(root, read), recordings.map(stale));
});

test("a recording with no hash, or a hash for none, fails naming it", () => {
  const rendered = JSON.parse(readFileSync(join(root, "tapes/rendered.json"), "utf8"));
  delete rendered["step-09-sql"];
  rendered["step-99-gone"] = "0".repeat(64);
  assert.deepEqual(checkRecordings(root, undefined, rendered), [
    "tapes/step-09-sql.webm has no input hash in tapes/rendered.json; run mise run tapes",
    "tapes/rendered.json names step-99-gone, no recording",
  ]);
});

test("the program at a step is the guide's through it, quick-start/'s at the last", () => {
  const nine = programAt(root, 9);
  assert.ok(!nine.has("projects/projects.go"), "step 9's program has step 12's projects");
  assert.ok(!nine.has("sqlint.toml"), "step 9's program has step 10's sqlint.toml");
  assert.ok(nine.has("go.sum"), "step 9's program lacks go.sum, which the guide never writes");
  assert.notDeepEqual(nine.get("main.go"), readFileSync(join(root, "quick-start/main.go")));
  const twelve = programAt(root, 12);
  for (const [path, data] of twelve) {
    assert.deepEqual(data, readFileSync(join(root, "quick-start", path)), path);
  }
});

/** A recording of the fixture page's step 2, running mise run sql. */
const sql: Recording = {
  name: "step-02-sql",
  heading: "2-run",
  command: "mise run sql",
  label: "Recording",
  database: false,
};

/** A page whose step 2 runs mise run sql twice, each with its output, before step 3. */
const page = [
  '<h2 id="1-write">1. Write</h2>',
  "<pre><code>mise run sql</code></pre>",
  "<pre><code>one</code></pre>",
  '<h2 id="2-run">2. Run</h2>',
  '<pre class="shiki"><code><span>mise</span><span> run</span><span> sql</span></code></pre>',
  "<pre><code>first</code></pre>",
  "<p>Again, which prints:</p>",
  "<pre><code>mise run sql</code></pre>",
  "<p>The output:</p>",
  "<pre><code>second &amp; last</code></pre>",
  "<p>After.</p>",
  '<h2 id="3-end">3. End</h2>',
  "<pre><code>mise run sql</code></pre>",
  "<pre><code>three</code></pre>",
].join("\n");

test("a recording follows the output of its step's last run of its command", () => {
  const placed = placeRecordings(page, new Map([[sql, "<figure></figure>"]]));
  assert.equal(
    placed,
    page.replace(
      "<pre><code>second &amp; last</code></pre>",
      "<pre><code>second &amp; last</code></pre>\n<figure></figure>",
    ),
  );
});

test("a heading, a command, or an output the page lacks fails naming the recording", () => {
  const figures = (recording: Recording) => new Map([[recording, "<figure></figure>"]]);
  assert.throws(
    () => placeRecordings(page, figures({ ...sql, heading: "2-gone" })),
    /the page has no heading 2-gone for step-02-sql/,
  );
  assert.throws(
    () => placeRecordings(page, figures({ ...sql, command: "mise run lint" })),
    /2-run runs no mise run lint for step-02-sql/,
  );
  assert.throws(
    () =>
      placeRecordings(page.replace("<pre><code>second &amp; last</code></pre>", ""), figures(sql)),
    /2-run shows no output after mise run sql for step-02-sql/,
  );
});
