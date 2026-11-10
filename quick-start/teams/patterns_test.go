package teams_test

import "testing/fstest"

// patterns is the app namespace as the test publishes it: the one pattern
// the statements include, so the test needs no file outside the package.
var patterns = fstest.MapFS{
	"identity.sql": {Data: []byte("--| tier: native\n--| native: postgres, RETURNING.\nRETURNING id, version")},
}
