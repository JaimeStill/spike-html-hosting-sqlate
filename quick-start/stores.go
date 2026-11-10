package main

import (
	"context"
	"errors"

	"example.com/teams/projects"
	"example.com/teams/teams"
)

// Stores is the program's store layer: one store per package, each compiled
// against the shared catalog.
type Stores struct {
	Teams    *teams.Store
	Projects *projects.Store
}

// newStores builds every store over the database.
func newStores(db *Database) *Stores {
	return &Stores{Teams: teams.NewStore(db.DB, db.Catalog), Projects: projects.NewStore(db.DB, db.Catalog)}
}

// Verify checks every store against the live schema.
func (s *Stores) Verify(ctx context.Context) error {
	return errors.Join(s.Teams.Verify(ctx), s.Projects.Verify(ctx))
}
