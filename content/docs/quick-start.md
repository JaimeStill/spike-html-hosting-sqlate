# Quick start

A tutorial that builds a working program from an empty directory:

- a `teams` package with validated commands and a store over a `team` table
- a migration
- a shared pattern
- seed data
- a test that needs no database
- the linter over the SQL
- a program whose startup and runtime are split into layers
- a second package scoped to one organization, read a page at a time by cursor

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

[tasks.sql]
description = "Print the SQL each test composes; no database needed"
run = "go test ./... -run SQL -v"

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
```

The library's patterns are standard SQL, and an engine may overlay them: an overlay replaces a
pattern by name with the engine's own spelling of it. `postgres.Patterns()` is the library's
source with PostgreSQL's overlay applied. It respells one pattern, the keyset predicate a read
continues by cursor, as the row-value comparison `(a, b) > (x, y)` in place of the standard
chain of disjuncts, and takes every other pattern as written. No statement names the
overlaid pattern, so `query.Patterns()` would serve as well; only the text of a continued
page's predicate differs.

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
ok  	example.com/teams/teams
```

The driver is strict where a real one is: an unscripted call, a wrong argument count, and a
response of the wrong shape each fail the test. The second test proves a rejected command
never reaches the driver.

The recorder also shows what PostgreSQL receives for a statement the library composes. A list
read is the projection base inside the library's collection read, and its text depends on the
request, so the test runs one and logs the call. `WithTotal` adds the count the collection read
returns as each row's trailing column.

`teams/sql_test.go`:

```go
package teams_test

import (
	"context"
	"database/sql/driver"
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
	t.Logf("list\n%s", rec.Calls()[0].SQL)
}
```

The `sql` task runs every test whose name matches `SQL`, verbosely, so the log prints:

```sh
mise run sql
```

```
=== RUN   TestCreate_RejectsABadCodeBeforeAnySQL
--- PASS: TestCreate_RejectsABadCodeBeforeAnySQL (0.00s)
=== RUN   TestSQL
    sql_test.go:29: list
        SELECT * FROM (SELECT q.*, COUNT(*) OVER () AS sqlate_total FROM (SELECT id, code, name, version, created_at, updated_at
        FROM team) q WHERE q.code LIKE CAST($1 AS text)) q ORDER BY q.name, q.id OFFSET $2 ROWS FETCH NEXT $3 ROWS ONLY
--- PASS: TestSQL (0.00s)
PASS
ok  	example.com/teams/teams
```

The innermost `SELECT` is `team_view` as written. The layer around it applies the filter and
counts the rows it keeps, and the outer layer orders and pages them. The order ends in the
key, `q.id`, so it is total and a page holds the same rows on every read. The filter's value,
cast to the type the field declares, and the page's offset and size are placeholders: a
request's values never become SQL text. The name `TestCreate_RejectsABadCodeBeforeAnySQL` also
matches `SQL`, so that test runs too.

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

The task exits 1. Without `guard_where`, the command advances a version no caller's read is
checked against, so a stale write wins. A standard-tier file promises SQL every engine
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
on. The list reads print as a table and the single reads as JSON.

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

