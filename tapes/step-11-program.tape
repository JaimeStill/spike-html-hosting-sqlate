# The quick-start's step 11, "Write the seed, the store layer, the work, and the program": mise
# run program against PostgreSQL, its 36 lines kept in run.txt and shown in two screens, the reads
# and then the writes and the four errors. mise run tapes (scripts/tapes.ts) renders it after
# settings.tape in a clean copy of the program at step 11, its PostgreSQL started before the tape
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
Type "head -n 17 run.txt"
Enter
Wait
# Output: 17 lines.
Sleep 7s

Hide
Type "clear"
Enter
Wait
Show

Type "tail -n +18 run.txt"
Enter
Wait
# Output: 19 lines.
Sleep 8s
