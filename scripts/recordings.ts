// The revised quick-start's recordings: five terminal sessions, each a VHS tape in tapes/ that
// mise run tapes (scripts/tapes.ts) renders after tapes/settings.tape, the settings they share, to
// a WebM beside it and a WebP poster, its last frame, run in a clean copy of the program as the
// guide has it at the step the recording shows, and the build's recordingPages plugin places each
// under that step in the built page. recordings, the manifest, names each one's step by its
// heading's id, and the command whose output it follows. tapes/README.md holds the practices the
// tapes follow, and checkTape the ones a tape's text shows.
//
// A recording's inputs are its tape, the shared settings, the program it runs, and the pins of the
// tools that render it: vhs, ttyd, and ffmpeg, which mise.tapes.toml pins for mise run tapes
// alone, and go and chrome-headless-shell, mise.toml's. The program at a step is quick-start/ with each file the
// guide writes at its last block through that step, and without each file the guide first writes
// after it, so go.mod and go.sum, which the guide never writes, are quick-start/'s at every step.
// mise run tapes writes each recording's input hash to tapes/rendered.json as it renders it, and
// checkRecordings, which the unit tier runs, recomputes every hash offline and names each
// recording whose inputs changed since; the check never renders.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, relative } from "node:path";

import { normalizePath } from "vite";
import type { Plugin } from "vite";

import { guideFiles } from "./guide.ts";
import { escape } from "./revised.ts";

/** One recording: its tape, tapes/<name>.tape, and where the build places its WebM and poster. */
export interface Recording {
  /** The tape's, the WebM's, and the poster's name in tapes/, and the WebM's and the poster's in
   * the built site's recordings/. */
  name: string;
  /** The id of the step's heading in the built quick-start; its leading number is the step. */
  heading: string;
  /** The shell command the recording runs: the build places it after the output that follows
   * the step's last block running it. */
  command: string;
  /** What the recording shows, its figure's caption and its video's accessible name. */
  label: string;
  /** Whether it runs against PostgreSQL, which mise run tapes starts before it and drops after. */
  database: boolean;
}

/** The recordings, in the guide's order. */
export const recordings: Recording[] = [
  {
    name: "step-09-sql",
    heading: "9-test-without-a-database",
    command: "go test -C teams -run TestSQL",
    label: "Recording: the teams' TestSQL prints the list read as the library composes it.",
    database: false,
  },
  {
    name: "step-10-lint",
    heading: "10-lint-the-sql",
    command: "mise run lint",
    label:
      "Recording: mise run lint passes, fails with two findings once touch.sql is written, and " +
      "passes again once it is removed.",
    database: false,
  },
  {
    name: "step-11-program",
    heading: "11-write-the-seed-the-store-layer-the-work-and-the-program",
    command: "mise run program",
    label:
      "Recording: mise run program against PostgreSQL, its output in two screens: the reads, " +
      "then the writes and the four errors the teams' work ends on.",
    database: true,
  },
  {
    name: "step-12-sql",
    heading: "12-scope-by-organization",
    command: "go test -C projects -run TestSQL/next",
    label:
      "Recording: the projects' TestSQL prints archive on PostgreSQL with its four patterns " +
      "spliced, then the counted first page, then the next page's keyset, a screen each.",
    database: false,
  },
  {
    name: "step-12-program",
    heading: "12-scope-by-organization",
    command: "mise run program",
    label:
      "Recording: mise run program against PostgreSQL, its first line, schema version 2, and its " +
      "last twelve, the projects' lines and the reverted migration.",
    database: true,
  },
];

/** The guide's step a recording shows, its heading id's leading number. */
export function stepOf(recording: Recording): number {
  const step = Number(/^(\d+)-/.exec(recording.heading)?.[1]);
  if (!Number.isInteger(step)) throw new Error(`recordings: ${recording.heading} names no step`);
  return step;
}

/** A recording's tape, under root. */
export function tapeFile(root: string, recording: Recording): string {
  return join(root, "tapes", `${recording.name}.tape`);
}

