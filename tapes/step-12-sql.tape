# The quick-start's step 12, "Scope by organization": mise run sql prints archive with its four
# patterns spliced, its PostgreSQL form with RETURNING added by the dialect, the counted first
# page, and the next page's row-value keyset. mise run tapes (scripts/tapes.ts) renders it in a
# clean copy of the program at step 12, and the build places it after the step's mise run sql
# output.
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

# Off camera: the packages and their tests compiled, so the run on camera prints at once.
Hide
Type "go vet ./... && clear"
Enter
Wait
Show

Sleep 1s
Type "mise run sql"
Sleep 500ms
Enter
Wait
Sleep 5s

# The output is taller than the terminal: its end shows the PostgreSQL form, the pages, and the
# teams' list; its top, archive as the stub compiles it, the patterns spliced.
ScrollUp 40
Sleep 8s
ScrollDown 40
Sleep 6s
