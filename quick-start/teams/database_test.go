package teams_test

import (
	"context"
	"database/sql/driver"
	"errors"
	"testing"

	"example.com/teams/teams"
	"github.com/standards-lab/sqlate"
	"github.com/standards-lab/sqlate/query"
	"github.com/standards-lab/sqlate/sqltest"
)

func store(t *testing.T, responses ...sqltest.Response) (*teams.Store, *sqltest.Recorder) {
	t.Helper()
	pool, rec := sqltest.Open(t, responses...)
	catalog := query.MustCatalog(query.Patterns(), query.Publish("app", patterns, "."))
	return teams.NewStore(sqlate.Wrap(pool, sqltest.Dialect{}), catalog), rec
}

func TestCreate_BindsTheCommandAndScansTheIdentity(t *testing.T) {
	s, rec := store(t, sqltest.Response{
		Columns: []string{"id", "version"},
		Rows:    [][]driver.Value{{"7d0f", int64(1)}},
	})

	id, err := s.Create(context.Background(), teams.NewTeam{Code: "core", Name: "Core"})
	if err != nil || id.ID != "7d0f" || id.Version != 1 {
		t.Fatalf("Create = %+v, %v", id, err)
	}
	call := rec.Calls()[0]
	if call.SQL != "INSERT INTO team (code, name)\nVALUES ($1, $2)\nRETURNING id, version" {
		t.Errorf("sql = %q", call.SQL)
	}
	if call.Args[0] != "core" || call.Args[1] != "Core" {
		t.Errorf("args = %v", call.Args)
	}
	if rec.Pending() != 0 {
		t.Error("a scripted response went unconsumed")
	}
}

func TestCreate_RejectsABadCodeBeforeAnySQL(t *testing.T) {
	s, rec := store(t)
	_, err := s.Create(context.Background(), teams.NewTeam{Code: "Not Valid", Name: "x"})
	if !errors.Is(err, teams.ErrValidation) {
		t.Fatalf("err = %v, want ErrValidation", err)
	}
	if len(rec.Calls()) != 0 {
		t.Error("the rejected command was sent to the driver")
	}
}
