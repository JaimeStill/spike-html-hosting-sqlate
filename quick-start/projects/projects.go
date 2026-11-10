package projects

import (
	"context"
	"embed"
	"time"

	"github.com/standards-lab/sqlate"
	"github.com/standards-lab/sqlate/query"
)

//go:embed statements/*.sql
var statements embed.FS

// Project is the read model.
type Project struct {
	ID        string    `json:"id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	Team      string    `json:"team"`
	Version   int64     `json:"version"`
	CreatedAt time.Time `json:"created_at"`
}

// Row is the row an archive returns.
type Row struct {
	ID         string     `json:"id"`
	Code       string     `json:"code"`
	ArchivedAt *time.Time `json:"archived_at"`
	Version    int64      `json:"version"`
}

// SeedOrg and SeedProject are reference data with fixed ids.
type SeedOrg struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type SeedProject struct {
	ID   string `json:"id"`
	Org  string `json:"org"`
	Team string `json:"team"`
	Code string `json:"code"`
	Name string `json:"name"`
}

// Store is the package's SQL client, every statement scoped to an organization.
type Store struct {
	db      *sqlate.DB
	stmts   *query.Statements
	view    query.Projection[Project]
	archive query.RowGuard[Row]
	seed    query.Statement
	seedOrg query.Statement
}

func NewStore(db *sqlate.DB, catalog *query.Catalog) *Store {
	stmts := catalog.MustCompile(statements, "statements", db.Dialect())
	return &Store{
		db:      db,
		stmts:   stmts,
		view:    stmts.Statement("project_view").Project(query.Scanner[Project]()),
		archive: stmts.Statement("archive").Returning(query.Scanner[Row]()).Guarded("version", func(r Row) int64 { return r.Version }),
		seed:    stmts.Statement("seed"),
		seedOrg: stmts.Statement("seed_org"),
	}
}

func (s *Store) Statements() *query.Statements { return s.stmts }

func (s *Store) Verify(ctx context.Context) error { return query.Verify(ctx, s.db, s.stmts, s.view) }

func (s *Store) Seed(ctx context.Context, orgs []SeedOrg, rows []SeedProject) (int64, error) {
	return s.db.Transact(ctx, func(tx *sqlate.Tx) (int64, error) {
		var n int64
		for _, o := range orgs {
			if _, err := s.seedOrg.Exec(ctx, tx, query.ArgsOf(o)); err != nil {
				return 0, err
			}
		}
		for _, r := range rows {
			k, err := s.seed.Exec(ctx, tx, query.ArgsOf(r))
			if err != nil {
				return 0, err
			}
			n += k
		}
		return n, nil
	})
}

// List reads the organization's first page.
func (s *Store) List(ctx context.Context, org string, d query.Directives, size int) (query.Collection[Project], error) {
	return s.view.List(ctx, s.db, d, query.Page{Number: 1, Size: size}, query.With("org", org))
}

// Continue reads the page past a cursor.
func (s *Store) Continue(ctx context.Context, org string, d query.Directives, after query.Cursor, size int) (query.Collection[Project], error) {
	return s.view.Continue(ctx, s.db, d, after, size, query.With("org", org))
}

// Archive archives a live project of the organization at the version the caller read.
func (s *Store) Archive(ctx context.Context, org, id string, version int64) (Row, error) {
	return s.archive.Run(ctx, s.db, version, query.Args{"org": org, "id": id})
}
