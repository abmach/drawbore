import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createNotebook, installSkills, loadPackageData } from "../lib/installer.js";

const packageData = await loadPackageData();
const tempDirs = [];

async function makeProject() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drawbore-installer-"));
  tempDirs.push(dir);
  await mkdir(path.join(dir, ".git"), { recursive: true });
  return dir;
}

test.after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

test("force overwrites customized installed skill files", async () => {
  const root = await makeProject();
  const customized = path.join(root, ".agents", "skills", "discover", "SKILL.md");

  await installSkills(root, ".agents", packageData, { force: true });
  await writeFile(customized, "# Local customization\n");

  const result = await installSkills(root, ".agents", packageData, { force: true });

  assert.match(await readFile(customized, "utf8"), /# Discover project context/);
  assert.deepEqual(result.preserved, []);
  assert.ok(result.replaced.includes(".agents/skills/discover/SKILL.md"));
});

test("rerunning the installer preserves file-directory conflicts", async () => {
  const root = await makeProject();
  const conflicting = path.join(root, ".agents", "skills", "discover", "SKILL.md");
  await mkdir(conflicting, { recursive: true });

  const result = await installSkills(root, ".agents", packageData);

  const stats = await stat(conflicting);
  assert.equal(stats.isDirectory(), true);
  assert.deepEqual(result.preserved, [".agents/skills/discover/SKILL.md"]);
});

test("createNotebook documents the tracked notebook in .gitignore", async () => {
  const root = await makeProject();
  try {
    await createNotebook(root);
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
    assert.match(gitignore, /`\.drawbore\/` is tracked on purpose/);
    assert.doesNotMatch(gitignore, /^\.drawbore\/?$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createNotebook does not duplicate the note on rerun", async () => {
  const root = await makeProject();
  try {
    await createNotebook(root);
    await createNotebook(root);
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
    assert.equal(gitignore.match(/tracked on purpose/g)?.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createNotebook preserves an existing .gitignore", async () => {
  const root = await makeProject();
  try {
    await writeFile(path.join(root, ".gitignore"), "node_modules/\n");
    await createNotebook(root);
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
    assert.match(gitignore, /^node_modules\/$/m);
    assert.match(gitignore, /tracked on purpose/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});