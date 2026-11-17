import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// This repository dogfoods Drawbore: `.drawbore-install.json` records the
// install of the working tree. Bumping package.json without refreshing it
// leaves a marker that claims the previous version, which is invisible in the
// diff and wrong for anyone reading the repo. The check runs only when the
// marker exists, so deleting the local install does not fail the suite.
const markerPath = ".drawbore-install.json";

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

test("the dogfooded install marker matches the package version", async () => {
  if (!(await exists(markerPath))) return;

  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const marker = JSON.parse(await readFile(markerPath, "utf8"));

  assert.equal(
    marker.version,
    pkg.version,
    `installed ${marker.version}, package ${pkg.version} — run \`node bin/drawbore.js update\` after bumping`,
  );
});