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
