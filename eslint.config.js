// The lint the check runs: the recommended rules over the code, and the leftover check over the
// build, dist/, which fails on any CSS module script the build left in it. The site's build
// rewrites each one the foundation holds (vite.config.ts); one left in dist/ is an import no
// browser without CSS module scripts loads, so the page would break where they're unsupported.
// test/unit/leftover.test.ts runs the block over a fixture of built output.
// Adapted from spike-html-apps-foundation (d5037b4): eslint.config.js, its CSS module script
// selectors turned around: the foundation requires the attribute on every .css import, and this
// refuses it on any import in the build; without its layer rules, which the site has no source
// for.
// From spike-html-hosting (cb0511c): eslint.config.js.

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const code = ["**/*.js", "**/*.ts"];

/** The build Vite writes, which the leftover check alone reads: minified, and not the site's own
 * code, so no other rule applies to it. */
export const build = ["dist/**/*.js"];

// The attribute a CSS module script carries, type "css", by its key's name or its quoted key: in a
// declaration's attributes, and in an import()'s options, `{ with: { type: "css" } }`, whose with
// key is a name or quoted too.
/** @param {string} name */
const key = (name) => `:matches([key.name='${name}'], [key.value='${name}'])`;
const cssType = `${key("type")}[value.value='css']`;
const message =
  "A CSS module script is left in the build: the site's build rewrites each one " +
  "(vite.config.ts's standardCssModules), and one it missed loads in no browser without them.";
const leftovers = [
  ...["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].map((type) => ({
    selector: `${type}:has(> ImportAttribute${cssType})`,
    message,
  })),
  {
    // Matched at the type property, inside the options: esquery's :has doesn't walk an
    // ImportExpression's options, where ESLint's traversal, which the child combinator follows,
    // does.
    selector: `ImportExpression > ObjectExpression.options > Property${key("with")} > ObjectExpression.value > Property${cssType}`,
    message,
  },
];

export default defineConfig([
  { files: code, ignores: build, extends: [js.configs.recommended, tseslint.configs.recommended] },
  { files: code, ignores: build, languageOptions: { globals: globals.node } },
  { files: build, rules: { "no-restricted-syntax": ["error", ...leftovers] } },
]);
