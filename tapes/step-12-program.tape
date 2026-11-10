# The quick-start's step 12, "Scope by organization": mise run program against PostgreSQL, ending
# on the projects' lines and the reverted migration. mise run tapes (scripts/tapes.ts) renders it
# in a clean copy of the program at step 12, its PostgreSQL started before the tape and dropped
# after; the build places it after the step's mise run program output.
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
Sleep 3s

# The output is taller than the terminal: its top, schema version 2 and the teams' lines, then
# back to its end, the projects' lines and the reverted migration.
ScrollUp 40
Sleep 5s
ScrollDown 40
Sleep 8s
