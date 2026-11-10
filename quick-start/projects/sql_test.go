package projects_test

import (
	"context"
	"database/sql/driver"
	"os"
	"testing"
	"time"

	"example.com/teams/projects"
	"github.com/standards-lab/sqlate"
	"github.com/standards-lab/sqlate/postgres"
	"github.com/standards-lab/sqlate/query"
	"github.com/standards-lab/sqlate/sqltest"
)

// TestSQL prints what PostgreSQL receives: each statement as compiled, archive
// in its PostgreSQL returning form, and the library's collection read composed
// around the projection base, the counted first page and the next page's
// row-value keyset.
func TestSQL(t *testing.T) {
	cols := []string{"id", "code", "name", "team", "version", "created_at"}
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	page := sqltest.Response{Columns: cols, Rows: [][]driver.Value{
		{"0192b2a0-0000-7000-8000-000000000101", "atlas", "Atlas", "core", int64(1), now},
		{"0192b2a0-0000-7000-8000-000000000102", "beacon", "Beacon", "edge", int64(1), now},
	}}
	pool, rec := sqltest.Open(t, sqltest.WithTotal(page, 3), sqltest.Response{Columns: cols})
	db := sqlate.Wrap(pool, sqltest.Dialect{})
	patterns := os.DirFS("..")
	catalog := query.MustCatalog(postgres.Patterns(), query.Publish("app", patterns, "patterns"))
	store := projects.NewStore(db, catalog)
	for _, st := range store.Statements().Statements() {
		t.Logf("%s %v\n%s", st.Name(), st.Params(), st.Text())
		if r := st.ReturningText(); r != "" {
			t.Logf("%s (returning)\n%s", st.Name(), r)
		}
	}
	archive := catalog.MustCompile(os.DirFS("."), "statements", postgres.Dialect{}).Statement("archive")
	t.Logf("archive on PostgreSQL (returning)\n%s", archive.ReturningText())
	org := "0192b2a0-0000-7000-8000-0000000000aa"
	d := query.Directives{
		Sort:    []query.Sort{{Field: "created_at", Descending: true}},
		Filters: []query.Filter{{Field: "team", Op: query.OpIn, Value: []any{"core", "edge"}}},
	}
	first, err := store.List(context.Background(), org, d, 1)
	if err != nil {
		t.Fatal(err)
	}
	d.Total = query.TotalNone
	if _, err := store.Continue(context.Background(), org, d, first.Next, 1); err != nil {
		t.Fatal(err)
	}
	t.Logf("first page\n%s", rec.Calls()[0].SQL)
	t.Logf("next page\n%s", rec.Calls()[1].SQL)
}
