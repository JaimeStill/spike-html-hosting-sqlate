# Quick start

A tutorial that builds a working program from an empty directory:

- a `teams` package with validated commands and a store over a `team` table
- a migration
- a shared pattern
- seed data
- a test that needs no database
- the linter over the SQL
- a program whose startup and runtime are split into layers
- a second package that keeps each organization to its own rows, its list read a page at a
  time by cursor

The library is used on its own, over a plain `*sql.DB`. Every
file is written in full at the step that needs it, and every block is taken from a program
that compiles, runs against PostgreSQL 18, and passes its tests. The [concepts](concepts.md)
document explains the grammar the files use, and the [features](features.md) document
explains each mechanism.

## Prerequisites

- [mise](https://mise.jdx.dev/getting-started.html) installs the Go toolchain the project pins
  and runs its tasks.
- [Docker](https://docs.docker.com/get-started/get-docker/) with the Compose plugin runs
  PostgreSQL. Any Docker Engine or Docker Desktop release from 2023 on includes it.

## 1. Create the module

```sh
mkdir teams && cd teams
go mod init example.com/teams
go get github.com/standards-lab/sqlate github.com/standards-lab/sqlate/postgres
go get github.com/jackc/pgx/v5/stdlib
go get -tool github.com/standards-lab/sqlate/sqlint/cmd/sqlint
```

The base module has no dependencies. The `postgres` sub-module names the driver, so a program
imports it once, where it opens its pool. The `-tool` form records the linter's command in
`go.mod`, so `go tool sqlint` runs it at the pinned version.

`mise.toml` pins the toolchain, sets the connection string every task reads, and names the
tasks the tutorial runs:

`mise.toml`:

```toml
[tools]
go = "1.27"

[env]
SQLATE_DSN = "postgres://app:app@127.0.0.1:5433/app?sslmode=disable"

[tasks."db:up"]
description = "Start PostgreSQL and wait until it is healthy"
run = "docker compose up -d --wait --build"

[tasks."db:reset"]
description = "Stop PostgreSQL and drop its volume"
run = "docker compose down -v"

[tasks.program]
description = "Run the program"
run = "go run ."

[tasks.test]
description = "Run the tests; no database needed"
run = "go test ./..."

[tasks.lint]
description = "Check the SQL files against the conventions"
run = "go tool sqlint ."
```

```sh
mise trust && mise install
```

## 2. Start PostgreSQL

`compose/postgres/Dockerfile` builds PostgreSQL 18 with the user, password, and database the
connection string names, and a health check the `db:up` task waits on. Its `FROM` line is the
image's one pin.

`compose/postgres/Dockerfile`:

```dockerfile
FROM postgres:18.6-alpine

ENV POSTGRES_USER=app \
    POSTGRES_PASSWORD=app \
    POSTGRES_DB=app

HEALTHCHECK --start-period=30s --start-interval=1s --interval=5s --timeout=3s --retries=5 \
    CMD ["pg_isready", "-h", "127.0.0.1", "-U", "app", "-d", "app"]
```

`compose.yml` builds it and publishes it on port 5433:

`compose.yml`:

```yaml
name: teams

services:
  postgres:
    build:
      context: compose/postgres
    ports:
      - "127.0.0.1:5433:5432"
```

```sh
mise run db:up
```

## 3. Write the migration

A migration is a pair of files, `NNNN_name.up.sql` and `NNNN_name.down.sql`. The `version` and
`updated_at` columns are the ones the library's guard patterns advance.

`migrations/0001_team.up.sql`:

```sql
CREATE TABLE team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_team_code UNIQUE (code)
);
```

`migrations/0001_team.down.sql`:

```sql
DROP TABLE team;
```

## 4. Write a pattern

A pattern is SQL that several statements share, published under a namespace; the program's
patterns are published under `app` by the database layer of the next step. This one is the
identity every command returns, and it uses a PostgreSQL feature, so its tier is native and its
`native` declaration names the feature and the port to other engines.

`patterns/identity.sql`:

```sql
--| tier: native
--| native: postgres, RETURNING. Ports: OUTPUT INSERTED (SQL Server), a second read (MySQL).
-- The identity every command returns: the row's key and its version.
RETURNING id, version
```

## 5. Write the database and schema layers

The program's startup is a sequence of layers, each in its own file. The database layer opens
the pool with the driver, wraps it with the PostgreSQL dialect, and builds the catalog of
pattern namespaces every store compiles against: the library's under `sql`, the program's
under `app`.

`database.go`:

```go
package main

import (
	"database/sql"
	"embed"
	"errors"

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
// program's under app. If the catalog fails, it closes the pool.
func openDatabase(dsn string) (*Database, error) {
	pool, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	catalog, err := query.NewCatalog(postgres.Patterns(), query.Publish("app", patterns, "patterns"))
	if err != nil {
		return nil, errors.Join(err, pool.Close())
	}
	return &Database{DB: sqlate.Wrap(pool, postgres.Dialect{}), Catalog: catalog, pool: pool}, nil
}

// Close closes the pool.
func (d *Database) Close() error { return d.pool.Close() }
```

The library's patterns are written in standard SQL. An engine can overlay them: its overlay
replaces a pattern with the engine's own spelling of it, under the same name.
`postgres.Patterns()` is the library's patterns with PostgreSQL's overlay applied. The overlay
changes one pattern, the predicate that continues a read past a cursor: PostgreSQL writes it as
the row-value comparison `(a, b) > (x, y)`, where standard SQL needs a chain of `OR`s. Every
other pattern is used as written. No statement in this program names that pattern, so
`query.Patterns()` would work as well; only the SQL of a page read past a cursor would differ.

The schema layer reads the embedded migrations as one set and applies them under the engine's
advisory lock, so several starters of the same program apply them once. A set with no `Table`
records its history in `schema_version`.

`schema.go`:

```go
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
```

`main.go` runs the sequence so far: connect, migrate, report the version.

`main.go`:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
)

func main() {
	ctx := context.Background()

	db, err := openDatabase(os.Getenv("SQLATE_DSN"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	schema, err := newSchema(db)
	if err != nil {
		log.Fatal(err)
	}
	version, err := schema.Up(ctx)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("schema version", version)
}
```

```sh
mise run program
```

```
schema version 1
```

`Up` is idempotent; running the program again reports the same version.

## 6. Write the statements

The `teams` package owns its statements, one file per operation, under its own directory.
`create` includes the pattern under the namespace `app`.

`teams/statements/create.sql`:

```sql
--| tier: native
--| native: postgres, RETURNING through app.identity.
INSERT INTO team (code, name)
VALUES ({{code}}, {{name}})
{{> app.identity}}
```

`seed` inserts a team unless one with the code exists, in standard SQL, so seeding is
idempotent. The id is a parameter cast to `uuid`, so seed rows keep the ids the seed file
gives them.

`teams/statements/seed.sql`:

```sql
--| tier: standard
-- Inserts a team unless one with the code exists, so a seed is idempotent.
MERGE INTO team AS t
USING (VALUES ({{id:uuid}}, {{code}}, {{name}})) AS s (id, code, name)
ON t.code = s.code
WHEN NOT MATCHED THEN INSERT (id, code, name) VALUES (s.id, s.code, s.name)
```

`team_view` is the projection base the collection read wraps. Its `key` is the identity column
and its `field` declarations are the only names a request may filter or sort by, each with the
SQL type the request's value is cast to.

`teams/statements/team_view.sql`:

```sql
--| tier: standard
--| key: id
--| field: id uuid
--| field: code text
--| field: name text
--| field: version bigint
--| field: created_at timestamp
-- The read model. The SELECT list is the scan order.
SELECT id, code, name, version, created_at, updated_at
FROM team
```

`version` is the guard's check: it reads a row's current version by key.

`teams/statements/version.sql`:

```sql
--| tier: standard
SELECT version FROM team WHERE id = {{id}}
```

`edit` and `delete` are guarded commands. Both include the library's guard patterns, published
under the namespace `sql`: `guard_where` is `id = {{id}} AND version = {{version}}`, and
`guard_set` advances `updated_at` and `version`.

`teams/statements/edit.sql`:

```sql
--| tier: standard
UPDATE team
SET name = {{name}}, {{> sql.guard_set}}
WHERE {{> sql.guard_where}}
```

`teams/statements/delete.sql`:

```sql
--| tier: standard
DELETE FROM team
WHERE {{> sql.guard_where}}
```

`find_by_codes` expands a list: `{{codes...}}` binds one placeholder per element of the slice
the program passes.

`teams/statements/find_by_codes.sql`:

```sql
--| tier: standard
SELECT id, code, name, version, created_at, updated_at
FROM team
WHERE code IN ({{codes...}})
ORDER BY code
```

## 7. Write the entities

The entities are the package's types: the read model, the commands and the seed row with their
validation, and the identity every command returns. Their struct tags are the scan and binding
contract, so the store writes no scan function and no argument literal. A command validates
what it can know from its own fields; what only the database knows, such as a duplicate code,
is the store's, as the engine's constraint violation.

`teams/entities.go`:

```go
package teams

import (
	"errors"
	"fmt"
	"regexp"
	"time"
)

// ErrValidation classifies a command input the program rejects before any
// SQL runs; the wrapped reason names the field.
var ErrValidation = errors.New("teams: invalid command")

// codePattern is the schema's rule for a code, checked here so a bad code
// is a validation error rather than a database check violation.
var codePattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Team is the read model; the tags name the columns Scanner reads.
type Team struct {
	ID        string    `json:"id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	Version   int64     `json:"version"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// NewTeam is the create command's input; ArgsOf binds its fields by name.
type NewTeam struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// Validate rejects a malformed code or an empty name. Uniqueness of the code
// is the store's, as the engine's constraint violation.
func (t NewTeam) Validate() error {
	return errors.Join(validCode(t.Code), validName(t.Name))
}

// RenameTeam is the rename command's input.
type RenameTeam struct {
	Name string `json:"name"`
}

// Validate rejects an empty name.
func (r RenameTeam) Validate() error { return validName(r.Name) }

// SeedTeam is one row of reference data: a team with its id fixed, so a
// seed is the same on every database it runs against.
type SeedTeam struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

// Validate rejects a malformed code or an empty name.
func (t SeedTeam) Validate() error {
	return errors.Join(validCode(t.Code), validName(t.Name))
}

// Identity is what every command returns: the row's key and the version
// the command left it at.
type Identity struct {
	ID      string `json:"id"`
	Version int64  `json:"version"`
}

func validCode(code string) error {
	if !codePattern.MatchString(code) {
		return fmt.Errorf("%w: code must be lowercase words joined by single hyphens", ErrValidation)
	}
	return nil
}

func validName(name string) error {
	if name == "" {
		return fmt.Errorf("%w: name must not be empty", ErrValidation)
	}
	return nil
}
```

## 8. Write the store

The store compiles the package's statements against the catalog and binds each one, once, to
the value that runs it:

- `Project` for the collection read
- `Scan` for a statement that returns rows
- `Guarded` for a command with its check
- the bare `Statement` for one run with `Exec`

Each operation takes the session, so it runs against the pool here and inside a transaction in
`Seed` and `Replace`.

`teams/database.go`:

```go
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
```

- `Verify` prepares every statement and probes every declared field against the live schema,
  so a renamed column fails at startup with the statement named.
- `Seed` validates every row, then runs the seed statement for each inside one transaction;
  `Exec` returns the rows affected, so the count is how many were new.
- `Create` validates, then runs the command with `One`, which returns the first row; `ArgsOf`
  binds the command's fields by their tag names.
- `List` runs the collection read under the request's directives, the sorts and filters, for
  the page the caller names. The `Collection` it returns holds the page's `Items` and the
  `Total` under the filters. `Find` is the base under one equality predicate; no row is
  `sql.ErrNoRows`.
- `FindByCodes` runs the expanded statement with `All`, which returns every row. `Each` yields
  rows one at a time as an iterator.
- `Rename` validates, then runs the guarded command with the version the caller read and
  returns the new one; `With` adds the id the command needs beside the command's own fields.
- `Replace` runs two commands as one unit of work: `Transact` commits on success and rolls back
  on error or panic.

## 9. Test without a database

`sqltest` is a scripted `database/sql` driver: each response is consumed by the next call in
order, and every call is recorded. Its stub dialect renders `$n` placeholders, so the compiled
text is the one PostgreSQL receives. The test publishes the `app` namespace itself, from an
in-memory file system, so the package's tests depend on nothing outside the package.

`teams/patterns_test.go`:

```go
package teams_test

import "testing/fstest"

// patterns is the app namespace as the test publishes it: the one pattern
// the statements include, so the test needs no file outside the package.
var patterns = fstest.MapFS{
	"identity.sql": {Data: []byte("--| tier: native\n--| native: postgres, RETURNING.\nRETURNING id, version")},
}
```

`teams/database_test.go`:

```go
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
```

```sh
mise run test
```

```
?   	example.com/teams	[no test files]
ok  	example.com/teams/teams
```

The driver is strict where a real one is: an unscripted call, a wrong argument count, and a
response of the wrong shape each fail the test. The second test proves a rejected command
never reaches the driver.

The recorder also shows the SQL PostgreSQL receives for a statement the library composes. A
list read wraps the projection base in the library's collection read, and its text depends on
the request, so a test makes one list request and prints the SQL it sent. `WithTotal` adds the
count the collection read returns as each row's trailing column.

The test prints the SQL through `layout`, at the bottom of `sql_test.go`, which puts each clause
on a line of its own and indents each subquery a step, so it reads in a narrow terminal. It
changes only the whitespace.

`teams/sql_test.go`:

```go
package teams_test

import (
	"context"
	"database/sql/driver"
	"fmt"
	"strings"
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

// clauses are the keywords layout starts a line with.
var clauses = map[string]bool{
	"SET": true, "FROM": true, "JOIN": true, "WHERE": true, "ORDER": true, "OFFSET": true, "RETURNING": true,
}

// layout lays out the SQL a test prints to read in a narrow terminal: each
// clause on its own line, a subquery's a step deeper, and each AND and each
// assignment after a SET's first on a line of its own. Only the whitespace
// changes.
func layout(sql string) string {
	var b strings.Builder
	depth, clause, last := 0, "", ""
	for i, line := range strings.Split(sql, "\n") {
		for j, word := range strings.Fields(line) {
			switch {
			case i == 0 && j == 0:
			case clauses[word] || j == 0:
				b.WriteByte('\n')
				b.WriteString(strings.Repeat("  ", depth))
			case word == "AND", clause == "SET" && depth == 0 && strings.HasSuffix(last, ","):
				b.WriteByte('\n')
				b.WriteString(strings.Repeat("  ", depth+1))
			default:
				b.WriteString(" ")
			}
			if clauses[word] {
				clause = word
			}
			b.WriteString(word)
			depth += strings.Count(word, "(") - strings.Count(word, ")")
			last = word
		}
	}
	return b.String()
}
```

Given no package, `go test` tests the directory it runs in and prints what a test writes even
when the test passes; `-C teams` runs it in `teams`, and `-run TestSQL` runs that test alone:

```sh
go test -C teams -run TestSQL
```

```
-- list: sort by name, filter code LIKE 'c%', page 2 of size 10
SELECT *
FROM (SELECT q.*, COUNT(*) OVER () AS sqlate_total
  FROM (SELECT id, code, name, version, created_at, updated_at
    FROM team) q
  WHERE q.code LIKE CAST($1 AS text)) q
ORDER BY q.name, q.id
OFFSET $2 ROWS FETCH NEXT $3 ROWS ONLY
PASS
ok  	example.com/teams/teams
```

Read it from the inside out. The innermost `SELECT` is `team_view` as written. The layer around
it applies the filter and counts the rows it keeps, and the outer layer orders and pages them.
The order ends in the key, `q.id`, so it is total and a page holds the same rows on every read.
The filter's value, cast to the type the field declares, and the page's offset and size are
placeholders: a request's values never become SQL text.

## 10. Lint the SQL

`sqlint.toml` at the module root names the pattern sources and the engine by module path, and
the directory of each role.

`sqlint.toml`:

```toml
engine = "github.com/standards-lab/sqlate/postgres"

[sources]
sql = "github.com/standards-lab/sqlate"
app = "patterns"

[statements]
dirs = ["teams/statements"]

[patterns]
dirs = ["patterns"]

[migrations]
dirs = ["migrations"]
```

```sh
mise run lint
```

```
sqlint: ok
```

The linter compiles the statement directory against the same catalog the program builds,
validates the pattern directory, and checks the conventions:

- a file named for its operation
- the delimiter kept out of comments and literals
- no native form in a standard-tier file
- a guarded command that includes `guard_where` or `guard_set` includes both
- one statement per non-transactional migration

A finding prints as `path:line: message` and exits 1.

To see two, write a statement that breaks two of the conventions: a command that advances the
version with `guard_set` but never checks it with `guard_where`, and that ends in `RETURNING`,
PostgreSQL's native form, in a standard-tier file. Save it as `teams/statements/touch.sql`:

```sql
--| tier: standard
-- Advances a team's version and returns its identity.
UPDATE team
SET {{> sql.guard_set}}
WHERE id = {{id}}
RETURNING id, version
```

```sh
mise run lint
```

```
teams/statements/touch.sql:4: includes guard_set without guard_where; a guarded command checks the version it advances
teams/statements/touch.sql:6: "RETURNING" (returning) in a standard-tier file; declare the tier native and name the port
sqlint: 2 finding(s)
```

The task exits 1. `guard_where` is what gives a guarded command optimistic concurrency: the
write applies only if the row's version is still the one the caller read, so a caller holding a
stale version gets a version mismatch instead of silently overwriting someone else's change. A
command with `guard_set` alone advances the version without that check, which is why sqlint
refuses `guard_set` without `guard_where`. A standard-tier file promises SQL every engine
runs, so a native form in it fails; `create` takes its `RETURNING` through `app.identity`, a
native pattern that names its port. Remove the file, and the lint passes again:

```sh
rm teams/statements/touch.sql
mise run lint
```

```
sqlint: ok
```

## 11. Write the seed, the store layer, the work, and the program

The seed data is reference data every database starts with: three teams with fixed ids.

`seeds/teams.json`:

```json
[
  {"id": "0192b2a0-0000-7000-8000-000000000001", "code": "core", "name": "Core"},
  {"id": "0192b2a0-0000-7000-8000-000000000002", "code": "edge", "name": "Edge"},
  {"id": "0192b2a0-0000-7000-8000-000000000003", "code": "data", "name": "Data"}
]
```

The seed layer decodes the embedded file and inserts the rows through the store. Its statement
is idempotent, so seeding runs at every startup.

`seed.go`:

```go
package main

import (
	"context"
	_ "embed"
	"encoding/json"

	"example.com/teams/teams"
)

//go:embed seeds/teams.json
var teamSeeds []byte

// seed is the program's seed layer: the reference data every database
// starts with, decoded from the embedded files and inserted through the
// stores. Each store's seed statement is idempotent, so seeding runs at
// every startup.
func seed(ctx context.Context, stores *Stores) (int64, error) {
	var rows []teams.SeedTeam
	if err := json.Unmarshal(teamSeeds, &rows); err != nil {
		return 0, err
	}
	return stores.Teams.Seed(ctx, rows)
}
```

The store layer builds every package store over the database and verifies them together.

`stores.go`:

```go
package main

import (
	"context"

	"example.com/teams/teams"
)

// Stores is the program's store layer: one store per package, each compiled
// against the shared catalog.
type Stores struct {
	Teams *teams.Store
}

// newStores builds every store over the database.
func newStores(db *Database) *Stores {
	return &Stores{Teams: teams.NewStore(db.DB, db.Catalog)}
}

// Verify checks every store against the live schema.
func (s *Stores) Verify(ctx context.Context) error {
	return s.Teams.Verify(ctx)
}
```

The work is the program's runtime: the reads, each command, and the errors a caller matches
on. Each line names the request it made and its outcome. A list read prints its rows as a
table beneath, and the single read prints the team as JSON. `refused` names the error each
refused request matches.

`run.go`:

```go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"text/tabwriter"

	"example.com/teams/teams"
	"github.com/standards-lab/sqlate"
	"github.com/standards-lab/sqlate/query"
)

// run is the program's work: the reads, then the commands, then the requests
// the store refuses. Each line names the request and its outcome.
func run(ctx context.Context, stores *Stores) error {
	first := query.Page{Number: 1, Size: 10}
	page, err := stores.Teams.List(ctx, query.Directives{
		Sort: []query.Sort{{Field: "code"}},
	}, first)
	if err != nil {
		return err
	}
	fmt.Printf("list sorted by code, page %d of size %d: %d of %d teams\n",
		first.Number, first.Size, len(page.Items), page.Total)
	printTable(page.Items)

	one, err := stores.Teams.Find(ctx, "core")
	if err != nil {
		return err
	}
	fmt.Println("find core:")
	printJSON(one)

	some, err := stores.Teams.FindByCodes(ctx, []string{"core", "edge"})
	if err != nil {
		return err
	}
	fmt.Println("find by codes core, edge:")
	printTable(some)

	platform := teams.NewTeam{Code: "platform", Name: "Platform"}
	created, err := stores.Teams.Create(ctx, platform)
	if err != nil {
		return err
	}
	fmt.Printf("create %s:\n  created: id %s, version %d\n", input(platform), created.ID, created.Version)

	rename := teams.RenameTeam{Name: "Platform Engineering"}
	version, err := stores.Teams.Rename(ctx, created.ID, created.Version, rename)
	if err != nil {
		return err
	}
	fmt.Printf("rename %s to %q at version %d: version %d\n", platform.Code, rename.Name, created.Version, version)

	infra := teams.NewTeam{Code: "infra", Name: "Infrastructure"}
	replaced, err := stores.Teams.Replace(ctx, created.ID, version, infra)
	if err != nil {
		return err
	}
	fmt.Printf("replace %s with %s at version %d:\n  deleted, then created: id %s, version %d\n",
		platform.Code, input(infra), version, replaced.ID, replaced.Version)

	// The requests the store refuses, each with the error a caller matches.
	invalid := teams.NewTeam{Code: "Not Valid", Name: "x"}
	_, err = stores.Teams.Create(ctx, invalid)
	if err = refused("create "+input(invalid), err); err != nil {
		return err
	}

	duplicate := teams.NewTeam{Code: "core", Name: "Again"}
	_, err = stores.Teams.Create(ctx, duplicate)
	if err = refused("create "+input(duplicate), err); err != nil {
		return err
	}

	bad := query.Filter{Field: "id", Op: query.OpEq, Value: "not-a-uuid"}
	_, err = stores.Teams.List(ctx, query.Directives{Filters: []query.Filter{bad}}, first)
	if err = refused(fmt.Sprintf("list filtered on %s = %q", bad.Field, bad.Value), err); err != nil {
		return err
	}

	stale := teams.RenameTeam{Name: "Stale"}
	_, err = stores.Teams.Rename(ctx, one.ID, one.Version-1, stale)
	if err = refused(fmt.Sprintf("rename %s to %q at version %d", one.Code, stale.Name, one.Version-1), err); err != nil {
		return err
	}
	return nil
}

// input names a team command's input as the program prints it.
func input(t teams.NewTeam) string {
	return fmt.Sprintf("{code %q, name %q}", t.Code, t.Name)
}

// refused prints a refused request and the error a caller matches it by,
// the outcomes aligned; any other result is returned as an error.
func refused(request string, err error) error {
	var violation *sqlate.ConstraintError
	var outcome string
	switch {
	case errors.Is(err, teams.ErrValidation):
		outcome = "invalid (teams.ErrValidation)"
	case errors.Is(err, sqlate.ErrUniqueViolation) && errors.As(err, &violation):
		outcome = fmt.Sprintf("duplicate (sqlate.ErrUniqueViolation)\n  constraint %s (sqlate.ConstraintError)", violation.Constraint)
	case errors.Is(err, query.ErrDirectives):
		outcome = "bad request (query.ErrDirectives)"
	case errors.Is(err, query.ErrVersionMismatch):
		outcome = "stale (query.ErrVersionMismatch)"
	default:
		return fmt.Errorf("%s: want a refusal, got %v", request, err)
	}
	fmt.Printf("%-36s %s\n", request+":", outcome)
	return nil
}

// printJSON writes v as indented JSON.
func printJSON(v any) {
	out, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(out))
}

// printTable writes the teams as a table.
func printTable(rows []teams.Team) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "CODE\tNAME\tVERSION\tID")
	for _, t := range rows {
		fmt.Fprintf(w, "%s\t%s\t%d\t%s\n", t.Code, t.Name, t.Version, t.ID)
	}
	w.Flush()
}
```

`main.go` now runs the whole sequence: connect, migrate, build the stores, verify them, seed,
do the work, revert the migration, and close.

`main.go`:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
)

// main is the program's sequence: connect, migrate, build the stores, verify
// them, seed, do the work, revert the migration, and close.
func main() {
	ctx := context.Background()

	db, err := openDatabase(os.Getenv("SQLATE_DSN"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	schema, err := newSchema(db)
	if err != nil {
		log.Fatal(err)
	}
	version, err := schema.Up(ctx)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("schema version", version)

	stores := newStores(db)
	if err := stores.Verify(ctx); err != nil {
		log.Fatal(err)
	}
	fmt.Println("stores verified")
	seeded, err := seed(ctx, stores)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("seeded", seeded, "teams")

	if err := run(ctx, stores); err != nil {
		log.Fatal(err)
	}

	if err := schema.Down(ctx); err != nil {
		log.Fatal(err)
	}
}
```

```sh
mise run program
```

```
schema version 1
stores verified
seeded 3 teams
list sorted by code, page 1 of size 10: 3 of 3 teams
CODE  NAME  VERSION  ID
core  Core  1        0192b2a0-0000-7000-8000-000000000001
data  Data  1        0192b2a0-0000-7000-8000-000000000003
edge  Edge  1        0192b2a0-0000-7000-8000-000000000002
find core:
{
  "id": "0192b2a0-0000-7000-8000-000000000001",
  "code": "core",
  "name": "Core",
  "version": 1,
  "created_at": "2026-11-10T17:13:39.255409Z",
  "updated_at": "2026-11-10T17:13:39.255409Z"
}
find by codes core, edge:
CODE  NAME  VERSION  ID
core  Core  1        0192b2a0-0000-7000-8000-000000000001
edge  Edge  1        0192b2a0-0000-7000-8000-000000000002
create {code "platform", name "Platform"}:
  created: id 56aeb7d8-91c3-4d3d-aeb9-84ff7be8c244, version 1
rename platform to "Platform Engineering" at version 1: version 2
replace platform with {code "infra", name "Infrastructure"} at version 2:
  deleted, then created: id ff76e58c-5b04-4895-85cd-c8824080be11, version 1
create {code "Not Valid", name "x"}: invalid (teams.ErrValidation)
create {code "core", name "Again"}:  duplicate (sqlate.ErrUniqueViolation)
  constraint uq_team_code (sqlate.ConstraintError)
list filtered on id = "not-a-uuid":  bad request (query.ErrDirectives)
rename core to "Stale" at version 0: stale (query.ErrVersionMismatch)
```

The ids of the created and replaced teams and the timestamps differ on every run; the seeded
ids do not.

- The list asks for page 1, ten teams a page, sorted by code, and returns all three seeded
  teams: 3 of a `Total` of 3. `find core` returns one whole team, as JSON, and
  `find by codes core, edge` returns the two teams in code order.
- `create` inserts platform and returns its identity: its new id, at version 1.
- `rename` sends the version `create` returned, 1. The guard matches it, so the name changes
  and the version advances to 2.
- `replace` is the store's `Replace` from step 8, not an update: in one transaction it deletes
  platform, guarded at the version the rename returned, 2, then creates infra from the input.
  infra is a new row, so it has a new id and starts at version 1, and platform is gone. Had the
  delete been refused, `Transact` would roll back and nothing would be created.
- The last lines are requests the store refuses, each with the error a caller matches. The
  malformed code `"Not Valid"` is the package's own `teams.ErrValidation`, rejected before any
  SQL runs. Creating core again breaks the unique code: `errors.Is` matches
  `sqlate.ErrUniqueViolation`, and `errors.As` finds the `sqlate.ConstraintError`, whose
  `Constraint` is the name the schema gave it, `uq_team_code`, so a program can map it to the
  field it reports. The filter's value is no uuid, so the list unwraps to
  `query.ErrDirectives`, one check for any bad request. The rename at version 0, below the
  version 1 that `find core` read, is `query.ErrVersionMismatch`, the guard's own conflict.

## 12. Scope by organization

So far, every caller sees every team. A program that holds several customers' data in one
database must keep each customer to its own rows. This step adds a second package, `projects`,
that holds the projects of several organizations in one table and scopes every statement it runs
to one organization: a read returns only that organization's rows, and a command finds no row
another organization owns. Its list is read a page at a time, each page continuing from a cursor
the page before it returned. Its one command, `archive`, is a guarded command that returns the
row it changed.

The schema comes first. The second migration adds the organizations and their projects. A
project's code is unique within its organization, and `archived_at` marks an archived project,
which stays in the table.

`migrations/0002_project.up.sql`:

```sql
CREATE TABLE org (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  CONSTRAINT uq_org_code UNIQUE (code)
);

CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org (id),
  team_id uuid NOT NULL REFERENCES team (id),
  code text NOT NULL,
  name text NOT NULL,
  archived_at timestamp,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_project_org_code UNIQUE (org_id, code)
);
```

`migrations/0002_project.down.sql`:

```sql
DROP TABLE project;
DROP TABLE org;
```

The schema layer reads the whole directory as one set, so it applies the new pair as it stands,
and the set's version becomes 2.

Next, two patterns carry the scope, both standard SQL. `tenant` is the predicate that keeps a
statement to one organization. Its parameter, `org`, passes through every include, so each
statement that includes `tenant` takes the organization as `org`, cast to `uuid`. `live` keeps
archived rows out.

`patterns/tenant.sql`:

```sql
--| tier: standard
-- Scopes a statement to one organization's rows.
org_id = {{org:uuid}}
```

`patterns/live.sql`:

```sql
--| tier: standard
-- Keeps archived rows out of every read and command.
archived_at IS NULL
```

Then the statements, which include those patterns. `project_view` is the projection base: one
organization's live projects, each with its team's code. Its fields are declared `not null`, so
an ordering over them, with the key after it, is cursorable: each page returns a cursor, and the
next read continues past it.

`projects/statements/project_view.sql`:

```sql
--| tier: standard
--| key: id
--| field: id uuid not null
--| field: code text not null
--| field: name text not null
--| field: team text not null
--| field: created_at timestamp not null
-- One organization's live projects, each with its team's code.
SELECT p.id, p.code, p.name, t.code AS team, p.version, p.created_at
FROM project p
JOIN team t ON t.id = p.team_id
WHERE {{> app.tenant}} AND {{> app.live}}
```

`archive` is built from four patterns. In its `WHERE`, `sql.guard_where` matches the key and the
version the caller read, `app.tenant` keeps it to the organization, and `app.live` to a project
not yet archived. In its `SET`, `sql.guard_set` advances the version. Its `returning`
declaration names `project_row`, the statement in the same directory that reads the changed row
back, so the command returns its row while its file stays standard SQL. Where the dialect has a
single-statement form, as PostgreSQL has with `RETURNING`, the library appends it to the
command; on any other engine, the read runs after the command.

`projects/statements/archive.sql`:

```sql
--| tier: standard
--| returning: project_row
-- Archives a live project of the organization, guarded by its version.
UPDATE project
SET archived_at = CURRENT_TIMESTAMP, {{> sql.guard_set}}
WHERE {{> sql.guard_where}} AND {{> app.tenant}} AND {{> app.live}}
```

`project_row` reads the row by its key within the organization. A returning read takes no
parameter the command does not, and reads the table the command changes.

`projects/statements/project_row.sql`:

```sql
--| tier: standard
-- The row an archive changed, read in the organization.
SELECT id, code, archived_at, version FROM project
WHERE id = {{id}} AND {{> app.tenant}}
```

The seed is two statements, idempotent as the teams' seed is: `seed_org` inserts an
organization unless its code exists, and `seed` a project unless its code exists in the
organization. A project's team is named by its code, so the seed data needs no team ids.

`projects/statements/seed_org.sql`:

```sql
--| tier: standard
MERGE INTO org AS o
USING (VALUES ({{id:uuid}}, {{code}}, {{name}})) AS s (id, code, name)
ON o.code = s.code
WHEN NOT MATCHED THEN INSERT (id, code, name) VALUES (s.id, s.code, s.name)
```

`projects/statements/seed.sql`:

```sql
--| tier: standard
-- Inserts an organization's project unless its code exists there; the team is named by code.
MERGE INTO project AS p
USING (SELECT {{id:uuid}} AS id, {{org:uuid}} AS org_id, t.id AS team_id, {{code}} AS code, {{name}} AS name
       FROM team t WHERE t.code = {{team}}) AS s
ON p.org_id = s.org_id AND p.code = s.code
WHEN NOT MATCHED THEN INSERT (id, org_id, team_id, code, name)
  VALUES (s.id, s.org_id, s.team_id, s.code, s.name)
```

Now the code. The package keeps its types and its store in one file. `List` reads an
organization's first page, and `Continue` reads the page past a cursor a previous page returned;
both bind the organization to the base's `org` parameter with `query.With`, beside the request's
directives. `archive` is bound with `Returning`, which scans the row it returns, and `Guarded`,
which names the version's parameter and reads a row's version. When the command changes nothing,
the guard reads the row to tell why: no row is `sql.ErrNoRows`, a row at another version is
`query.ErrVersionMismatch`, and a row still at the version the caller read, which the command's
own predicate refused, is a `*query.RefusedError[Row]` carrying the row.

`projects/projects.go`:

```go
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

// SeedOrg is one organization of reference data, its id fixed.
type SeedOrg struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

// SeedProject is one project of reference data, its id fixed, its
// organization named by id and its team by code.
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

// NewStore compiles the package's statements against the catalog and binds
// them.
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

// Verify prepares every statement and the view's field contract against
// the live schema.
func (s *Store) Verify(ctx context.Context) error { return query.Verify(ctx, s.db, s.stmts, s.view) }

// Seed inserts every organization and project not yet present, as one unit
// of work, and returns how many projects it inserted.
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
```

The package's test prints its SQL through its own copy of the teams' `layout`, at the bottom of
`sql_test.go`.

`TestSQL` publishes the program's own `patterns` directory and builds the store over the stub.
It reads a first page, newest first and filtered to two teams, then the page past that page's
cursor. Each subtest prints one statement: `archive` compiled for PostgreSQL, the first page,
and the next page.

`projects/sql_test.go`:

```go
package projects_test

import (
	"context"
	"database/sql/driver"
	"fmt"
	"os"
	"strings"
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

// clauses are the keywords layout starts a line with.
var clauses = map[string]bool{
	"SET": true, "FROM": true, "JOIN": true, "WHERE": true, "ORDER": true, "OFFSET": true, "RETURNING": true,
}

// layout lays out the SQL a test prints to read in a narrow terminal: each
// clause on its own line, a subquery's a step deeper, and each AND and each
// assignment after a SET's first on a line of its own. Only the whitespace
// changes.
func layout(sql string) string {
	var b strings.Builder
	depth, clause, last := 0, "", ""
	for i, line := range strings.Split(sql, "\n") {
		for j, word := range strings.Fields(line) {
			switch {
			case i == 0 && j == 0:
			case clauses[word] || j == 0:
				b.WriteByte('\n')
				b.WriteString(strings.Repeat("  ", depth))
			case word == "AND", clause == "SET" && depth == 0 && strings.HasSuffix(last, ","):
				b.WriteByte('\n')
				b.WriteString(strings.Repeat("  ", depth+1))
			default:
				b.WriteString(" ")
			}
			if clauses[word] {
				clause = word
			}
			b.WriteString(word)
			depth += strings.Count(word, "(") - strings.Count(word, ")")
			last = word
		}
	}
	return b.String()
}
```

The program's work embeds the projects' seed data, so the data comes first: two
organizations, acme with four projects and globex with one. Both have a project coded `atlas`,
which is allowed, since a code is unique only within its organization.

`seeds/projects.json`:

```json
{
  "orgs": [
    {"id": "0192b2a0-0000-7000-8000-0000000000aa", "code": "acme", "name": "Acme"},
    {"id": "0192b2a0-0000-7000-8000-0000000000bb", "code": "globex", "name": "Globex"}
  ],
  "projects": [
    {"id": "0192b2a0-0000-7000-8000-000000000101", "org": "0192b2a0-0000-7000-8000-0000000000aa", "team": "core", "code": "atlas", "name": "Atlas"},
    {"id": "0192b2a0-0000-7000-8000-000000000102", "org": "0192b2a0-0000-7000-8000-0000000000aa", "team": "edge", "code": "beacon", "name": "Beacon"},
    {"id": "0192b2a0-0000-7000-8000-000000000103", "org": "0192b2a0-0000-7000-8000-0000000000aa", "team": "core", "code": "compass", "name": "Compass"},
    {"id": "0192b2a0-0000-7000-8000-000000000104", "org": "0192b2a0-0000-7000-8000-0000000000aa", "team": "data", "code": "delta", "name": "Delta"},
    {"id": "0192b2a0-0000-7000-8000-000000000201", "org": "0192b2a0-0000-7000-8000-0000000000bb", "team": "core", "code": "atlas", "name": "Globex Atlas"}
  ]
}
```

`projects.go` is the projects' work in the program: it seeds, reads acme's projects two at a
time, following each page's cursor while `More` is true, archives atlas at the version it read,
and then tries three archives that are refused. `outcome` names each result the way a caller
tells them apart.

`projects.go`:

```go
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
	for n := 1; ; n++ {
		fmt.Printf("acme page %d: %d of %d projects\n", n, len(page.Items), page.Total)
		for _, p := range page.Items {
			fmt.Printf("  %-8s %s\n", p.Code, p.Team)
		}
		if !page.More {
			break
		}
		if page, err = stores.Projects.Continue(ctx, acme, d, page.Next, 2); err != nil {
			return err
		}
	}

	// Archive atlas at the version the read returned, then try three archives
	// that are refused: again at the new version, at the old one, and from
	// another organization.
	atlas := "0192b2a0-0000-7000-8000-000000000101"
	for _, a := range []struct {
		org, name string
		version   int64
	}{{acme, "acme", 1}, {acme, "acme", 2}, {acme, "acme", 1}, {globex, "globex", 2}} {
		row, err := stores.Projects.Archive(ctx, a.org, atlas, a.version)
		result, ok := outcome(row, err)
		if !ok {
			return err
		}
		fmt.Printf("archive atlas in %-6s at version %d: %s\n", a.name, a.version, result)
	}
	return nil
}

// outcome names an archive's result as a caller tells it apart: the row's new
// version, or the error a refusal matches; false for any other error.
func outcome(row projects.Row, err error) (string, bool) {
	var refused *query.RefusedError[projects.Row]
	switch {
	case err == nil:
		return fmt.Sprint("archived, version ", row.Version), true
	case errors.As(err, &refused):
		return "refused (query.RefusedError)", true
	case errors.Is(err, query.ErrVersionMismatch):
		return "stale (query.ErrVersionMismatch)", true
	case errors.Is(err, sql.ErrNoRows):
		return "not found (sql.ErrNoRows)", true
	}
	return "", false
}
```

The store layer builds both stores and verifies them together, `main.go` runs the projects' work
after the teams', then reports the migration it reverts, and the linter reads the new statement
directory.

`stores.go`:

```go
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
```

`main.go`:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
)

