# The quick-start's recordings

Each `.tape` here is a [VHS](https://github.com/charmbracelet/vhs) script for one terminal
session the revised quick-start shows under its step. `mise run tapes` renders every recording
whose inputs changed: `settings.tape`, then the recording's own tape, in a clean copy of the
program at its step, to `<name>.webm`, with its poster, `<name>.webp`, beside it, and its input
hash in `rendered.json`. `scripts/recordings.ts` names each recording's step and the output it
follows, and the build places it there.

## Practices

Every tape follows these. The unit tier checks the ones a tape's text shows, marked
**(checked)**; the rest are for whoever writes or reviews a tape.

### The terminal fits the column

The page's content column is about 712px wide at 1120px and at 1376px, and a recording plays at
that width, so the terminal is sized for it: 1000px wide, 20px text, which plays at about 14px,
legible without fullscreen. That holds 77 columns by 24 rows. The settings live in
`settings.tape` alone, which `mise run tapes` puts ahead of every tape, so a tape declares none
of its own **(checked)**, and `settings.tape` declares exactly these **(checked)**:

- `Set Shell bash`
- `Set FontFamily "CaskaydiaMono Nerd Font"`: the font the rendering machine must have
  installed.
- `Set FontSize 20`
- `Set Width 1000`
- `Set Height 640`
- `Set Padding 20`
- `Set Theme "zenwritten_dark"`
- `Set TypingSpeed 30ms`
- `Set Framerate 24`
- `Set WaitTimeout 120s`

### One theme, rendered once

Each recording is rendered once, in `zenwritten_dark`, and the same video plays under every site
theme, light or dark. It is one neutral dark theme that clashes with none of them: its background
is a pure grey, `#191919`, its foreground `#bbbbbb`, at 9.2:1, and its ANSI colours are muted,
each at least 5.2:1 on the background. Nothing is rendered per site theme.

### Only what the reader needs

A recording runs the commands the guide runs, narrowed to the part its step teaches: one test
or subtest at a time (`go test -C projects -run TestSQL/archive`) rather than every test. What
the program and its tests print is shaped for reading: short, labelled, aligned, and within the
77 columns wherever the program decides the line; a tool's own longer line wraps. A change to what the program prints goes into the guide's copy of its
file, and into the output the guide shows.

### One output per screen, with no scroll

Each output a reader sees fits the terminal whole. Nothing scrolls **(checked)**. An output
taller than the terminal is split into screens: a run's output kept in a file (`mise run program
> run.txt`) and shown in parts with `head` and `tail`, or one narrower command per screen. The
terminal is cleared between screens off camera, with `Hide`, `clear`, and `Show`.

### The pause fits the output

After each output the reader reads, the tape notes its size and pauses for it **(checked)**:

```
Wait
# Output: 12 lines.
Sleep 5s
```

The pause is a second, and a second for every three lines, rounded up, at least 2s and at most
8s: 2 lines pause 2s, 12 lines 5s, 19 lines 8s. Count the lines the output takes on the screen,
a wrapped line as two. A `Sleep` is only ever that pause: no leading `Sleep` before the first
command, none before an `Enter`, and none longer than the pause after the last output, which
the tape ends on **(checked)**. A command whose output the next one shows on the same screen, or
the typing of a file the reader watches, takes no pause.

### Typing speed

Commands are typed at 30ms a character, fast enough that typing never holds up the recording,
slow enough to follow. A `Type@` override stays within 25ms to 35ms **(checked)**.

### Hidden setup

Whatever the step doesn't teach happens off camera, between `Hide` and `Show` at the start: the
packages and tests compiled, so each run on camera prints at once, and the screen cleared.
Hidden time is not in the video. Every `Hide` is followed by a `Show` **(checked)**.

### A clean copy of the program at its step

`mise run tapes` renders each recording in a scratch copy of the program as the guide has it at
the recording's step, every file the guide writes through that step and none it writes later,
removed after. A file a tape writes, such as step 10's `touch.sql` or a `run.txt`, never reaches
`quick-start/`.

### The database off camera

A recording that runs against PostgreSQL has its copy's `compose.yml` started before the tape and
dropped with its volume after, so the tape starts on an empty database and shows none of it.

### The poster

Each video's poster is its recording's last frame, extracted by `mise run tapes` with the pinned
ffmpeg as a WebP still at quality 90 and committed beside it. A tape ends on its last output, so the poster
shows the recording's result. The poster is rendered with the video, so the input hash in
`rendered.json` holds both; the unit tier fails naming a recording whose poster is missing
**(checked)**, and the browser tier checks that each poster loads under the base.