/** A recording's rendered WebM, under root. */
export function webmFile(root: string, recording: Recording): string {
  return join(root, "tapes", `${recording.name}.webm`);
}

/** A recording's poster, its WebM's last frame as WebP, under root. */
export function posterFile(root: string, recording: Recording): string {
  return join(root, "tapes", `${recording.name}.webp`);
}

/** The settings every tape shares, which mise run tapes puts ahead of each, under root. */
export function settingsFile(root: string): string {
  return join(root, "tapes", "settings.tape");
}

/** The file mise run tapes records each recording's input hash in, by its name. */
export function renderedFile(root: string): string {
  return join(root, "tapes", "rendered.json");
}

/** The input hash of each recording rendered, by its name; none before the first render. */
export function readRendered(root: string): Record<string, string> {
  const file = renderedFile(root);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

/** The program as the guide has it at a step, by each file's path under quick-start/. */
export function programAt(root: string, step: number): Map<string, Buffer> {
  const dir = join(root, "quick-start");
  const files = new Map<string, Buffer>();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    files.set(normalizePath(relative(dir, file)), readFileSync(file));
  }
  const guide = readFileSync(join(root, "content/docs/quick-start.md"), "utf8");
  const written = guideFiles(guide, step);
  for (const path of guideFiles(guide).keys()) {
    if (!written.has(path)) files.delete(path);
  }
  for (const [path, text] of written) files.set(path, Buffer.from(text));
  return files;
}

/** The string value of key in a TOML file's table, as mise's config writes a pin: the table's
 * header alone on its line, and the key, bare or quoted, then = and a quoted string. */