// run is the program's work: the reads as JSON, then the commands, then the
// errors a caller matches on.
func run(ctx context.Context, stores *Stores) error {
	page, err := stores.Teams.List(ctx, query.Directives{
		Sort: []query.Sort{{Field: "code"}},
	}, query.Page{Number: 1, Size: 10})
	if err != nil {
		return err
	}
	fmt.Println("list:", len(page.Items), "of", page.Total)
	printTable(page.Items)

	one, err := stores.Teams.Find(ctx, "core")
	if err != nil {
		return err
	}
	fmt.Println("find:")
	print(one)

	some, err := stores.Teams.FindByCodes(ctx, []string{"core", "edge"})
	if err != nil {
		return err
	}
	fmt.Println("find by codes:")
	printTable(some)

	created, err := stores.Teams.Create(ctx, teams.NewTeam{Code: "platform", Name: "Platform"})
	if err != nil {
		return err
	}
	fmt.Println("create:")
	print(created)

	version, err := stores.Teams.Rename(ctx, created.ID, created.Version, teams.RenameTeam{Name: "Platform Engineering"})
	if err != nil {
		return err
	}
	fmt.Println("rename: version", version)

	replaced, err := stores.Teams.Replace(ctx, created.ID, version, teams.NewTeam{Code: "infra", Name: "Infrastructure"})
	if err != nil {
		return err
	}
	fmt.Println("replace:")
	print(replaced)

	// The errors a caller matches on.
	_, err = stores.Teams.Create(ctx, teams.NewTeam{Code: "Not Valid", Name: "x"})
	fmt.Println("invalid command:", errors.Is(err, teams.ErrValidation))

	_, err = stores.Teams.Create(ctx, teams.NewTeam{Code: "core", Name: "Again"})
	var violation *sqlate.ConstraintError
	if errors.Is(err, sqlate.ErrUniqueViolation) && errors.As(err, &violation) {
		fmt.Println("duplicate:", violation.Constraint)
	}

	_, err = stores.Teams.List(ctx, query.Directives{
		Filters: []query.Filter{{Field: "id", Op: query.OpEq, Value: "not-a-uuid"}},
	}, query.Page{Number: 1, Size: 10})
	fmt.Println("bad request:", errors.Is(err, query.ErrDirectives))

	_, err = stores.Teams.Rename(ctx, one.ID, one.Version-1, teams.RenameTeam{Name: "Stale"})
	fmt.Println("stale version:", errors.Is(err, query.ErrVersionMismatch))
	return nil
}

