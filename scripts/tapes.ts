// mise run tapes: renders each recording whose inputs changed since its last render, or that has
// none, and each one named on the command line regardless, with the vhs, ttyd, and ffmpeg
// mise.tapes.toml pins and mise.toml's chrome-headless-shell, writing its WebM to tapes/, its
// poster, the WebM's last frame as WebP, extracted by the pinned ffmpeg, beside it, and its input
// hash to tapes/rendered.json (scripts/recordings.ts). The task runs it under
// MISE_ENV=tapes, so mise which finds the tapes' tools, which no other task installs.
//
// VHS reads one tape: each recording's is tapes/settings.tape, the settings every tape shares,
// then the recording's own tape, written to the scratch directory. Each recording runs in a clean
// copy of the program as the guide has it at its step, in a
// scratch directory under TMPDIR removed after, so a file the tape writes or a database's state
// never reaches quick-start/. A recording against PostgreSQL has the copy's compose.yml started
// before its tape and dropped with its volume after, so the tape starts on an empty database and
// shows none of it. VHS finds its browser by go-rod's lookup, chrome first on PATH: a shim
// directory holding chrome, a link to the pinned chrome-headless-shell, leads PATH for the render
// alone, with the pinned vhs, ttyd, and ffmpeg after it. The tapes' Go reads the module cache
// alone, as the check's does, and runs every test afresh, never printing a cached result.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

import {
  inputHash,
  inputs,
  posterFile,
  programAt,
  readRendered,
  recordings,
  renderedFile,
  settingsFile,
  stepOf,
  tapeFile,
  webmFile,
} from "./recordings.ts";
import type { Recording } from "./recordings.ts";

const root = join(import.meta.dirname, "..");

/** The pinned tool's binary, by mise which under the task's MISE_ENV. */
function which(bin: string): string {
  return execFileSync("mise", ["which", bin], { cwd: root, encoding: "utf8" }).trim();
}

/** Runs a command in dir, its output the terminal's; throws when it fails. */
function run(dir: string, command: string, args: string[], env = process.env) {
  execFileSync(command, args, { cwd: dir, stdio: "inherit", env });
}

const names = process.argv.slice(2);
const unknown = names.filter((name) => !recordings.some((recording) => recording.name === name));
if (unknown.length > 0) throw new Error(`tapes: no recording is named ${unknown.join(", ")}`);

const rendered = readRendered(root);
const hashes = new Map(
  recordings.map((recording) => [recording, inputHash(inputs(root, recording))]),
);
const due = recordings.filter(
  (recording) =>
    names.includes(recording.name) || rendered[recording.name] !== hashes.get(recording),
);
if (due.length === 0) {
  console.log("tapes: every recording is rendered from its inputs; nothing to render");
  process.exit(0);
}

const scratch = mkdtempSync(join(tmpdir(), "sqlate-tapes-"));
try {
  const shim = join(scratch, "bin");
  mkdirSync(shim);
  symlinkSync(which("chrome-headless-shell"), join(shim, "chrome"));
  const tools = ["vhs", "ttyd", "ffmpeg"].map((bin) => dirname(which(bin)));
  const vhs = which("vhs");
  const ffmpeg = which("ffmpeg");
  const settings = readFileSync(settingsFile(root), "utf8");

  /** Renders one recording in its own copy of the program, named teams as the guide's is. */
  const render = (recording: Recording) => {
    const dir = join(scratch, recording.name, "teams");
    for (const [path, data] of programAt(root, stepOf(recording))) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), data);
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: [shim, ...tools, process.env.PATH].join(delimiter),
      // The copy's mise.toml, which its tasks run from, trusted for the render alone.
      MISE_TRUSTED_CONFIG_PATHS: dir,
      GOWORK: "off",
      GOPROXY: "off",
      GOTOOLCHAIN: "local",
      GOFLAGS: "-count=1",
    };
    delete env.MISE_ENV;
    const tape = join(scratch, `${recording.name}.tape`);
    writeFileSync(tape, `${settings}\n${readFileSync(tapeFile(root, recording), "utf8")}`);
    console.log(`tapes: rendering ${recording.name}, the program at step ${stepOf(recording)}`);
    if (recording.database) run(dir, "docker", ["compose", "up", "-d", "--wait", "--build"]);
    try {
      run(dir, vhs, ["--quiet", tape, "--output", webmFile(root, recording)], env);
      // The poster: decoding the last half second, each frame overwrites the one before, so the
      // file holds the last. The image2 muxer writes one still; the webp muxer would animate
      // every frame. Quality 90 keeps the text sharp at half a lossless still's size.
      run(root, ffmpeg, [
        ...["-loglevel", "error", "-y", "-sseof", "-0.5", "-i", webmFile(root, recording)],
        ...["-f", "image2", "-update", "1", "-c:v", "libwebp", "-quality", "90"],
        posterFile(root, recording),
      ]);
    } finally {
      if (recording.database) run(dir, "docker", ["compose", "down", "-v"]);
    }
    rendered[recording.name] = hashes.get(recording)!;
    writeFileSync(renderedFile(root), JSON.stringify(rendered, null, 2) + "\n");
  };

  for (const recording of due) render(recording);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
