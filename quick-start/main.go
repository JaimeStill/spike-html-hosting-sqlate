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

	if err := runProjects(ctx, stores); err != nil {
		log.Fatal(err)
	}

	if err := schema.Down(ctx); err != nil {
		log.Fatal(err)
	}
	fmt.Println("reverted the newest migration")
}
