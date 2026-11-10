package teams

import (
	"context"
	"embed"

	"github.com/standards-lab/sqlate"
	"github.com/standards-lab/sqlate/query"
)

//go:embed statements/*.sql
var statements embed.FS

// Store is the package's SQL client: each statement bound once to the value
// that runs it. The entities' tags are the scan and binding contract, so no
// scan function or argument literal is written here.
type Store struct {
	db      *sqlate.DB
	stmts   *query.Statements
	view    query.Projection[Team]
	create  query.Rows[Identity]
	byCodes query.Rows[Team]
	seed    query.Statement
	rename  query.Guard
	delete  query.Guard
}

// NewStore compiles the package's statements against the catalog and binds
// them.
func NewStore(db *sqlate.DB, catalog *query.Catalog) *Store {
	stmts := catalog.MustCompile(statements, "statements", db.Dialect())
	check := stmts.Statement("version")
	return &Store{
		db:      db,
		stmts:   stmts,
		view:    stmts.Statement("team_view").Project(query.Scanner[Team]()),
		create:  stmts.Statement("create").Scan(query.Scanner[Identity]()),
		byCodes: stmts.Statement("find_by_codes").Scan(query.Scanner[Team]()),
		seed:    stmts.Statement("seed"),
		rename:  stmts.Statement("edit").Guarded(check, "version"),
		delete:  stmts.Statement("delete").Guarded(check, "version"),
	}
}

// Verify prepares every statement and the view's field contract against
// the live schema, so a drifted schema fails at startup.
func (s *Store) Verify(ctx context.Context) error {
	return query.Verify(ctx, s.db, s.stmts, s.view)
}

// Seed inserts every row whose code is not yet present, as one unit of work,
// and returns how many it inserted.
func (s *Store) Seed(ctx context.Context, rows []SeedTeam) (int64, error) {
	for _, r := range rows {
		if err := r.Validate(); err != nil {
			return 0, err
		}
	}
	return s.db.Transact(ctx, func(tx *sqlate.Tx) (int64, error) {
		var inserted int64
		for _, r := range rows {
			n, err := s.seed.Exec(ctx, tx, query.ArgsOf(r))
			if err != nil {
				return 0, err
			}
			inserted += n
		}
		return inserted, nil
	})
}

// Create validates the command and runs it; the result is the new row's
// identity.
func (s *Store) Create(ctx context.Context, t NewTeam) (Identity, error) {
	if err := t.Validate(); err != nil {
		return Identity{}, err
	}
	return s.create.One(ctx, s.db, query.ArgsOf(t))
}

// List runs the collection read under the request's directives and returns
// one page of teams with the total count.
func (s *Store) List(ctx context.Context, d query.Directives, page query.Page) (query.Collection[Team], error) {
	return s.view.List(ctx, s.db, d, page)
}

// Find returns the team with the code; no row is sql.ErrNoRows.
func (s *Store) Find(ctx context.Context, code string) (Team, error) {
	return s.view.One(ctx, s.db, "code", code)
}

// FindByCodes returns the teams with any of the codes, in code order.
func (s *Store) FindByCodes(ctx context.Context, codes []string) ([]Team, error) {
	return s.byCodes.All(ctx, s.db, query.Args{"codes": codes})
}

// Rename runs the guarded command with the version the caller read and
// returns the new version.
func (s *Store) Rename(ctx context.Context, id string, version int64, r RenameTeam) (int64, error) {
	if err := r.Validate(); err != nil {
		return 0, err
	}
	return s.rename.Run(ctx, s.db, version, query.ArgsOf(r).With("id", id))
}

// Replace deletes one team and creates another as one unit of work.
func (s *Store) Replace(ctx context.Context, id string, version int64, t NewTeam) (Identity, error) {
	if err := t.Validate(); err != nil {
		return Identity{}, err
	}
	return s.db.Transact(ctx, func(tx *sqlate.Tx) (Identity, error) {
		if _, err := s.delete.Run(ctx, tx, version, query.Args{"id": id}); err != nil {
			return Identity{}, err
		}
		return s.create.One(ctx, tx, query.ArgsOf(t))
	})
}
