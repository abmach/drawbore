import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cli = path.resolve("bin/drawbore.js");

async function tempDir(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}

async function project() {
  const root = await tempDir("drawbore-uninstall-");
  await mkdir(path.join(root, ".git"));
  return root;
}

function run(root, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  });
}

async function installed(root) {
  assert.equal(run(root, ["init", "--location", ".agents", "--notebook", "--instruction", "AGENTS.md", "--yes"]).status, 0);
}

test("uninstall removes owned skills, the instruction block, and the marker, and keeps the notebook", async () => {
  const root = await project();
  try {
    // Instruction files that existed before the install keep their content; one
    // the installer created from nothing is removed with its block.
    await writeFile(path.join(root, "AGENTS.md"), "# House rules\n\nKeep this line.\n");
    await installed(root);

    const result = run(root, ["uninstall"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Uninstalled:/);
    assert.match(result.stdout, /\.agents\/skills\/discover/);
    await assert.rejects(readdir(path.join(root, ".agents", "skills")));
    await assert.rejects(readFile(path.join(root, ".drawbore-install.json")));

    const instruction = await readFile(path.join(root, "AGENTS.md"), "utf8");
    assert.equal(instruction, "# House rules\n\nKeep this line.\n");

    await readFile(path.join(root, ".drawbore", "index.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uninstall keeps a locally modified skill whole", async () => {
  const root = await project();
  try {
    await installed(root);
    const edited = path.join(root, ".agents", "skills", "recall", "SKILL.md");
    await writeFile(edited, "# Local customization\n");

    const result = run(root, ["uninstall"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Kept 1 locally modified skill/);
    assert.match(result.stdout, /\.agents\/skills\/recall/);
    assert.equal(await readFile(edited, "utf8"), "# Local customization\n");
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "review", "SKILL.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uninstall --dry-run writes nothing", async () => {
  const root = await project();
  try {
    await installed(root);
    const before = await readFile(path.join(root, "AGENTS.md"), "utf8");

    const result = run(root, ["uninstall", "--dry-run"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Would uninstall/);
    assert.match(result.stdout, /would remove/);
    await readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md"));
    await readFile(path.join(root, ".drawbore-install.json"));
    assert.equal(await readFile(path.join(root, "AGENTS.md"), "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uninstall reports a missing install", async () => {
  const root = await project();
  try {
    const result = run(root, ["uninstall"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No Drawbore install found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uninstall --purge removes the notebook and its .gitignore note", async () => {
  const root = await project();
  try {
    await installed(root);
    const gitignoreBefore = await readFile(path.join(root, ".gitignore"), "utf8");
    assert.match(gitignoreBefore, /tracked on purpose/);

    const result = run(root, ["uninstall", "--purge"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /notebook: \.drawbore\//);
    await assert.rejects(readFile(path.join(root, ".drawbore", "index.md")));
    // The installer created the .gitignore solely for the note, so removing the
    // note removes the now-empty file.
    await assert.rejects(readFile(path.join(root, ".gitignore")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uninstall leaves an instruction file with a single marker untouched", async () => {
  const root = await project();
  try {
    await installed(root);
    const instructionPath = path.join(root, "AGENTS.md");
    await writeFile(instructionPath, "# Rules\n\n<!-- drawbore:end -->\nkeep me\n");

    const result = run(root, ["uninstall"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /only one drawbore marker/);
    assert.equal(await readFile(instructionPath, "utf8"), "# Rules\n\n<!-- drawbore:end -->\nkeep me\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
