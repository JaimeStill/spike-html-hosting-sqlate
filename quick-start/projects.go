package main

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"

	"example.com/teams/projects"
	"github.com/standards-lab/sqlate/query"
)

//go:embed seeds/projects.json
var projectSeeds []byte

const acme, globex = "0192b2a0-0000-7000-8000-0000000000aa", "0192b2a0-0000-7000-8000-0000000000bb"

// runProjects reads one organization's projects a page at a time, archives
// one, and shows the three ways an archive is refused.
func runProjects(ctx context.Context, stores *Stores) error {
	var seeds struct {
		Orgs     []projects.SeedOrg     `json:"orgs"`
		Projects []projects.SeedProject `json:"projects"`
	}
	if err := json.Unmarshal(projectSeeds, &seeds); err != nil {
		return err
	}
	n, err := stores.Projects.Seed(ctx, seeds.Orgs, seeds.Projects)
	if err != nil {
		return err
	}
	fmt.Println("seeded", n, "projects")

	d := query.Directives{Sort: []query.Sort{{Field: "code"}}}
	page, err := stores.Projects.List(ctx, acme, d, 2)
	if err != nil {
		return err
	}
	for n := 1; ; n++ {
		fmt.Printf("acme page %d: %d of %d projects\n", n, len(page.Items), page.Total)
		for _, p := range page.Items {
			fmt.Printf("  %-8s %s\n", p.Code, p.Team)
		}
		if !page.More {
			break
		}
		if page, err = stores.Projects.Continue(ctx, acme, d, page.Next, 2); err != nil {
			return err
		}
	}

	// Archive atlas at the version the read returned, then try three archives
	// that are refused: again at the new version, at the old one, and from
	// another organization.
	atlas := "0192b2a0-0000-7000-8000-000000000101"
	for _, a := range []struct {
		org, name string
		version   int64
	}{{acme, "acme", 1}, {acme, "acme", 2}, {acme, "acme", 1}, {globex, "globex", 2}} {
		row, err := stores.Projects.Archive(ctx, a.org, atlas, a.version)
		result, ok := outcome(row, err)
		if !ok {
			return err
		}
		fmt.Printf("archive atlas in %-6s at version %d: %s\n", a.name, a.version, result)
	}
	return nil
}

// outcome names an archive's result as a caller tells it apart: the row's new
// version, or the error a refusal matches; false for any other error.
func outcome(row projects.Row, err error) (string, bool) {
	var refused *query.RefusedError[projects.Row]
	switch {
	case err == nil:
		return fmt.Sprint("archived, version ", row.Version), true
	case errors.As(err, &refused):
		return "refused (query.RefusedError)", true
	case errors.Is(err, query.ErrVersionMismatch):
		return "stale (query.ErrVersionMismatch)", true
	case errors.Is(err, sql.ErrNoRows):
		return "not found (sql.ErrNoRows)", true
	}
	return "", false
}
