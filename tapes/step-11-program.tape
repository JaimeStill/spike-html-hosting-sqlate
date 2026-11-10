# The quick-start's step 11, "Write the seed, the store layer, the work, and the program": mise
# run program against PostgreSQL, through the four errors the teams' work ends on. mise run tapes
# (scripts/tapes.ts) renders it in a clean copy of the program at step 11, its PostgreSQL started
# before the tape and dropped after; the build places it after the step's mise run program output.
# The recordings share their settings: a 1280x800 terminal, 128 columns by 40 rows, in
# JetBrainsMono Nerd Font at 16px, the font the rendering machine must have installed; OneHalfDark,
# a mid-dark theme that sits on the page's light and dark schemes alike; typed at a pace a reader
# follows, at 24 frames a second.
Set Shell bash
Set FontFamily "JetBrainsMono Nerd Font"
Set FontSize 16
Set Width 1280
Set Height 800
Set Padding 24
Set Theme "OneHalfDark"
Set TypingSpeed 50ms
Set Framerate 24
Set WaitTimeout 120s

# Off camera: the program and its packages compiled, so the run on camera prints at once.
Hide
Type "go build ./... && go vet ./... && clear"
Enter
Wait
Show

Sleep 1s
Type "mise run program"
Sleep 500ms
Enter
Wait
# The output fills the terminal, from schema version 1 to the four errors: held to be read.
Sleep 16s
