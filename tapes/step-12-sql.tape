# The quick-start's step 12, "Scope by organization": the projects' TestSQL, one subtest a screen:
# archive with its four patterns spliced and PostgreSQL's RETURNING, the counted first page, and
# the next page's row-value keyset. mise run tapes (scripts/tapes.ts) renders it after
# settings.tape in a clean copy of the program at step 12, and the build places it after the
# step's last go test output. tapes/README.md holds the practices it follows.

# Off camera: the packages and their tests compiled, so each run on camera prints at once.
Hide
Type "go test ./... > /dev/null && clear"
Enter
Wait
Show

Type "go test -C projects -run TestSQL/archive"
Enter
Wait
# Output: 12 lines.
Sleep 5s

Hide
Type "clear"
Enter
Wait
Show

Type "go test -C projects -run TestSQL/first"
Enter
Wait
# Output: 13 lines.
Sleep 6s

Hide
Type "clear"
Enter
Wait
Show

Type "go test -C projects -run TestSQL/next"
Enter
Wait
# Output: 14 lines.
Sleep 6s
