package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"text/tabwriter"

	"example.com/teams/teams"
	"github.com/standards-lab/sqlate"
	"github.com/standards-lab/sqlate/query"
)

// run is the program's work: the reads as JSON, then the commands, then the
// errors a caller matches on.
func run(ctx context.Context, stores *Stores) error {
	page, err := stores.Teams.List(ctx, query.Directives{
		Sort: []query.Sort{{Field: "code"}},
	}, query.Page{Number: 1, Size: 10})
	if err != nil {
		return err
	}
	fmt.Println("list:", len(page.Items), "of", page.Total)
	printTable(page.Items)

	one, err := stores.Teams.Find(ctx, "core")
	if err != nil {
		return err
	}
	fmt.Println("find:")
	printJSON(one)

	some, err := stores.Teams.FindByCodes(ctx, []string{"core", "edge"})
	if err != nil {
		return err
	}
	fmt.Println("find by codes:")
	printTable(some)

	created, err := stores.Teams.Create(ctx, teams.NewTeam{Code: "platform", Name: "Platform"})
	if err != nil {
		return err
	}
	fmt.Println("create:")
	printJSON(created)

	version, err := stores.Teams.Rename(ctx, created.ID, created.Version, teams.RenameTeam{Name: "Platform Engineering"})
	if err != nil {
		return err
	}
	fmt.Println("rename: version", version)

	replaced, err := stores.Teams.Replace(ctx, created.ID, version, teams.NewTeam{Code: "infra", Name: "Infrastructure"})
	if err != nil {
		return err
	}
	fmt.Println("replace:")
	printJSON(replaced)

	// The errors a caller matches on.
	_, err = stores.Teams.Create(ctx, teams.NewTeam{Code: "Not Valid", Name: "x"})
	fmt.Println("invalid command:", errors.Is(err, teams.ErrValidation))

	_, err = stores.Teams.Create(ctx, teams.NewTeam{Code: "core", Name: "Again"})
	var violation *sqlate.ConstraintError
	if errors.Is(err, sqlate.ErrUniqueViolation) && errors.As(err, &violation) {
		fmt.Println("duplicate:", violation.Constraint)
	}

	_, err = stores.Teams.List(ctx, query.Directives{
		Filters: []query.Filter{{Field: "id", Op: query.OpEq, Value: "not-a-uuid"}},
	}, query.Page{Number: 1, Size: 10})
	fmt.Println("bad request:", errors.Is(err, query.ErrDirectives))

	_, err = stores.Teams.Rename(ctx, one.ID, one.Version-1, teams.RenameTeam{Name: "Stale"})
	fmt.Println("stale version:", errors.Is(err, query.ErrVersionMismatch))
	return nil
}

// printJSON writes v as indented JSON.
func printJSON(v any) {
	out, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(out))
}

// printTable writes the teams as a table.
func printTable(rows []teams.Team) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "CODE\tNAME\tVERSION\tID")
	for _, t := range rows {
		fmt.Fprintf(w, "%s\t%s\t%d\t%s\n", t.Code, t.Name, t.Version, t.ID)
	}
	w.Flush()
}
