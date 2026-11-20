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

// An instruction file the installer created from nothing goes with its block; one
// the developer already had keeps its content. The marker records which is which,
// because `uninstall` cannot infer it from the file alone.
test("uninstall removes an instruction file the installer created, keeps a pre-existing one", async () => {
  const created = await project();
  try {
    await installed(created);
    await readFile(path.join(created, "AGENTS.md"));

    const result = run(created, ["uninstall"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /removed instruction block: AGENTS\.md/);
    await assert.rejects(readFile(path.join(created, "AGENTS.md")));
  } finally {
    await rm(created, { recursive: true, force: true });
  }

  const preExisting = await project();
  try {
    await writeFile(path.join(preExisting, "AGENTS.md"), "# House rules\n\nKeep this line.\n");
    await installed(preExisting);

    const result = run(preExisting, ["uninstall"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(path.join(preExisting, "AGENTS.md"), "utf8"), "# House rules\n\nKeep this line.\n");
  } finally {
    await rm(preExisting, { recursive: true, force: true });
  }
});

test("a marker written before existedBefore keeps the instruction file", async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, "AGENTS.md"), "keep me\n");
    await installed(root);

    // Strip the field to model an install recorded by an older version.
    const markerPath = path.join(root, ".drawbore-install.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    assert.deepEqual(marker.existedBefore, ["AGENTS.md"]);
    delete marker.existedBefore;
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

    const result = run(root, ["uninstall"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(path.join(root, "AGENTS.md"), "utf8"), "keep me\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sequential inits keep every installed location reversible", async () => {
  const root = await project();
  try {
    assert.equal(run(root, ["init", "--location", ".agents", "--no-notebook", "--yes"]).status, 0);
    assert.equal(run(root, ["init", "--location", ".cursor", "--no-notebook", "--yes"]).status, 0);

    const marker = JSON.parse(await readFile(path.join(root, ".drawbore-install.json"), "utf8"));
    assert.deepEqual(marker.locations, [".agents", ".cursor"]);

    const result = run(root, ["uninstall"]);
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(readdir(path.join(root, ".agents", "skills")));
    await assert.rejects(readdir(path.join(root, ".cursor", "skills")));
    await assert.rejects(readFile(path.join(root, ".drawbore-install.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("different skill subsets per location survive update and uninstall", async () => {
  const root = await project();
  try {
    assert.equal(run(root, ["init", "--location", ".agents", "--no-notebook", "--no-instruction", "--skills", "discover", "--yes"]).status, 0);
    assert.equal(run(root, ["init", "--location", ".cursor", "--no-notebook", "--no-instruction", "--skills", "record", "--yes"]).status, 0);

    const markerPath = path.join(root, ".drawbore-install.json");
    let marker = JSON.parse(await readFile(markerPath, "utf8"));
    assert.deepEqual(marker.skillsByLocation[".agents"], ["discover"]);
    assert.deepEqual(marker.skillsByLocation[".cursor"], ["record"]);

    const update = run(root, ["update"]);
    assert.equal(update.status, 0, update.stderr);

    marker = JSON.parse(await readFile(markerPath, "utf8"));
    assert.deepEqual(marker.skillsByLocation[".agents"], ["discover"]);
    assert.deepEqual(marker.skillsByLocation[".cursor"], ["record"]);
    assert.deepEqual((await readdir(path.join(root, ".agents", "skills"))), ["discover"]);
    assert.deepEqual((await readdir(path.join(root, ".cursor", "skills"))), ["record"]);

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 0, uninstall.stderr);
    await assert.rejects(readdir(path.join(root, ".agents", "skills")));
    await assert.rejects(readdir(path.join(root, ".cursor", "skills")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uninstall removes the .gitignore note without purging the notebook", async () => {
  const root = await project();
  try {
    await installed(root);

    const result = run(root, ["uninstall"]);

    assert.equal(result.status, 0, result.stderr);
    // The notebook survives, but the install it belonged to is gone, so the note
    // that documents the install must not outlive it.
    await readFile(path.join(root, ".drawbore", "index.md"));
    await assert.rejects(readFile(path.join(root, ".gitignore")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
