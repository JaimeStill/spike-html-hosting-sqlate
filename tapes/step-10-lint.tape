# The quick-start's step 10, "Lint the SQL": mise run lint passes; the guide's touch.sql, written
# on camera, fails it with two findings and exit 1; removed, the lint passes again. mise run tapes
# (scripts/tapes.ts) renders it in a clean copy of the program at step 10, which the scratch copy
# removed after keeps touch.sql out of quick-start/; the build places it at the step's end.
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

# Off camera: sqlint and the packages compiled, so each lint on camera prints at once.
Hide
Type "go vet ./... && go tool sqlint . > /dev/null && clear"
Enter
Wait
Show

Sleep 1s
Type "mise run lint"
Sleep 500ms
Enter
Wait
Sleep 2s

# The statement step 10 plants, as the guide writes it.
Type "cat > teams/statements/touch.sql <<'EOF'"
Enter
Type@25ms "--| tier: standard"
Enter
Type@25ms "-- Advances a team's version and returns its identity."
Enter
Type@25ms "UPDATE team"
Enter
Type@25ms "SET {{> sql.guard_set}}"
Enter
Type@25ms "WHERE id = {{id}}"
Enter
Type@25ms "RETURNING id, version"
Enter
Type "EOF"
Enter
Wait
Sleep 1s

Type "mise run lint"
Sleep 500ms
Enter
Wait
Sleep 2s
Type "echo $?"
Sleep 300ms
Enter
Wait
Sleep 4s

Type "rm teams/statements/touch.sql"
Sleep 300ms
Enter
Wait
Type "mise run lint"
Sleep 500ms
Enter
Wait
Sleep 3s
