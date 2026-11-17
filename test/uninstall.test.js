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

// A user-level install writes into the home directory, so the CLI runs with a
// sandboxed HOME/USERPROFILE (Node reads the former on POSIX, the latter on
// Windows) rather than the developer's real one.
function run(root, args, home = null, extraEnv = null) {
  const env = { ...process.env, ...extraEnv };
  if (home) {
    env.HOME = home;
    env.USERPROFILE = home;
  }
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", env, timeout: 60_000 });
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

test("init --global installs into user-level directories and writes a per-user marker", async () => {
  const root = await project();
  const home = await tempDir("drawbore-home-");
  try {
    const result = run(root, ["init", "--global", "--location", ".claude"], home);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /User: /);
    assert.match(result.stdout, /~\/.claude\/skills\//);

    await readFile(path.join(home, ".claude", "skills", "discover", "SKILL.md"));
    const marker = JSON.parse(await readFile(path.join(home, ".config", "drawbore", "install.json"), "utf8"));
    assert.deepEqual(marker.locations, [".claude"]);
    assert.equal(marker.notebook, null);
    assert.deepEqual(marker.instructions, []);

    // A user-level install never touches the surrounding project.
    await assert.rejects(readFile(path.join(root, ".drawbore", "index.md")));
    await assert.rejects(readFile(path.join(root, "AGENTS.md")));
    await assert.rejects(readFile(path.join(root, ".drawbore-install.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("init --global --location .agents installs into ~/.agents/skills", async () => {
  const root = await project();
  const home = await tempDir("drawbore-home-");
  try {
    // Cursor and OpenCode both read ~/.agents/skills as a user-level source.
    const result = run(root, ["init", "--global", "--location", ".agents"], home);

    assert.equal(result.status, 0, result.stderr);
    await readFile(path.join(home, ".agents", "skills", "discover", "SKILL.md"));
    const marker = JSON.parse(await readFile(path.join(home, ".config", "drawbore", "install.json"), "utf8"));
    assert.deepEqual(marker.locations, [".agents"]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("init --global --location .omp installs into ~/.omp/agent/skills", async () => {
  const root = await project();
  const home = await tempDir("drawbore-home-");
  try {
    // OMP reads ~/.omp/agent/skills, not ~/.omp/skills.
    const result = run(root, ["init", "--global", "--location", ".omp"], home);

    assert.equal(result.status, 0, result.stderr);
    await readFile(path.join(home, ".omp", "agent", "skills", "discover", "SKILL.md"));
    await assert.rejects(readFile(path.join(home, ".omp", "skills", "discover", "SKILL.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("a named OMP profile relocates the user-level skills directory", async () => {
  const root = await project();
  const home = await tempDir("drawbore-home-");
  try {
    const result = run(root, ["init", "--global", "--location", ".omp"], home, { OMP_PROFILE: "work" });

    assert.equal(result.status, 0, result.stderr);
    await readFile(path.join(home, ".omp", "profiles", "work", "agent", "skills", "discover", "SKILL.md"));
    await assert.rejects(readFile(path.join(home, ".omp", "agent", "skills", "discover", "SKILL.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("uninstall finds an install made under another OMP profile", async () => {
  const root = await project();
  const home = await tempDir("drawbore-home-");
  try {
    assert.equal(run(root, ["init", "--global", "--location", ".omp"], home, { OMP_PROFILE: "work" }).status, 0);

    // No OMP_PROFILE in this run: the marker, not the current environment,
    // decides where the skills actually are.
    const result = run(root, ["uninstall", "--global"], home);

    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(
      readFile(path.join(home, ".omp", "profiles", "work", "agent", "skills", "discover", "SKILL.md")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("a recorded skill directory outside the project is ignored", async () => {
  const root = await project();
  const outside = await tempDir("drawbore-outside-");
  try {
    assert.equal(run(root, ["init", "--location", ".agents", "--yes"]).status, 0);

    // A hand-edited marker claiming a directory outside the project must not
    // redirect removal: the tree out there has to survive.
    const markerPath = path.join(root, ".drawbore-install.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    marker.skillDirs = { ".agents": outside };
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
    const bystander = path.join(outside, "skills", "discover", "SKILL.md");
    await mkdir(path.dirname(bystander), { recursive: true });
    await writeFile(bystander, "not ours\n");

    const result = run(root, ["uninstall"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(bystander, "utf8"), "not ours\n");
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("update --global refreshes the user-level install; a project update ignores it", async () => {
  const root = await project();
  const home = await tempDir("drawbore-home-");
  try {
    assert.equal(run(root, ["init", "--global", "--location", ".claude"], home).status, 0);

    const updated = run(root, ["update", "--global"], home);
    assert.equal(updated.status, 0, updated.stderr);
    assert.match(updated.stdout, /Updated:/);

    const projectUpdate = run(root, ["update"]);
    assert.equal(projectUpdate.status, 1);
    assert.match(projectUpdate.stderr, /No existing Drawbore install found/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("uninstall --global removes the user-level install and prunes what it emptied", async () => {
  const root = await project();
  const home = await tempDir("drawbore-home-");
  try {
    assert.equal(run(root, ["init", "--global", "--location", ".claude"], home).status, 0);

    const result = run(root, ["uninstall", "--global"], home);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /~\/.claude\/skills\/discover/);
    await assert.rejects(readFile(path.join(home, ".claude", "skills", "discover", "SKILL.md")));
    await assert.rejects(readFile(path.join(home, ".config", "drawbore", "install.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("--global rejects the project-only options and requires a location", async () => {
  const root = await project();
  const home = await tempDir("drawbore-home-");
  try {
    const notebook = run(root, ["init", "--global", "--notebook"], home);
    assert.equal(notebook.status, 2);
    assert.match(notebook.stderr, /does not create a notebook/);

    const instruction = run(root, ["init", "--global", "--instruction", "AGENTS.md"], home);
    assert.equal(instruction.status, 2);
    assert.match(instruction.stderr, /skills only/);

    const noLocation = run(root, ["init", "--global"], home);
    assert.equal(noLocation.status, 2);
    assert.match(noLocation.stderr, /requires --location/);

    const unsupported = run(root, ["init", "--global", "--location", ".vscode"], home);
    assert.equal(unsupported.status, 2);
    assert.match(unsupported.stderr, /Unsupported user-level location/);

    const purge = run(root, ["uninstall", "--global", "--purge"], home);
    assert.equal(purge.status, 2);
    assert.match(purge.stderr, /--purge/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});