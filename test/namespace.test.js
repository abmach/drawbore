import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  installMarkerFile,
  installSkills,
  loadPackageData,
  SkillConflictError,
  writeInstallMarker,
} from "../lib/installer.js";

const packageRoot = path.resolve(import.meta.dirname, "..");

const packageData = await loadPackageData();
const tempDirs = [];

async function makeProject() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drawbore-test-"));
  tempDirs.push(dir);
  await mkdir(path.join(dir, ".git"), { recursive: true });
  return dir;
}

test.after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

test("installs a namespaced skill", async () => {
  const root = await makeProject();
  const result = await installSkills(root, ".agents", packageData, { force: true });
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.hashes["skills/recall/SKILL.md"]);
  assert.ok(await readFile(path.join(root, ".agents/skills/recall/SKILL.md"), "utf8"));
});

test("detects a foreign skill directory without a Drawbore marker", async () => {
  const root = await makeProject();
  const foreign = path.join(root, ".agents/skills/recall");
  await mkdir(foreign, { recursive: true });
  await cp(path.join(packageRoot, "skills", "recall", "SKILL.md"), path.join(foreign, "SKILL.md"));
  await writeFile(path.join(foreign, "notes.md"), "# mine\n");
  await assert.rejects(() => installSkills(root, ".agents", packageData), SkillConflictError);
});

test("a byte-identical hand copy is not a conflict", async () => {
  const root = await makeProject();
  await mkdir(path.join(root, ".agents/skills/recall"), { recursive: true });
  await cp(path.join(packageRoot, "skills", "recall", "SKILL.md"), path.join(root, ".agents/skills/recall/SKILL.md"));
  const result = await installSkills(root, ".agents", packageData);
  assert.deepEqual(result.conflicts, []);
  assert.ok(await readFile(path.join(root, ".agents/skills/recall/SKILL.md"), "utf8"));
});

test("force replaces a foreign skill", async () => {
  const root = await makeProject();
  await mkdir(path.join(root, ".agents/skills/recall"), { recursive: true });
  await writeFile(path.join(root, ".agents/skills/recall/SKILL.md"), "# foreign\n");
  const result = await installSkills(root, ".agents", packageData, { force: true });
  assert.ok(result.replaced.includes(".agents/skills/recall/SKILL.md"));
  assert.match(await readFile(path.join(root, ".agents/skills/recall/SKILL.md"), "utf8"), /Drawbore/);
  const marker = JSON.parse(await readFile(path.join(root, ".agents/skills/recall/.drawbore-skill.json"), "utf8"));
  assert.equal(marker.namespace, packageData.namespace);
});

test("writes the namespace to the install marker", async () => {
  const root = await makeProject();
  const result = await installSkills(root, ".agents", packageData, { force: true });
  await writeInstallMarker(root, packageData, [".agents"], false, [], { ".agents": result.hashes });
  const marker = JSON.parse(await readFile(path.join(root, installMarkerFile), "utf8"));
  assert.equal(marker.namespace, packageData.namespace);
  assert.equal(marker.notebook, null);
  assert.ok(marker.skillHashes[".agents"]["skills/recall/SKILL.md"]);
});