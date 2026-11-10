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
	fmt.Println("acme page 1:", len(page.Items), "of", page.Total, "more:", page.More)
	for page.More {
		for _, p := range page.Items {
			fmt.Println(" ", p.Code, p.Team)
		}
		if page, err = stores.Projects.Continue(ctx, acme, d, page.Next, 2); err != nil {
			return err
		}
		fmt.Println("acme next page:", len(page.Items))
	}
	for _, p := range page.Items {
		fmt.Println(" ", p.Code, p.Team)
	}

	atlas := "0192b2a0-0000-7000-8000-000000000101"
	row, err := stores.Projects.Archive(ctx, acme, atlas, 1)
	if err != nil {
		return err
	}
	fmt.Println("archive atlas: version", row.Version)

	_, err = stores.Projects.Archive(ctx, acme, atlas, 2)
	var refused *query.RefusedError[projects.Row]
	fmt.Println("archive again, refused:", errors.As(err, &refused))
	_, err = stores.Projects.Archive(ctx, acme, atlas, 1)
	fmt.Println("stale version:", errors.Is(err, query.ErrVersionMismatch))
	_, err = stores.Projects.Archive(ctx, globex, atlas, 2)
	fmt.Println("another organization's project:", errors.Is(err, sql.ErrNoRows))
	return nil
}
