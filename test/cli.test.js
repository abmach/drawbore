import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

// The former "the CLI imports the interactive prompt builders" test asserted
// on source text instead of behaviour; the interactive path is covered by
// prompts.test.js ("TTY ui delegates to the injected prompts module") and the
// non-TTY defaults test above.


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
      "drawbore update",
      "drawbore check",
      "--location",
      "--notebook",
      "--instruction",
      "--skills",
      "--force",
      "--yes",
      "--json",
      "--fix",
      "--check",
    ]) {
      assert.match(result.stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bare drawbore prints the full help; an unknown command is rejected", async () => {
  const root = await repo();
  try {
    const bare = run(root, []);
    assert.equal(bare.status, 2);
    assert.match(bare.stdout, /Usage:\n  drawbore init/);
    assert.match(bare.stdout, /init options:/);

    const unknown = run(root, ["bogus"]);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /Unknown command: bogus/);
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

test("update refreshes skills and preserves locally-modified ones", async () => {
  const root = await repo();
  try {
    assert.equal(run(root, ["init", "--yes"]).status, 0);

    const skill = path.join(root, ".agents", "skills", "recall", "SKILL.md");
    await writeFile(skill, "# Local customization\n");

    const result = run(root, ["update"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Preserved 1 file/);
    assert.equal(await readFile(skill, "utf8"), "# Local customization\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update --check reports drift without writing", async () => {
  const root = await repo();
  try {
    assert.equal(run(root, ["init", "--yes"]).status, 0);
    assert.equal(run(root, ["update", "--check"]).status, 0);

    const frame = path.join(root, ".agents", "skills", "frame");
    await rm(path.join(frame, ".drawbore-skill.json"));
    await writeFile(path.join(frame, "SKILL.md"), "# foreign\n");

    const drift = run(root, ["update", "--check"]);
    assert.equal(drift.status, 1);
    assert.match(drift.stdout, /not owned by this install/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update rejects unknown options with exit 2", async () => {
  const root = await repo();
  try {
    assert.equal(run(root, ["init", "--yes"]).status, 0);
    const result = run(root, ["update", "--bogus"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown option for update: --bogus/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init --dry-run prints the plan without writing anything", async () => {
  const root = await repo();
  try {
    const result = run(root, ["init", "--dry-run", "--yes"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Dry run/);
    assert.match(result.stdout, /Would install/);
    assert.doesNotMatch(result.stdout, /^Installed:$/m);
    assert.doesNotMatch(result.stdout, /Run the discover skill/);
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md")));
    await assert.rejects(readFile(path.join(root, ".drawbore", "index.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check --help prints check usage, not top-level help", async () => {
  const root = await repo();
  try {
    const result = run(root, ["check", "--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /drawbore check \[--json\] \[--strict\] \[--fix\]/);
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

test("check --fix renumbers duplicates keeping the widest id width", async () => {
  // The renumbered file must pad to the widest existing prefix, not its own
  // width: `1-dup.md` renumbered to 2 must stay `0002-dup.md` when a `0007`
  // file is present.
  const root = await notebookRepo({
    "decisions/0001-first.md": DECISION(1),
    "decisions/1-dup.md": DECISION(1),
    "decisions/0007-other.md": DECISION(7),
  });
  try {
    const result = run(root, ["check", "--fix"]);
    assert.equal(result.status, 0, result.stdout);

    const files = await readdir(path.join(root, ".drawbore", "decisions"));
    const duplicate = files.find((file) => file.includes("dup"));
    assert.ok(duplicate, `expected a renumbered duplicate file, got ${files.join(", ")}`);
    assert.equal(duplicate, "0002-dup.md");
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

test("update rejects marker locations outside the supported set", async () => {
  const root = await repo();
  const escaped = path.join(root, "..", "escaped");
  try {
    await rm(escaped, { recursive: true, force: true });
    await writeFile(
      path.join(root, ".drawbore-install.json"),
      `${JSON.stringify({ namespace: "drawbore", version: "0.0.0", skills: ["discover"], locations: ["../escaped"], instructions: [] })}\n`,
    );

    const result = run(root, ["update"]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsupported location/);
    assert.doesNotMatch(result.stderr, /SkillConflictError/);
    await assert.rejects(readdir(escaped));
  } finally {
    await rm(escaped, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("update keeps the skill subset recorded at init", async () => {
  const root = await repo();
  const markerPath = path.join(root, ".drawbore-install.json");
  try {
    assert.equal(run(root, ["init", "--skills", "discover", "--yes"]).status, 0);

    const result = run(root, ["update"]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await readdir(path.join(root, ".agents", "skills"))).sort(), ["discover"]);
    assert.deepEqual(JSON.parse(await readFile(markerPath, "utf8")).skills, ["discover"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update keeps the recorded notebook", async () => {
  const root = await repo();
  const markerPath = path.join(root, ".drawbore-install.json");
  try {
    assert.equal(run(root, ["init", "--notebook", "--yes"]).status, 0);
    assert.equal(JSON.parse(await readFile(markerPath, "utf8")).notebook, ".drawbore");

    const result = run(root, ["update"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(await readFile(markerPath, "utf8")).notebook, ".drawbore");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update reports an ownership conflict without a stack trace", async () => {
  const root = await repo();
  const foreign = path.join(root, ".agents", "skills", "frame");
  try {
    assert.equal(run(root, ["init", "--yes"]).status, 0);
    await rm(foreign, { recursive: true, force: true });
    await mkdir(foreign, { recursive: true });
    await writeFile(path.join(foreign, "SKILL.md"), "# foreign\n");

    const result = run(root, ["update"]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /will not overwrite skills it does not own/);
    assert.match(result.stderr, /--force/);
    assert.doesNotMatch(result.stderr, /SkillConflictError/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update --check reports a modified skill and a missing one", async () => {
  const root = await repo();
  try {
    assert.equal(run(root, ["init", "--yes"]).status, 0);
    await writeFile(path.join(root, ".agents", "skills", "recall", "SKILL.md"), "# Local customization\n");
    await rm(path.join(root, ".agents", "skills", "release"), { recursive: true, force: true });

    const result = run(root, ["update", "--check"]);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /skills\/recall: differs from the package/);
    assert.match(result.stdout, /skills\/release: not installed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check --json --fix emits one parseable document", async () => {
  const root = await notebookRepo({
    "decisions/0007-record.md": `---\nid: 6\nstatus: accepted\n---\n\n# Record\n`,
  });
  try {
    const result = run(root, ["check", "--json", "--fix"]);

    assert.equal(result.status, 0, result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.changed, true);
    assert.equal(payload.fixed.length, 1);
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.errors, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init leaves nothing behind when a later location conflicts", async () => {
  const root = await repo();
  const foreign = path.join(root, ".cursor", "skills", "frame");
  try {
    await mkdir(foreign, { recursive: true });
    await writeFile(path.join(foreign, "SKILL.md"), "# foreign\n");

    const result = run(root, ["init", "--location", ".agents,.cursor", "--yes"]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /will not overwrite skills it does not own/);
    assert.doesNotMatch(result.stderr, /SkillConflictError/);
    await assert.rejects(readdir(path.join(root, ".agents", "skills")));
    await assert.rejects(readFile(path.join(root, ".drawbore-install.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});