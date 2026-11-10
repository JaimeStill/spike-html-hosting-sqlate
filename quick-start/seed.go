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