function tomlString(file: string, table: string, key: string): string {
  let inTable = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const header = /^\[(.+)\]\s*$/.exec(line)?.[1];
    if (header !== undefined) {
      inTable = header === table;
      continue;
    }
    const pin = inTable ? /^("[^"]+"|[\w-]+)\s*=\s*"([^"]*)"/.exec(line) : null;
    if (pin !== null && pin[1].replace(/^"|"$/g, "") === key) return pin[2];
  }
  throw new Error(`recordings: ${file} has no ${table} ${key}`);
}

/** The pins of the tools that render a recording, by each tool's name. */
export function pins(root: string): Record<string, string> {
  const tapes = join(root, "mise.tapes.toml");
  const site = join(root, "mise.toml");
  return {
    vhs: tomlString(tapes, "tools", "aqua:charmbracelet/vhs"),
    ttyd: tomlString(tapes, "tools", "aqua:tsl0922/ttyd"),
    ffmpeg: tomlString(tapes, "tools", "conda:ffmpeg"),
    go: tomlString(site, "tools", "go"),
    "chrome-headless-shell": tomlString(site, 'tools."http:chrome-headless-shell"', "version"),
  };
}

/** What a recording is rendered from. */
export interface Inputs {
  /** Its tape's bytes. */
  tape: Buffer;
  /** The shared settings' bytes. */
  settings: Buffer;
  /** The program it runs, by each file's path. */
  program: Map<string, Buffer>;
  /** The rendering tools' pins, by each tool's name. */
  pins: Record<string, string>;
}

/** A recording's inputs, read from root. */
export function inputs(root: string, recording: Recording): Inputs {
  return {
    tape: readFileSync(tapeFile(root, recording)),
    settings: readFileSync(settingsFile(root)),
    program: programAt(root, stepOf(recording)),
    pins: pins(root),
  };
}

/** The sha256 of a recording's inputs, each named and length-prefixed, the program's files and
 * the pins in sorted order, so no two different inputs run together into the same bytes. */
export function inputHash({ tape, settings, program, pins }: Inputs): string {
  const hash = createHash("sha256");
  const field = (name: string, data: Buffer | string) => {
    hash.update(`${name} ${Buffer.byteLength(data)}\n`);
    hash.update(data);
    hash.update("\n");
  };
  const sorted = <T>(entries: [string, T][]) => entries.sort(([a], [b]) => (a < b ? -1 : 1));
  field("tape", tape);
  field("settings", settings);
  for (const [path, data] of sorted([...program])) field(`program ${path}`, data);
  for (const [tool, version] of sorted(Object.entries(pins))) field(`pin ${tool}`, version);
  return hash.digest("hex");
}

/** What keeps the recordings from their inputs, one line each, naming the recording: a WebM or
 * its poster missing, a hash tapes/rendered.json lacks, or one its inputs no longer hash to; and a hash for
 * a recording the manifest doesn't list. None when every recording is rendered from its inputs
 * as they are. read gives a recording's inputs, from root by default. */
export function checkRecordings(
  root: string,
  read: (recording: Recording) => Inputs = (recording) => inputs(root, recording),
  rendered: Record<string, string> = readRendered(root),
): string[] {
  const problems: string[] = [];
  for (const recording of recordings) {
    const webm = posix.join("tapes", `${recording.name}.webm`);
    if (!existsSync(webmFile(root, recording))) {
      problems.push(`${webm} is missing; run mise run tapes`);
    } else if (!existsSync(posterFile(root, recording))) {
      problems.push(
        `tapes/${recording.name}.webp, ${webm}'s poster, is missing; run mise run tapes`,
      );
    } else if (rendered[recording.name] === undefined) {
      problems.push(`${webm} has no input hash in tapes/rendered.json; run mise run tapes`);
    } else if (inputHash(read(recording)) !== rendered[recording.name]) {
      problems.push(
        `${webm} is stale: its tape, the settings, the program at step ${stepOf(recording)}, ` +
          "or a pin changed since it was rendered; run mise run tapes",
      );
    }
  }
  const named = new Set(recordings.map((recording) => recording.name));
  for (const name of Object.keys(rendered)) {
    if (!named.has(name)) problems.push(`tapes/rendered.json names ${name}, no recording`);
  }
  return problems;
}

/** The terminal's size, the shared settings' Set Width and Set Height, which the video's width
 * and height attributes give, so the page reserves its box before the metadata loads. */
function tapeSize(tape: string): { width: number; height: number } {
  const set = (name: string) => {
    const value = Number(new RegExp(`^Set ${name} (\\d+)$`, "m").exec(tape)?.[1]);
    if (!Number.isInteger(value)) throw new Error(`recordings: a tape sets no ${name}`);
    return value;
  };
  return { width: set("Width"), height: set("Height") };
}

/** A recording's figure: its video, served from the base's recordings/, its poster beside it,
 * muted, with controls, inline, and named by its caption. It preloads nothing: the poster shows
 * the recording's last frame until the reader plays it, so the page fetches no video it isn't
 * asked for, and Chrome never cancels a metadata fetch part way, a failed request to the crawl.
 * settings is the shared settings' text. */
export function figure(recording: Recording, base: string, settings: string): string {
  const { width, height } = tapeSize(settings);
  const id = `recording-${recording.name}`;
  const src = (type: string) => escape(`${base}recordings/${recording.name}.${type}`);
  return (
    `<figure class="recording">` +
    `<video src="${src("webm")}" poster="${src("webp")}" width="${width}" ` +
    `height="${height}" muted controls playsinline preload="none" aria-labelledby="${id}">` +
    `</video><figcaption id="${id}">${escape(recording.label)}</figcaption></figure>`
  );
}

/** Each pre element's start and end, past its closing tag, in html from start to end, with its
 * text, its tags dropped and its entities read. */
function preBlocks(html: string, start: number, end: number) {
  const blocks: { start: number; end: number; text: string }[] = [];
  for (const match of html.slice(start, end).matchAll(/<pre[\s>][\s\S]*?<\/pre>/g)) {
    const text = match[0]
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    blocks.push({ start: start + match.index, end: start + match.index + match[0].length, text });
  }
  return blocks;
}

/** The page's html with each recording's figure placed in its step: after the output block that
 * follows the step's last block whose lines include the recording's command. figures gives each
 * recording's figure. Throws naming the recording when its heading, its command, or the output
 * after it isn't on the page. */
export function placeRecordings(
  html: string,
  figures: Map<Recording, string>,
  page = "the page",
): string {
  let placed = html;
  for (const [recording, markup] of figures) {
    const heading = placed.indexOf(`<h2 id="${recording.heading}"`);
    if (heading < 0) {
      throw new Error(
        `recordings: ${page} has no heading ${recording.heading} for ${recording.name}`,
      );
    }
    const next = placed.indexOf("<h2", heading + 1);
    const blocks = preBlocks(placed, heading, next < 0 ? placed.length : next);
    const command = blocks.findLastIndex((block) =>
      block.text.split("\n").some((line) => line.trim() === recording.command),
    );
    if (command < 0) {
      throw new Error(
        `recordings: ${page}'s ${recording.heading} runs no ${recording.command} for ${recording.name}`,
      );
    }
    const output = blocks[command + 1];
    if (output === undefined) {
      throw new Error(
        `recordings: ${page}'s ${recording.heading} shows no output after ${recording.command} ` +
          `for ${recording.name}`,
      );
    }
    placed = `${placed.slice(0, output.end)}\n${markup}${placed.slice(output.end)}`;
  }
  return placed;
}

/** The figures' style: each video as wide as main and no wider, its height kept to its ratio. */
const style =
  "<style>figure.recording{margin:1.5rem 0}" +
  "figure.recording video{display:block;inline-size:100%;block-size:auto;border-radius:0.375rem;" +
  "outline:1px solid color-mix(in srgb,currentColor 20%,transparent)}" +
  "figure.recording figcaption{margin-block-start:0.5rem;font-size:0.875em}</style>";

/** The plugin: the quick-start's built page, docs/quick-start.html, holds each recording's figure
 * under its step, its head the figures' style, and the build writes each WebM and its poster to
 * recordings/ under the base; fails the build when a recording's WebM or poster is missing, when placeRecordings can't
 * place one, or when the build writes no quick-start page. */
export function recordingPages(): Plugin {
  const page = "docs/quick-start.html";
  let root = "";
  let base = "/";
  let placed = false;
  return {
    name: "site:recording-pages",
    apply: "build",
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    buildStart() {
      placed = false;
      for (const recording of recordings) {
        for (const file of [webmFile(root, recording), posterFile(root, recording)]) {
          if (!existsSync(file)) {
            throw new Error(
              `recordings: ${normalizePath(relative(root, file))} is missing; run mise run tapes`,
            );
          }
        }
      }
    },
    transformIndexHtml: {
      order: "post",
      handler(html, { filename }) {
        if (normalizePath(relative(root, filename)) !== page) return html;
        const figures = new Map(
          recordings.map((recording) => [
            recording,
            figure(recording, base, readFileSync(settingsFile(root), "utf8")),
          ]),
        );
        placed = true;
        return placeRecordings(html, figures, page).replace("</head>", `${style}</head>`);
      },
    },
    generateBundle() {
      for (const recording of recordings) {
        this.emitFile({
          type: "asset",
          fileName: `recordings/${recording.name}.webm`,
          source: readFileSync(webmFile(root, recording)),
        });
        this.emitFile({
          type: "asset",
          fileName: `recordings/${recording.name}.webp`,
          source: readFileSync(posterFile(root, recording)),
        });
      }
    },
    closeBundle() {
      if (!placed) throw new Error(`recordings: the build wrote no ${page}`);
    },
  };
}

/** The README that states the tapes' practices, under root. */
export function practicesFile(root: string): string {
  return join(root, "tapes", "README.md");
}

/** The typing speed's range, in milliseconds, that tapes/README.md states. */
export const typing = { min: 25, max: 35 };

/** The pause after an output of lines lines, in seconds, as tapes/README.md states it: a second,
 * and a second for every three lines, at least 2 and at most 8. */
export function pause(lines: number): number {
  return Math.min(8, Math.max(2, 1 + Math.ceil(lines / 3)));
}

/** A VHS duration, 5s or 500ms, in milliseconds; NaN when it is neither. */
function duration(text: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(text);
  if (match === null) return NaN;
  return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
}

/** What keeps the shared settings from tapes/README.md's practices, one line each: a setting the
 * README gives, as `Set Name value`, that settings.tape doesn't declare as given, or one it
 * declares that the README doesn't give; and a typing speed outside the range. */
export function checkSettings(settings: string, readme: string): string[] {
  const declared = new Set(settings.split("\n").filter((line) => line.startsWith("Set ")));
  const documented = new Set([...readme.matchAll(/`(Set \w+ [^`]+)`/g)].map((match) => match[1]));
  const problems: string[] = [];
  for (const line of documented) {
    if (!declared.has(line)) problems.push(`tapes/settings.tape doesn't declare ${line}`);
  }
  for (const line of declared) {
    if (!documented.has(line)) problems.push(`tapes/README.md doesn't give ${line}`);
  }
  const speed = duration(/^Set TypingSpeed (\S+)$/m.exec(settings)?.[1] ?? "");
  if (!(speed >= typing.min && speed <= typing.max)) {
    problems.push(`tapes/settings.tape's TypingSpeed isn't ${typing.min}ms to ${typing.max}ms`);
  }
  return problems;
}

/** What keeps a recording's tape from tapes/README.md's practices that its text shows, one line
 * each, naming the tape and its line: a setting of its own, which belongs to settings.tape; a
 * scroll; a typing speed outside the range; a Sleep that isn't the pause after an output, the
 * line before it "# Output: N lines." and the one before that a Wait, or that isn't pause(N)
 * long; a Hide left unshown, or a Show with no Hide; and a tape that doesn't end on a pause. */
export function checkTape(name: string, tape: string): string[] {
  const problems: string[] = [];
  const lines = tape.split("\n");
  const at = (i: number, problem: string) =>
    problems.push(`tapes/${name}.tape:${i + 1}: ${problem}`);
  /** The nearest line before i that isn't blank, and its index. */
  const before = (i: number) => {
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === "") j--;
    return { j, line: j >= 0 ? lines[j] : "" };
  };
  let hidden = false;
  let last = -1;
  for (const [i, line] of lines.entries()) {
    const command = /^(\w+)(@\S+)?/.exec(line)?.[1];
    if (command === undefined) continue;
    last = i;
    if (command === "Set") at(i, "sets its own setting; the shared ones are tapes/settings.tape's");
    if (/^(Scroll\w*|Page\w*)$/.test(command)) at(i, `scrolls (${command}); fit each output whole`);
    const speed = /^Type@(\S+)/.exec(line)?.[1];
    if (speed !== undefined && !(duration(speed) >= typing.min && duration(speed) <= typing.max)) {
      at(i, `types at ${speed}, outside ${typing.min}ms to ${typing.max}ms`);
    }
    if (command === "Hide") {
      if (hidden) at(i, "hides again before a Show");
      hidden = true;
    }
    if (command === "Show") {
      if (!hidden) at(i, "shows with no Hide before it");
      hidden = false;
    }
    if (command === "Sleep") {
      const note = before(i);
      const count = /^# Output: (\d+) lines?\.$/.exec(note.line)?.[1];
      if (count === undefined || before(note.j).line !== "Wait") {
        at(i, 'sleeps other than after a Wait and its "# Output: N lines." note');
      } else if (duration(line.slice("Sleep ".length)) !== pause(Number(count)) * 1000) {
        at(i, `pauses other than ${pause(Number(count))}s after ${count} lines of output`);
      }
    }
  }
  if (hidden) problems.push(`tapes/${name}.tape: hides and never shows again`);
  if (last < 0 || !lines[last].startsWith("Sleep")) {
    problems.push(`tapes/${name}.tape: ends on no pause after its last output`);
  }
  return problems;
}
