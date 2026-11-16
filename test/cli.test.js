import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cli = path.resolve("bin/drawbore.js");

async function repo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "drawbore-cli-"));
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

test("bare init in a non-TTY installs the defaults without prompting", async () => {
  const root = await repo();
  try {
    const result = run(root, ["init"]);
    assert.equal(result.status, 0, result.stderr);
    await readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md"));
    await readFile(path.join(root, ".drawbore", "index.md"));
    const instruction = await readFile(path.join(root, "AGENTS.md"), "utf8");
    assert.match(instruction, /<!-- drawbore:start -->/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the CLI imports the interactive prompt builders", async () => {
  const source = await readFile(cli, "utf8");
  assert.match(source, /createUi/);
  assert.match(source, /buildLocationChoices/);
  assert.match(source, /buildInstructionChoices/);
  assert.match(source, /ui\.selectLocations/);
  assert.match(source, /ui\.selectInstructions/);
  assert.match(source, /ui\.confirm/);
});


test("--version prints the package version", async () => {
  const root = await repo();
  try {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    const result = run(root, ["--version"]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), pkg.version);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--help lists the commands and flags", async () => {
  const root = await repo();
  try {
    const result = run(root, ["--help"]);
    assert.equal(result.status, 0);
    for (const expected of [
      "drawbore init",
      "drawbore check",
      "--location",
      "--notebook",
      "--instruction",
      "--skills",
      "--replace-skills",
      "--yes",
      "--json",
      "--fix",
    ]) {
      assert.match(result.stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init installs the selected harness skills, notebook, and instruction block", async () => {
  const root = await repo();
  try {
    const unrelated = path.join(root, "README.md");
    await writeFile(unrelated, "# Keep me\n");

    const result = run(root, [
      "init",
      "--location", ".agents",
      "--notebook",
      "--instruction", "AGENTS.md",
    ]);

    assert.equal(result.status, 0, result.stderr);
    await readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md"));
    await readFile(path.join(root, ".agents", "skills", "release", "SKILL.md"));
    await readFile(path.join(root, ".drawbore", "index.md"));
    await readFile(path.join(root, ".drawbore", "work", ".gitkeep"));

    const instruction = await readFile(path.join(root, "AGENTS.md"), "utf8");
    assert.match(instruction, /<!-- drawbore:start -->/);
    assert.match(instruction, /<!-- drawbore:end -->/);

    const marker = JSON.parse(await readFile(path.join(root, ".drawbore-install.json"), "utf8"));
    assert.deepEqual(marker.locations, [".agents"]);
    assert.equal(marker.notebook, ".drawbore");

    assert.equal(await readFile(unrelated, "utf8"), "# Keep me\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init supports the --yes defaults and the --skills subset", async () => {
  const root = await repo();
  try {
    const result = run(root, ["init", "--yes", "--skills", "record,frame"]);
    assert.equal(result.status, 0, result.stderr);

    await readFile(path.join(root, ".agents", "skills", "record", "SKILL.md"));
    await readFile(path.join(root, ".agents", "skills", "frame", "SKILL.md"));
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md")));
    await readFile(path.join(root, "AGENTS.md"));
    await readFile(path.join(root, ".drawbore", "index.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rerunning init preserves a locally edited skill", async () => {
  const root = await repo();
  try {
    assert.equal(run(root, ["init", "--location", ".agents", "--notebook"]).status, 0);

    const skill = path.join(root, ".agents", "skills", "discover", "SKILL.md");
    await writeFile(skill, "# Local customization\n");

    assert.equal(run(root, ["init", "--location", ".agents", "--notebook"]).status, 0);
    assert.equal(await readFile(skill, "utf8"), "# Local customization\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init rejects unknown options without installing anything", async () => {
  const root = await repo();
  try {
    const result = run(root, ["init", "--location", ".agents", "--bogus"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown option: --bogus/);
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const INDEX = `# Project Notebook

- [Context](context.md) — purpose.
- [Glossary](glossary.md) — terms.
- [Principles](principles.md) — rules.
- [Decisions](decisions/) — choices.
- [System behavior](system.md) — behavior.
- [Technical choices](stack.md) — stack.
- [Change Briefs](work/) — transient.
`;

const DECISION = (id) => `---\nid: ${id}\nstatus: accepted\n---\n\n# Decision ${id}\n`;

async function notebookRepo(files) {
  const root = await repo();
  const notebook = path.join(root, ".drawbore");
  await mkdir(path.join(notebook, "decisions"), { recursive: true });
  await mkdir(path.join(notebook, "work"), { recursive: true });
  const all = {
    "index.md": INDEX,
    "context.md": "# Project Context\n",
    "glossary.md": "# Glossary\n",
    "principles.md": "# Principles\n",
    "system.md": "# System Behavior\n",
    "stack.md": "# Technical Choices\n",
    ...files,
  };
  for (const [name, body] of Object.entries(all)) {
    const full = path.join(notebook, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  return root;
}

test("check exits 0 on a clean notebook", async () => {
  const root = await notebookRepo({
    "decisions/0001-first.md": DECISION(1),
    "decisions/0002-second.md": DECISION(2),
  });
  try {
    const result = run(root, ["check"]);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /No structural issues found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check --json reports a duplicate decision id as an error", async () => {
  const root = await notebookRepo({
    "decisions/0001-first.md": DECISION(1),
    "decisions/0001-duplicate.md": DECISION(1),
  });
  try {
    const result = run(root, ["check", "--json"]);
    assert.equal(result.status, 1);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.deepEqual(Object.keys(payload).sort(), ["errors", "ok", "stale", "warnings"]);
    assert.ok(payload.errors.some((finding) => finding.code === "E001"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check --fix aligns the id and then reports clean", async () => {
  const root = await notebookRepo({
    "decisions/0007-record.md": `---\nid: 6\nstatus: accepted\n---\n\n# Record\n`,
  });
  try {
    const result = run(root, ["check", "--fix"]);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /fixed E002/);

    const fixed = await readFile(path.join(root, ".drawbore", "decisions", "0007-record.md"), "utf8");
    assert.match(fixed, /^id: 0007$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check --help prints check usage and exits 0", async () => {
  const root = await notebookRepo({});
  try {
    const result = run(root, ["check", "--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /drawbore check \[--json\] \[--strict\] \[--fix\]/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check rejects unknown options with exit 2", async () => {
  const root = await notebookRepo({});
  try {
    const result = run(root, ["check", "--jsn"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown option for check: --jsn/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});