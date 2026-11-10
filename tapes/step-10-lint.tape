# The quick-start's step 10, "Lint the SQL": mise run lint passes; the guide's touch.sql, written
# on camera, fails it with two findings; removed, the lint passes again, all on one screen.
# mise run tapes (scripts/tapes.ts) renders it after settings.tape in a clean copy of the program
# at step 10, which keeps touch.sql out of quick-start/; the build places it at the step's end.
# tapes/README.md holds the practices it follows.

# Off camera: sqlint and the packages compiled, so each lint on camera prints at once.
Hide
Type "go vet ./... && go tool sqlint . > /dev/null && clear"
Enter
Wait
Show

Type "mise run lint"
Enter
Wait
# Output: 2 lines.
Sleep 2s

# The statement step 10 plants, as the guide writes it; the typing is its own reading.
Type "cat > teams/statements/touch.sql <<'EOF'"
Enter
Type "--| tier: standard"
Enter
Type "-- Advances a team's version and returns its identity."
Enter
Type "UPDATE team"
Enter
Type "SET {{> sql.guard_set}}"
Enter
Type "WHERE id = {{id}}"
Enter
Type "RETURNING id, version"
Enter
Type "EOF"
Enter
Wait

Type "mise run lint"
Enter
Wait
# Output: 7 lines.
Sleep 4s

Type "rm teams/statements/touch.sql && mise run lint"
Enter
Wait
# Output: 2 lines.
Sleep 2s
