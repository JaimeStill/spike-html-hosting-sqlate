# The quick-start's step 9, "Test without a database": the teams' TestSQL prints the list read as
# the library composes it, one screen. mise run tapes (scripts/tapes.ts) renders it after
# settings.tape in a clean copy of the program at step 9, and the build places it after the
# step's go test output. tapes/README.md holds the practices it follows.

# Off camera: the packages and their tests compiled, so the run on camera prints at once.
Hide
Type "go test ./... > /dev/null && clear"
Enter
Wait
Show

Type "go test -C teams -run TestSQL"
Enter
Wait
# Output: 10 lines.
Sleep 5s
