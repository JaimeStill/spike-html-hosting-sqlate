package main

import (
	"database/sql"
	"embed"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/standards-lab/sqlate"
	"github.com/standards-lab/sqlate/postgres"
	"github.com/standards-lab/sqlate/query"
)

//go:embed patterns/*.sql
var patterns embed.FS

// Database is the program's database layer: the session over the pool, and
// the catalog of pattern namespaces every store compiles against.
type Database struct {
	DB      *sqlate.DB
	Catalog *query.Catalog
	pool    *sql.DB
}

// openDatabase opens the pool with the driver, wraps it with the PostgreSQL
// dialect, and builds the catalog: the library's patterns under sql, the
// program's under app.
func openDatabase(dsn string) (*Database, error) {
	pool, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	catalog, err := query.NewCatalog(postgres.Patterns(), query.Publish("app", patterns, "patterns"))
	if err != nil {
		return nil, err
	}
	return &Database{DB: sqlate.Wrap(pool, postgres.Dialect{}), Catalog: catalog, pool: pool}, nil
}

// Close closes the pool.
func (d *Database) Close() error { return d.pool.Close() }
