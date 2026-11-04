// How the site is served to a browser: the build, dist/, by Vite's preview, under the Pages base,
// on a free loopback port. The browser tier and the screenshots description both start it here, so
// a capture makes the requests the tier checks, as the deployed site does.
// Adapted from spike-html-apps-components (19d4f59): test/browser/support/served.ts, its serve
// options a start function over Vite's preview.
// From spike-html-hosting-architecture (a20a1e0): test/browser/support/served.ts.

import { join } from "node:path";

import { freePort, start } from "@jaimestill/spike-html-apps-tooling/process.js";
import type { Server } from "@jaimestill/spike-html-apps-tooling/server.js";

import { base } from "../../../vite.config.ts";

/** The repository root, where Vite's preview reads vite.config.ts and dist/. */
const root = join(import.meta.dirname, "../../..");

/**
 * Starts Vite's preview of the build and resolves once the site answers; its origin is the site's
 * URL under the base, http://127.0.0.1:<port>/<repository>/, which every page path resolves
 * against, and stop ends the preview's process group.
 */
export async function served(): Promise<Server> {
  const port = await freePort();
  const site = `http://127.0.0.1:${port}${base}`;
  const preview = await start(
    join(root, "node_modules", ".bin", "vite"),
    ["preview", "--port", `${port}`],
    {
      cwd: root,
      ready: site,
    },
  );
  return {
    origin: site,
    stop: async () => {
      await preview.stop();
    },
  };
}
