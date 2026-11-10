# The quick-start's step 12, "Scope by organization": mise run program against PostgreSQL, kept in
# run.txt, its first line, schema version 2, and its last twelve, the projects' lines and the
# reverted migration, on one screen. mise run tapes (scripts/tapes.ts) renders it after
# settings.tape in a clean copy of the program at step 12, its PostgreSQL started before the tape
# and dropped after; the build places it after the step's mise run program output.
# tapes/README.md holds the practices it follows.

# Off camera: the program and its packages compiled, so the run on camera prints at once.
Hide
Type "go build ./... && go vet ./... && clear"
Enter
Wait
Show

Type "mise run program > run.txt"
Enter
Wait
Type "head -n 1 run.txt"
Enter
Wait
Type "tail -n 12 run.txt"
Enter
Wait
# Output: 13 lines.
Sleep 6s