// main is the program's sequence: connect, migrate, build the stores, verify
// them, seed, do the teams' work and the projects', revert the newest
// migration, and close.
func main() {
	ctx := context.Background()

	db, err := openDatabase(os.Getenv("SQLATE_DSN"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	schema, err := newSchema(db)
	if err != nil {
		log.Fatal(err)
	}
	version, err := schema.Up(ctx)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("schema version", version)

	stores := newStores(db)
	if err := stores.Verify(ctx); err != nil {
		log.Fatal(err)
	}
	fmt.Println("stores verified")
	seeded, err := seed(ctx, stores)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("seeded", seeded, "teams")

	if err := run(ctx, stores); err != nil {
		log.Fatal(err)
	}

	if err := runProjects(ctx, stores); err != nil {
		log.Fatal(err)
	}

	if err := schema.Down(ctx); err != nil {
		log.Fatal(err)
	}
	fmt.Println("reverted the newest migration")
}
```

`sqlint.toml`:

```toml
engine = "github.com/standards-lab/sqlate/postgres"

[sources]
sql = "github.com/standards-lab/sqlate"
app = "patterns"

[statements]
dirs = ["teams/statements", "projects/statements"]

[patterns]
dirs = ["patterns"]

[migrations]
dirs = ["migrations"]
```

Now run it, starting with the SQL. Each subtest of `TestSQL` prints one statement, and
`-run TestSQL/archive` runs the one named `archive`:

```sh
go test -C projects -run TestSQL/archive
```

```
-- archive on PostgreSQL, parameters [id version org]
UPDATE project
SET archived_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP,
  version = version + 1
WHERE id = $1
  AND version = $2
  AND org_id = CAST($3 AS uuid)
  AND archived_at IS NULL
RETURNING id, code, archived_at, version
PASS
ok  	example.com/teams/projects
```

This is the `archive` PostgreSQL receives, its patterns spliced in. In the `WHERE`,
`id = $1 AND version = $2` is `guard_where`, the organization's cast placeholder is `tenant`, and
`archived_at IS NULL` is `live`; the two assignments after the first in the `SET` are
`guard_set`'s. The dialect added `RETURNING` with the columns `project_row` reads, so on
PostgreSQL the command and its read are one statement.

```sh
go test -C projects -run TestSQL/first
```

```
-- first page: newest first, teams core and edge, 1 row a page
SELECT *
FROM (SELECT q.*, COUNT(*) OVER () AS sqlate_total
  FROM (SELECT p.id, p.code, p.name, t.code AS team, p.version, p.created_at
    FROM project p
    JOIN team t ON t.id = p.team_id
    WHERE org_id = CAST($1 AS uuid)
      AND archived_at IS NULL) q
  WHERE q.team IN (CAST($2 AS text), CAST($3 AS text))) q
ORDER BY q.created_at DESC, q.id DESC
OFFSET $4 ROWS FETCH NEXT $5 ROWS ONLY
PASS
ok  	example.com/teams/projects
```

The first page is `project_view` inside the same collection read as the teams' list: the middle
layer filters to the two teams and counts the rows it keeps, and the outer layer orders the rows
newest first and pages them. The organization is `$1`, inside the base, so the count covers
only its rows.

```sh
go test -C projects -run TestSQL/next
```

```
-- next page: past the first page's cursor
SELECT *
FROM (SELECT q.*, COUNT(*) OVER () AS sqlate_total
  FROM (SELECT p.id, p.code, p.name, t.code AS team, p.version, p.created_at
    FROM project p
    JOIN team t ON t.id = p.team_id
    WHERE org_id = CAST($1 AS uuid)
      AND archived_at IS NULL) q
  WHERE q.team IN (CAST($2 AS text), CAST($3 AS text))) q
WHERE (q.created_at, q.id) < (CAST($4 AS timestamp), CAST($5 AS uuid))
ORDER BY q.created_at DESC, q.id DESC
OFFSET $6 ROWS FETCH NEXT $7 ROWS ONLY
PASS
ok  	example.com/teams/projects
```

The next page is the same read with one line more: the keyset predicate, which continues past
the cursor's `created_at` and `id`, in the order's direction. It is the row-value comparison
PostgreSQL's overlay spells, from step 5. It applies after the count, so every page reports the
same total.

The linter now reads the projects' statements too:

```sh
mise run lint
```

```
sqlint: ok
```

Then run the program:

```sh
mise run program
```

Its output begins with `schema version 2`, since both migrations are applied, and repeats the
teams' lines from step 11. The projects' lines follow:

```
seeded 5 projects
acme page 1: 2 of 4 projects
  atlas    core
  beacon   edge
acme page 2: 2 of 4 projects
  compass  core
  delta    data
archive atlas in acme   at version 1: archived, version 2
archive atlas in acme   at version 2: refused (query.RefusedError)
archive atlas in acme   at version 1: stale (query.ErrVersionMismatch)
archive atlas in globex at version 2: not found (sql.ErrNoRows)
reverted the newest migration
```

The acme organization has four projects, so its first page shows two of the four, and that
page's cursor leads to the other two; globex's atlas is not among them. The first archive, at
version 1, succeeds and returns the row at version 2. The next three are refused, each with its
own error. At version 2, `live` keeps the archived row out, so the command changes nothing; the
guard reads the row, finds it at the version the caller gave, and returns a refusal carrying the
row. At version 1, the guard finds version 2: the caller's version is stale. From globex,
`tenant` keeps acme's project out, so the guard finds no row: another organization's project is
not found, and a caller learns nothing of rows outside its organization. Last, the program
reverts the newest migration, 0002; the teams' migration stays applied, and the next step drops
it with the volume.

## 13. Clean up

```sh
mise run db:reset
```

The program's last step reverted the newest migration, and `db:reset` drops the volume. The
finished tree:

```
teams/
├── compose/
│   └── postgres/
│       └── Dockerfile
├── compose.yml
├── database.go
├── go.mod
├── main.go
├── migrations/
│   ├── 0001_team.down.sql
│   ├── 0001_team.up.sql
│   ├── 0002_project.down.sql
│   └── 0002_project.up.sql
├── mise.toml
├── patterns/
│   ├── identity.sql
│   ├── live.sql
│   └── tenant.sql
├── projects/
│   ├── projects.go
│   ├── sql_test.go
│   └── statements/
│       ├── archive.sql
│       ├── project_row.sql
│       ├── project_view.sql
│       ├── seed.sql
│       └── seed_org.sql
├── projects.go
├── run.go
├── schema.go
├── seed.go
├── seeds/
│   ├── projects.json
│   └── teams.json
├── sqlint.toml
├── stores.go
└── teams/
    ├── database.go
    ├── database_test.go
    ├── entities.go
    ├── patterns_test.go
    ├── sql_test.go
    └── statements/
        ├── create.sql
        ├── delete.sql
        ├── edit.sql
        ├── find_by_codes.sql
        ├── seed.sql
        ├── team_view.sql
        └── version.sql
```

From here, the [features](features.md) document covers each mechanism in the detail the program
skipped, and the [glossary](glossary.md) defines the terms.
