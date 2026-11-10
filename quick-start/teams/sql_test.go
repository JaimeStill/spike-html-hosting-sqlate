package teams_test

import (
	"context"
	"database/sql/driver"
	"fmt"
	"testing"
	"time"

	"github.com/standards-lab/sqlate/query"
	"github.com/standards-lab/sqlate/sqltest"
)

// TestSQL prints what PostgreSQL receives for a list read: the projection
// base inside the library's collection read, under the request's sort, filter
// and page.
func TestSQL(t *testing.T) {
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	s, rec := store(t, sqltest.WithTotal(sqltest.Response{
		Columns: []string{"id", "code", "name", "version", "created_at", "updated_at"},
		Rows:    [][]driver.Value{{"7d0f", "core", "Core", int64(1), now, now}},
	}, 1))
	_, err := s.List(context.Background(), query.Directives{
		Sort:    []query.Sort{{Field: "name"}},
		Filters: []query.Filter{{Field: "code", Op: query.OpLike, Value: "c%"}},
	}, query.Page{Number: 2, Size: 10})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("-- list: sort by name, filter code LIKE 'c%%', page 2 of size 10\n%s\n", layout(rec.Calls()[0].SQL))
}
