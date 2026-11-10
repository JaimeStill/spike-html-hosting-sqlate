// The copied files the site revises in place: content.json's top-level revised entry, which the
// SDK's content check ignores, names each by its path under content/ with the commit and the
// blob hash of the original it revises, and the revision's status. The tree's own record holds
// the revised file's current blob hash, so the content check holds the copy to the revision, and
// checkRevised holds the revision to its record: a revised file whose current blob is still its
// original, or a revision naming a file no tree records, is a mismatch. The build's revisedPages
// plugin opens each revised file's page with a one-line note linking the original at its commit,
// so the Markdown itself stays free of it and goes back to its source unchanged.

import { posix, relative } from "node:path";

import { treeDir } from "@jaimestill/spike-html-hosting-sdk/content.js";
import type { Content, Tree } from "@jaimestill/spike-html-hosting-sdk/content.js";
import { pageFile } from "@jaimestill/spike-html-hosting-sdk/markdown-pages.js";
import { normalizePath } from "vite";
import type { Plugin } from "vite";

/** One revised file's record: the original it revises and where its revision stands. */
export interface Revision {
  /** The full commit of the source the original was copied at. */
  commit: string;
  /** The original's git blob hash at that commit. */
  original: string;
  /** Where the revision stands with its source, as "proposed to sqlate at the intake". */
  status: string;
}

/** A site's content.json with its revisions, by each revised file's path under content/. */
export type Revised = Content & { revised?: Record<string, Revision> };

/** A revised page's note: the built page it opens, and its HTML. */
export interface Note {
  page: string;
  html: string;
}

/** Each copied file the record names, by its path under content/: its tree, its path in the
 * source, and its recorded blob hash. */
function recorded(content: Revised): Map<string, { tree: Tree; source: string; blob: string }> {
  const trees = "trees" in content ? content.trees : [content];
  const files = new Map<string, { tree: Tree; source: string; blob: string }>();
  for (const tree of trees) {
    const dir = "trees" in content ? treeDir(tree.repository) : "";
    for (const [source, blob] of Object.entries(tree.files)) {
      files.set(posix.join(dir, source), { tree, source, blob });
    }
  }
  return files;
}

/** What keeps content's revisions from being its record's, one line each: a revision naming a
 * file no tree records, a revised file whose recorded blob is still its original, or a revision
 * whose commit or original isn't a full hash; none when every revision is a change its record
 * holds. */
export function checkRevised(content: Revised): string[] {
  const files = recorded(content);
  const problems: string[] = [];
  for (const [path, revision] of Object.entries(content.revised ?? {})) {
    const file = files.get(path);
    if (file === undefined) {
      problems.push(`content.json's revised names ${path}, which no tree records`);
      continue;
    }
    if (!/^[0-9a-f]{40}$/.test(revision.commit)) {
      problems.push(`content.json's revised ${path} commit ${revision.commit} isn't a full commit`);
    }
    if (!/^[0-9a-f]{40}$/.test(revision.original)) {
      problems.push(
        `content.json's revised ${path} original ${revision.original} isn't a blob hash`,
      );
    }
    if (file.blob === revision.original) {
      problems.push(`content/${path}'s blob is its original ${revision.original}, unrevised`);
    }
  }
  return problems;
}

/** Text escaped for HTML content and attribute values. */
function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Each revised file's note, by its built page: "Revised from <repository>@<short commit>.",
 * the reference linking the original file at its commit on GitHub. */
export function revisedNotes(content: Revised): Note[] {
  const files = recorded(content);
  return Object.entries(content.revised ?? {}).map(([path, revision]) => {
    const file = files.get(path);
    if (file === undefined) throw new Error(`revised: ${path} is in no tree's record`);
    const href = `${file.tree.url}/blob/${revision.commit}/${file.source}`;
    const label = `${file.tree.repository}@${revision.commit.slice(0, 7)}`;
    return {
      page: pageFile(path),
      html: `<p class="revised-note">Revised from <a href="${escape(href)}">${escape(label)}</a>.</p>`,
    };
  });
}

/** The plugin: each revised file's built page opens with its note, placed after its h1; fails
 * the build when a revised page has no h1, or when the build writes no page for a revision. */
export function revisedPages(content: Revised): Plugin {
  const notes = new Map(revisedNotes(content).map((note) => [note.page, note.html]));
  const placed = new Set<string>();
  let root = "";
  return {
    name: "site:revised-pages",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      placed.clear();
    },
    transformIndexHtml: {
      order: "post",
      handler(html, { filename }) {
        const page = normalizePath(relative(root, filename));
        const note = notes.get(page);
        if (note === undefined) return html;
        const at = html.indexOf("</h1>");
        if (at < 0) throw new Error(`revised: ${page} has no h1 to place its note after`);
        placed.add(page);
        const end = at + "</h1>".length;
        return `${html.slice(0, end)}\n${note}${html.slice(end)}`;
      },
    },
    closeBundle() {
      const missing = [...notes.keys()].filter((page) => !placed.has(page));
      if (missing.length > 0) {
        throw new Error(`revised: the build wrote no page for ${missing.join(", ")}`);
      }
    },
  };
}
