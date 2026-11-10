package projects_test

import "strings"

// clauses are the keywords layout starts a line with.
var clauses = map[string]bool{
	"SET": true, "FROM": true, "JOIN": true, "WHERE": true, "ORDER": true, "OFFSET": true, "RETURNING": true,
}

// layout lays out the SQL a test prints to read in a narrow terminal: each
// clause on its own line, a subquery's a step deeper, and each AND and each
// assignment after a SET's first on a line of its own. Only the whitespace
// changes.
func layout(sql string) string {
	var b strings.Builder
	depth, clause, last := 0, "", ""
	for i, line := range strings.Split(sql, "\n") {
		for j, word := range strings.Fields(line) {
			switch {
			case i == 0 && j == 0:
			case clauses[word] || j == 0:
				b.WriteString("\n" + strings.Repeat("  ", depth))
			case word == "AND", clause == "SET" && depth == 0 && strings.HasSuffix(last, ","):
				b.WriteString("\n" + strings.Repeat("  ", depth+1))
			default:
				b.WriteString(" ")
			}
			if clauses[word] {
				clause = word
			}
			b.WriteString(word)
			depth += strings.Count(word, "(") - strings.Count(word, ")")
			last = word
		}
	}
	return b.String()
}
