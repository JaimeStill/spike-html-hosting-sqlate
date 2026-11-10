package main

import (
	"context"
	"embed"

	"github.com/standards-lab/sqlate/migrate"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Schema is the program's schema layer: the migrator over the embedded set.
type Schema struct {
	migrator *migrate.Migrator
}

// newSchema reads the embedded migrations and builds the migrator over them
// as one set.
func newSchema(db *Database) (*Schema, error) {
	teams, err := migrate.Files(migrations, "migrations")
	if err != nil {
		return nil, err
	}
	sets := []migrate.Set{{Name: "teams", Migrations: teams}}
	migrator, err := migrate.New(db.DB, sets, migrate.Options{})
	if err != nil {
		return nil, err
	}
	return &Schema{migrator: migrator}, nil
}

// Up applies every pending migration under the engine's advisory lock and
// returns the version the schema is at.
func (s *Schema) Up(ctx context.Context) (int, error) {
	if err := s.migrator.Up(ctx); err != nil {
		return 0, err
	}
	head, err := s.migrator.Version(ctx)
	return head.Version, err
}

// Down reverts the most recently applied migration.
func (s *Schema) Down(ctx context.Context) error { return s.migrator.Down(ctx, 1) }
