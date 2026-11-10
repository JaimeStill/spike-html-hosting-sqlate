package projects_test

import (
	"context"
	"database/sql/driver"
	"fmt"
	"os"
	"testing"
	"time"

	"example.com/teams/projects"
	"github.com/standards-lab/sqlate"
	"github.com/standards-lab/sqlate/postgres"
	"github.com/standards-lab/sqlate/query"
	"github.com/standards-lab/sqlate/sqltest"
)

// TestSQL prints what PostgreSQL receives, one subtest each: archive in its
// PostgreSQL form, and the library's collection read around the projection
// base, the first page and the page past its cursor.
func TestSQL(t *testing.T) {
	cols := []string{"id", "code", "name", "team", "version", "created_at"}
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	row := func(id, code, name, team string) []driver.Value {
		return []driver.Value{id, code, name, team, int64(1), now}
	}
	pool, rec := sqltest.Open(t,
		sqltest.WithTotal(sqltest.Response{Columns: cols, Rows: [][]driver.Value{
			row("0192b2a0-0000-7000-8000-000000000101", "atlas", "Atlas", "core"),
			row("0192b2a0-0000-7000-8000-000000000102", "beacon", "Beacon", "edge"),
		}}, 3),
		sqltest.WithTotal(sqltest.Response{Columns: cols, Rows: [][]driver.Value{
			row("0192b2a0-0000-7000-8000-000000000103", "compass", "Compass", "core"),
		}}, 3),
	)
	db := sqlate.Wrap(pool, sqltest.Dialect{})
	catalog := query.MustCatalog(postgres.Patterns(), query.Publish("app", os.DirFS(".."), "patterns"))
	store := projects.NewStore(db, catalog)
	org := "0192b2a0-0000-7000-8000-0000000000aa"
	d := query.Directives{
		Sort:    []query.Sort{{Field: "created_at", Descending: true}},
		Filters: []query.Filter{{Field: "team", Op: query.OpIn, Value: []any{"core", "edge"}}},
	}
	first, err := store.List(context.Background(), org, d, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Continue(context.Background(), org, d, first.Next, 1); err != nil {
		t.Fatal(err)
	}

	t.Run("archive", func(t *testing.T) {
		archive := catalog.MustCompile(os.DirFS("."), "statements", postgres.Dialect{}).Statement("archive")
		fmt.Printf("-- archive on PostgreSQL, parameters %v\n%s\n", archive.Params(), layout(archive.ReturningText()))
	})
	t.Run("first page", func(t *testing.T) {
		fmt.Printf("-- first page: newest first, teams core and edge, 1 row a page\n%s\n", layout(rec.Calls()[0].SQL))
	})
	t.Run("next page", func(t *testing.T) {
		fmt.Printf("-- next page: past the first page's cursor\n%s\n", layout(rec.Calls()[1].SQL))
	})
}
