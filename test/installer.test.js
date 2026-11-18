import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { addInstruction, createNotebook, inspectProject, installSkills, loadPackageData } from "../lib/installer.js";

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

test("addInstruction keeps content after an unclosed start marker", async () => {
  const root = await makeProject();
  try {
    const target = path.join(root, "AGENTS.md");
    await writeFile(target, "# Guide\n\n<!-- drawbore:start -->\nkeep this line\nmore content\n");

    await addInstruction(root, "AGENTS.md", packageData);

    const updated = await readFile(target, "utf8");
    assert.equal(updated.match(/<!-- drawbore:start -->/g)?.length, 1);
    assert.match(updated, /<!-- drawbore:end -->/);
    assert.match(updated, /keep this line/);
    assert.match(updated, /more content/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inspectProject reports a foreign skills directory as not installed", async () => {
  const root = await makeProject();
  try {
    // Another tool's skills live in .claude/skills; that is not a Drawbore
    // install, and the location picker must not claim it is.
    await mkdir(path.join(root, ".claude", "skills", "graphify"), { recursive: true });
    await writeFile(path.join(root, ".claude", "skills", "graphify", "SKILL.md"), "# Graphify\n");

    const before = await inspectProject(root, packageData);
    const claude = before.locations.find((location) => location.path === ".claude");
    assert.equal(claude.skillsExist, true);
    assert.equal(claude.installed, false);

    await installSkills(root, ".claude", packageData);

    const after = await inspectProject(root, packageData);
    assert.equal(after.locations.find((location) => location.path === ".claude").installed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a marker that outlived its directory is not an install", async () => {
  const root = await makeProject();
  try {
    await installSkills(root, ".claude", packageData);

    // The marker is still written; the skills are gone.
    await rm(path.join(root, ".claude"), { recursive: true, force: true });

    const project = await inspectProject(root, packageData);
    const claude = project.locations.find((location) => location.path === ".claude");
    assert.equal(claude.skillsExist, false);
    assert.equal(claude.installed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("addInstruction matches the destination's line endings", async () => {
  const root = await makeProject();
  const target = path.join(root, "AGENTS.md");
  // The template ships CRLF in a Windows working tree; an LF file must not
  // end up with a CRLF block spliced into it.
  const crlfPackage = {
    ...packageData,
    instructionTemplate: "<!-- drawbore:start -->\r\nA\r\n<!-- drawbore:end -->",
  };
  try {
    await writeFile(target, "# Rules\n\nUse tabs.\n");
    await addInstruction(root, "AGENTS.md", crlfPackage);
    const lfResult = await readFile(target, "utf8");
    assert.ok(!lfResult.includes("\r"), "a CRLF template must be converted for an LF file");
    assert.match(lfResult, /Use tabs\./);

    const lfPackage = { ...packageData, instructionTemplate: "<!-- drawbore:start -->\nA\n<!-- drawbore:end -->" };
    await writeFile(target, "# Rules\r\n\r\nUse tabs.\r\n");
    await addInstruction(root, "AGENTS.md", lfPackage);
    const crlfResult = await readFile(target, "utf8");
    assert.ok(!/[^\r]\n/.test(crlfResult), "an LF template must be converted for a CRLF file");
    assert.match(crlfResult, /Use tabs\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});