// print writes v as indented JSON.
func print(v any) {
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
list: 3 of 3
CODE  NAME  VERSION  ID
core  Core  1        0192b2a0-0000-7000-8000-000000000001
data  Data  1        0192b2a0-0000-7000-8000-000000000003
edge  Edge  1        0192b2a0-0000-7000-8000-000000000002
find:
{
  "id": "0192b2a0-0000-7000-8000-000000000001",
  "code": "core",
  "name": "Core",
  "version": 1,
  "created_at": "2026-09-04T18:30:27.637066Z",
  "updated_at": "2026-09-04T18:30:27.637066Z"
}
find by codes:
CODE  NAME  VERSION  ID
core  Core  1        0192b2a0-0000-7000-8000-000000000001
edge  Edge  1        0192b2a0-0000-7000-8000-000000000002
create:
{
  "id": "6b57bc47-cbc5-4e41-8520-fb5de5c065ff",
  "version": 1
}
rename: version 2
replace:
{
  "id": "94470b00-137d-4edd-a2f7-806069e2912a",
  "version": 1
}
invalid command: true
duplicate: uq_team_code
bad request: true
stale version: true
```

The ids of the created and replaced teams and the timestamps differ on every run; the seeded
ids do not. The last four lines are the errors a caller matches on. The malformed code is the
package's own `teams.ErrValidation`, rejected before any SQL runs. The duplicate is a
`sqlate.ConstraintError` whose `Constraint` is the name the schema gave it, `uq_team_code`, so
a program can map it to the field it reports. The bad filter value unwraps to
`query.ErrDirectives`, one check for any bad request. The stale version is
`query.ErrVersionMismatch`, the guard's own conflict.

## 12. Scope by organization

A second package, `projects`, holds the projects of several organizations, and every statement
it runs is scoped to one of them: a read returns one organization's rows, and a command finds
no row another organization owns. Its read is paged by cursor, and its one command, `archive`,
is a guarded command that returns the row it changed.

The second migration adds the organizations and their projects. A project's code is unique
within its organization, and `archived_at` marks an archived project, which stays in the table.

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

Two patterns carry the scope, both standard SQL. `tenant` is the predicate that keeps a
statement in one organization; its parameter passes through every include, so each statement
that includes it takes the organization as `org`, cast to `uuid`. `live` keeps archived rows
out.

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

`project_view` is the projection base: one organization's live projects, each with its team's
code. Its fields are declared `not null`, so an ordering over them, with the key after it, is
cursorable: a page issues the cursor that continues past its last row.

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

`archive` layers four patterns into one predicate: `sql.guard_where`, the key and the version
the caller read; `app.tenant`; and `app.live`. `sql.guard_set` advances the version. Its
`returning` declaration names `project_row`, the statement in the same directory that reads the
changed row back, so the command returns its row from a standard-tier file. Where the dialect
has a single-statement form, as PostgreSQL's `RETURNING` is, the library appends it to the
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

The seed statements are idempotent, as the teams' is. A project's team is named by its code,
so the seed file needs no team ids.

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

The package keeps its types and its store in one file. `List` and `Continue` bind the
organization to the base's own parameter with `query.With`, beside the request's directives.
`Continue` reads the page past a cursor a previous page returned. `archive` is bound with
`Returning`, which scans the row, and `Guarded`, which names the version's parameter and reads
a row's version. When the command changes nothing, the guard classifies the row its read finds:
no row is `sql.ErrNoRows`, a row at another version is `query.ErrVersionMismatch`, and a row at
the version the caller read, which the command's own predicate refused, is a
`*query.RefusedError[Row]` carrying the row.

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

// Statements is the compiled inventory, for a test that prints it.
func (s *Store) Statements() *query.Statements { return s.stmts }

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

The package's `TestSQL` publishes the program's own `patterns` directory, prints each statement
as compiled, with its parameters in position order, and prints `archive` compiled for
PostgreSQL. Then it reads a first page, sorted newest first and filtered to two teams, and the
page past its cursor, and prints both. The continued page declines the count with `TotalNone`,
as a walk that has its total from the first page may.

`projects/sql_test.go`:

```go
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
```

```sh
mise run sql
```

The teams package prints as before; the projects package prints:

```
=== RUN   TestSQL
    sql_test.go:34: archive [id version org]
        UPDATE project
        SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE id = $1 AND version = $2 AND org_id = CAST($3 AS uuid) AND archived_at IS NULL
    sql_test.go:34: project_row [id org]
        SELECT id, code, archived_at, version FROM project
        WHERE id = $1 AND org_id = CAST($2 AS uuid)
    sql_test.go:34: project_view [org]
        SELECT p.id, p.code, p.name, t.code AS team, p.version, p.created_at
        FROM project p
        JOIN team t ON t.id = p.team_id
        WHERE org_id = CAST($1 AS uuid) AND archived_at IS NULL
    sql_test.go:34: seed [id org code name team]
        MERGE INTO project AS p
        USING (SELECT CAST($1 AS uuid) AS id, CAST($2 AS uuid) AS org_id, t.id AS team_id, $3 AS code, $4 AS name
               FROM team t WHERE t.code = $5) AS s
        ON p.org_id = s.org_id AND p.code = s.code
        WHEN NOT MATCHED THEN INSERT (id, org_id, team_id, code, name)
          VALUES (s.id, s.org_id, s.team_id, s.code, s.name)
    sql_test.go:34: seed_org [id code name]
        MERGE INTO org AS o
        USING (VALUES (CAST($1 AS uuid), $2, $3)) AS s (id, code, name)
        ON o.code = s.code
        WHEN NOT MATCHED THEN INSERT (id, code, name) VALUES (s.id, s.code, s.name)
    sql_test.go:40: archive on PostgreSQL (returning)
        UPDATE project
        SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE id = $1 AND version = $2 AND org_id = CAST($3 AS uuid) AND archived_at IS NULL
        RETURNING id, code, archived_at, version
    sql_test.go:54: first page
        SELECT * FROM (SELECT q.*, COUNT(*) OVER () AS sqlate_total FROM (SELECT p.id, p.code, p.name, t.code AS team, p.version, p.created_at
        FROM project p
        JOIN team t ON t.id = p.team_id
        WHERE org_id = CAST($1 AS uuid) AND archived_at IS NULL) q WHERE q.team IN (CAST($2 AS text), CAST($3 AS text))) q ORDER BY q.created_at DESC, q.id DESC OFFSET $4 ROWS FETCH NEXT $5 ROWS ONLY
    sql_test.go:55: next page
        SELECT * FROM (SELECT p.id, p.code, p.name, t.code AS team, p.version, p.created_at
        FROM project p
        JOIN team t ON t.id = p.team_id
        WHERE org_id = CAST($1 AS uuid) AND archived_at IS NULL) q WHERE q.team IN (CAST($2 AS text), CAST($3 AS text)) AND (q.created_at, q.id) < (CAST($4 AS timestamp), CAST($5 AS uuid)) ORDER BY q.created_at DESC, q.id DESC OFFSET $6 ROWS FETCH NEXT $7 ROWS ONLY
--- PASS: TestSQL (0.00s)
PASS
ok  	example.com/teams/projects
```

The stub dialect has no single-statement form, so the stub's `archive` has no returning text;
compiled for PostgreSQL, it ends in `RETURNING` and the read's columns. `tenant` renders as a
cast placeholder wherever it is included. The first page counts the rows the filter keeps in
the same statement, as the teams' list does. The next page adds the keyset predicate after the
filter: the row-value comparison PostgreSQL's overlay spells, past the cursor's `created_at`
and `id`, in the order's direction.

The seed is two organizations, acme with four projects and globex with one. Both have a project
coded `atlas`, which the code's uniqueness within an organization allows.

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

`projects.go` is the projects' work: it seeds, reads acme's projects two at a time, following
each page's cursor while `More` is true, archives atlas at the version it read, and tries three
archives that are refused.

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
	fmt.Println("acme page 1:", len(page.Items), "of", page.Total, "more:", page.More)
	for page.More {
		for _, p := range page.Items {
			fmt.Println(" ", p.Code, p.Team)
		}
		if page, err = stores.Projects.Continue(ctx, acme, d, page.Next, 2); err != nil {
			return err
		}
		fmt.Println("acme next page:", len(page.Items))
	}
	for _, p := range page.Items {
		fmt.Println(" ", p.Code, p.Team)
	}

	atlas := "0192b2a0-0000-7000-8000-000000000101"
	row, err := stores.Projects.Archive(ctx, acme, atlas, 1)
	if err != nil {
		return err
	}
	fmt.Println("archive atlas: version", row.Version)

	_, err = stores.Projects.Archive(ctx, acme, atlas, 2)
	var refused *query.RefusedError[projects.Row]
	fmt.Println("archive again, refused:", errors.As(err, &refused))
	_, err = stores.Projects.Archive(ctx, acme, atlas, 1)
	fmt.Println("stale version:", errors.Is(err, query.ErrVersionMismatch))
	_, err = stores.Projects.Archive(ctx, globex, atlas, 2)
	fmt.Println("another organization's project:", errors.Is(err, sql.ErrNoRows))
	return nil
}
```

The store layer builds both stores and verifies them together, the linter reads the new
statement directory, and `main.go` runs the projects' work after the teams', then reports the
migration it reverts.

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

```sh
mise run lint
```

```
sqlint: ok
```

```sh
mise run program
```

The run prints `schema version 2`, then the teams lines of step 11, then the projects':

```
seeded 5 projects
acme page 1: 2 of 4 more: true
  atlas core
  beacon edge
acme next page: 2
  compass core
  delta data
archive atlas: version 2
archive again, refused: true
stale version: true
another organization's project: true
reverted the newest migration
```

The first page counts all four of acme's projects, globex's atlas not among them, and its
cursor continues to the last two. The archive returns the row at version 2. The next three
lines are the refusals. Archiving atlas again at version 2 changes nothing, since `live` keeps
the archived row out, and the read finds it at the version the caller read: a refusal, which
carries the row. At version 1 the read finds version 2, a stale version. In globex, the read
finds no row: another organization's project is not found, so a caller learns nothing of rows
outside its organization. Last, the program reverts the newest migration, 0002; the teams'
migration stays applied, and the next step drops it with the volume.

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
