import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

test("bare init in a non-TTY refuses and installs nothing", async () => {
  const root = await repo();
  try {
    const result = run(root, ["init"]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /needs explicit flags/);
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md")));
    await assert.rejects(readFile(path.join(root, ".drawbore", "index.md")));
    await assert.rejects(readFile(path.join(root, "AGENTS.md")));
    await assert.rejects(readFile(path.join(root, ".drawbore-install.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    await readFile(path.join(root, ".agents", "skills", "brainstorm", "SKILL.md"));
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

test("init --skills brainstorm installs only the brainstorm skill", async () => {
  const root = await repo();
  try {
    const result = run(root, ["init", "--yes", "--skills", "brainstorm"]);
    assert.equal(result.status, 0, result.stderr);

    await readFile(path.join(root, ".agents", "skills", "brainstorm", "SKILL.md"));
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md")));
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "frame", "SKILL.md")));
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

test("update adds newly shipped skills to a full install but not to an explicit subset", async () => {
  const root = await repo();
  try {
    assert.equal(run(root, ["init", "--yes"]).status, 0);

    const markerPath = path.join(root, ".drawbore-install.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    assert.equal(marker.skillSelectionByLocation[".agents"], "full");

    const fullSkill = path.join(root, ".agents", "skills", "brainstorm");
    await rm(fullSkill, { recursive: true, force: true });
    marker.skills = marker.skills.filter((skill) => skill !== "brainstorm");
    marker.skillsByLocation[".agents"] = marker.skillsByLocation[".agents"].filter((skill) => skill !== "brainstorm");
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

    const update = run(root, ["update"]);
    assert.equal(update.status, 0, update.stderr);
    await readFile(path.join(fullSkill, "SKILL.md"));

    const subsetRoot = await repo();
    try {
      assert.equal(run(subsetRoot, ["init", "--yes", "--skills", "discover"]).status, 0);
      const subsetMarkerPath = path.join(subsetRoot, ".drawbore-install.json");
      const subsetMarker = JSON.parse(await readFile(subsetMarkerPath, "utf8"));
      assert.equal(subsetMarker.skillSelectionByLocation[".agents"], "subset");

      const subsetUpdate = run(subsetRoot, ["update"]);
      assert.equal(subsetUpdate.status, 0, subsetUpdate.stderr);
      await readFile(path.join(subsetRoot, ".agents", "skills", "discover", "SKILL.md"));
      await assert.rejects(readFile(path.join(subsetRoot, ".agents", "skills", "brainstorm", "SKILL.md")));
    } finally {
      await rm(subsetRoot, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update keeps legacy markers at their recorded skill set", async () => {
  const root = await repo();
  try {
    assert.equal(run(root, ["init", "--yes", "--skills", "discover"]).status, 0);

    const markerPath = path.join(root, ".drawbore-install.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    delete marker.skillSelectionByLocation;
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

    const update = run(root, ["update"]);
    assert.equal(update.status, 0, update.stderr);
    await readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md"));
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "brainstorm", "SKILL.md")));

    const refreshed = JSON.parse(await readFile(markerPath, "utf8"));
    assert.equal(refreshed.skillSelectionByLocation[".agents"], "subset");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("malformed skill selection metadata is rejected before mutation", async () => {
  const root = await repo();
  try {
    assert.equal(run(root, ["init", "--yes"]).status, 0);

    const markerPath = path.join(root, ".drawbore-install.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    marker.skillSelectionByLocation = { "../outside": "full" };
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

    const update = run(root, ["update"]);
    assert.equal(update.status, 1);
    assert.match(update.stderr, /unsupported skill selection location/);

    const uninstalledLocation = JSON.parse(await readFile(markerPath, "utf8"));
    uninstalledLocation.skillSelectionByLocation = { ".cursor": "full" };
    await writeFile(markerPath, `${JSON.stringify(uninstalledLocation, null, 2)}\n`);

    const uninstalled = run(root, ["update"]);
    assert.equal(uninstalled.status, 1);
    assert.match(uninstalled.stderr, /skill selection for an uninstalled location/);

    const nonObject = JSON.parse(await readFile(markerPath, "utf8"));
    nonObject.skillSelectionByLocation = ["full"];
    await writeFile(markerPath, `${JSON.stringify(nonObject, null, 2)}\n`);

    const nonObjectResult = run(root, ["update"]);
    assert.equal(nonObjectResult.status, 1);
    assert.match(nonObjectResult.stderr, /invalid skillSelectionByLocation value/);

    const invalidMode = JSON.parse(await readFile(markerPath, "utf8"));
    invalidMode.skillSelectionByLocation = { ".agents": "everything" };
    await writeFile(markerPath, `${JSON.stringify(invalidMode, null, 2)}\n`);

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 1);
    assert.match(uninstall.stderr, /invalid skill selection mode/);
    await readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md"));
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

const DECISION = (id) => `---\nid: ${id}\nstatus: accepted\nsignificance: durable\ndate: 2026-11-19\n---\n\n# Decision ${id}\n\n## Context\n\nWhy the decision was needed.\n\n## Decision\n\nWhat was chosen.\n\n## Rationale\n\nWhy it was chosen.\n\n## Alternatives considered\n\n- Alternative — why it was not chosen.\n\n## Consequences\n\n- Consequence.\n`;

// `check` walks `decisions/` and `work/` below the directory link, so a fixture
// that adds records must name them in the index too.
function indexLinks(...links) {
  return `${INDEX}${links.map((link) => `- [${link}](${link})\n`).join("")}`;
}

async function notebookRepo(files) {
  const root = await repo();
  const notebook = path.join(root, ".drawbore");
  await mkdir(path.join(notebook, "decisions"), { recursive: true });
  await mkdir(path.join(notebook, "work"), { recursive: true });
  const nested = Object.keys(files).filter((name) => name.includes("/")).sort();
  const all = {
    "index.md": indexLinks(...nested),
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
    "decisions/0007-record.md": `---\nid: 6\nstatus: accepted\nsignificance: durable\ndate: 2026-11-19\n---\n\n# Record\n\n## Context\n\nWhy the decision was needed.\n\n## Decision\n\nWhat was chosen.\n\n## Rationale\n\nWhy it was chosen.\n\n## Alternatives considered\n\n- Alternative — why it was not chosen.\n\n## Consequences\n\n- Consequence.\n`,
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
  // width: `1-dup.md` renumbered to 8 must stay `0008-dup.md` when a `0007`
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
    assert.equal(duplicate, "0008-dup.md");
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

test("init, update, and uninstall refuse a harness location symlinked outside the project", async () => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "drawbore-location-symlink-"));
  const root = await repo();
  try {
    await symlink(outside, path.join(root, ".agents"), "dir");

    const init = run(root, ["init", "--location", ".agents", "--no-notebook", "--no-instruction", "--yes"]);
    assert.equal(init.status, 1);
    assert.match(init.stderr, /path resolves outside the project/);
    assert.deepEqual(await readdir(outside), []);

    const marker = {
      version: "0.8.2",
      namespace: "drawbore",
      skills: ["discover"],
      locations: [".agents"],
      instructions: [],
      skillsByLocation: { ".agents": ["discover"] },
      skillHashes: {},
    };
    await writeFile(path.join(root, ".drawbore-install.json"), `${JSON.stringify(marker, null, 2)}\n`);

    const update = run(root, ["update"]);
    assert.equal(update.status, 1);
    assert.match(update.stderr, /path resolves outside the project/);
    assert.deepEqual(await readdir(outside), []);

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 1);
    assert.match(uninstall.stderr, /path resolves outside the project/);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(outside, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("update and uninstall refuse a marker instruction symlinked outside the project", async () => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "drawbore-symlink-"));
  const root = await repo();
  try {
    const victim = path.join(outside, "AGENTS.md");
    await writeFile(victim, "private notes\n");
    assert.equal(run(root, ["init", "--location", ".agents", "--no-notebook", "--yes"]).status, 0);

    const markerPath = path.join(root, ".drawbore-install.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    marker.instructions = ["linked/AGENTS.md"];
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
    await mkdir(path.join(root, "linked"));
    await symlink(victim, path.join(root, "linked", "AGENTS.md"), "file");

    const update = run(root, ["update"]);
    assert.equal(update.status, 1);
    assert.match(update.stderr, /outside the project/);
    assert.equal(await readFile(victim, "utf8"), "private notes\n");

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 1);
    assert.match(uninstall.stderr, /outside the project/);
    assert.equal(await readFile(victim, "utf8"), "private notes\n");
  } finally {
    await rm(outside, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("update and uninstall refuse a marker instruction under a symlinked ancestor", async () => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "drawbore-symlink-dir-"));
  const root = await repo();
  try {
    await mkdir(path.join(outside, "nested"), { recursive: true });
    const victim = path.join(outside, "nested", "AGENTS.md");
    await writeFile(victim, "private notes\n");
    assert.equal(run(root, ["init", "--location", ".agents", "--no-notebook", "--yes"]).status, 0);

    const markerPath = path.join(root, ".drawbore-install.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    marker.instructions = ["linked/AGENTS.md"];
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
    await symlink(outside, path.join(root, "linked"), "dir");

    const update = run(root, ["update"]);
    assert.equal(update.status, 1);
    assert.match(update.stderr, /outside the project/);
    assert.equal(await readFile(victim, "utf8"), "private notes\n");

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 1);
    assert.match(uninstall.stderr, /outside the project/);
    assert.equal(await readFile(victim, "utf8"), "private notes\n");
  } finally {
    await rm(outside, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("a malformed install marker is reported instead of treated as no install", async () => {
  const root = await repo();
  try {
    await writeFile(path.join(root, ".drawbore-install.json"), "{not json\n");

    const update = run(root, ["update"]);
    assert.equal(update.status, 1);
    assert.match(update.stderr, /marker .* is malformed/);

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 1);
    assert.match(uninstall.stderr, /marker .* is malformed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit init supports skills-only installs", async () => {
  const root = await repo();
  try {
    const result = run(root, ["init", "--location", ".agents", "--no-notebook", "--no-instruction", "--yes"]);
    assert.equal(result.status, 0, result.stderr);
    await readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md"));
    await assert.rejects(readFile(path.join(root, ".drawbore", "index.md")));
    await assert.rejects(readFile(path.join(root, "AGENTS.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init rejects contradictory notebook and instruction flags", async () => {
  const root = await repo();
  try {
    const notebook = run(root, ["init", "--notebook", "--no-notebook", "--yes"]);
    assert.equal(notebook.status, 2);
    assert.match(notebook.stderr, /--notebook and --no-notebook cannot be combined/);

    const instruction = run(root, ["init", "--instruction", "AGENTS.md", "--no-instruction", "--yes"]);
    assert.equal(instruction.status, 2);
    assert.match(instruction.stderr, /--instruction and --no-instruction cannot be combined/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init refuses a corrupt marker before writing anything", async () => {
  const root = await repo();
  try {
    await writeFile(path.join(root, ".drawbore-install.json"), "{not json\n");

    const result = run(root, ["init", "--location", ".agents", "--no-notebook", "--yes"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /marker .* is malformed/);
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md")));
    await assert.rejects(readFile(path.join(root, "AGENTS.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update and uninstall reject unsupported marker skill names", async () => {
  const root = await repo();
  try {
    await writeFile(
      path.join(root, ".drawbore-install.json"),
      `${JSON.stringify({
        version: "0.8.2",
        namespace: "drawbore",
        skills: ["discover"],
        locations: [".agents"],
        instructions: [],
        skillsByLocation: { ".agents": ["../../../escape-skill"] },
        skillHashes: {},
      })}\n`,
    );

    const update = run(root, ["update"]);
    assert.equal(update.status, 1);
    assert.match(update.stderr, /unsupported skill/);
    await assert.rejects(readdir(path.join(root, "..", "escape-skill")));

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 1);
    assert.match(uninstall.stderr, /unsupported skill/);
    await assert.rejects(readdir(path.join(root, "..", "escape-skill")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("update and uninstall reject unsupported marker instruction files", async () => {
  const root = await repo();
  try {
    const unrelated = path.join(root, "README.md");
    await writeFile(unrelated, "keep me\n");
    await writeFile(
      path.join(root, ".drawbore-install.json"),
      `${JSON.stringify({
        version: "0.8.2",
        namespace: "drawbore",
        skills: ["discover"],
        locations: [".agents"],
        instructions: ["README.md"],
        skillHashes: {},
      })}\n`,
    );

    const update = run(root, ["update"]);
    assert.equal(update.status, 1);
    assert.match(update.stderr, /unsupported instruction file/);
    assert.equal(await readFile(unrelated, "utf8"), "keep me\n");

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 1);
    assert.match(uninstall.stderr, /unsupported instruction file/);
    assert.equal(await readFile(unrelated, "utf8"), "keep me\n");
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
    "decisions/0007-record.md": `---\nid: 6\nstatus: accepted\nsignificance: durable\ndate: 2026-11-19\n---\n\n# Record\n\n## Context\n\nWhy the decision was needed.\n\n## Decision\n\nWhat was chosen.\n\n## Rationale\n\nWhy it was chosen.\n\n## Alternatives considered\n\n- Alternative — why it was not chosen.\n\n## Consequences\n\n- Consequence.\n`,
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

// The marker is repository-tracked and hand-editable, so `instructions` are a
// trust boundary the same way `locations` are: an entry outside the project
// would otherwise become a write target on `update` and a delete target on
// `uninstall`, outside the tree the developer is working in.
test("update and uninstall refuse a marker instruction file outside the project", async () => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "drawbore-outside-"));
  const root = await repo();
  try {
    const victim = path.join(outside, "AGENTS.md");
    await writeFile(victim, "private notes\n");
    assert.equal(run(root, ["init", "--location", ".agents", "--notebook", "--yes"]).status, 0);

    const markerPath = path.join(root, ".drawbore-install.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    marker.instructions = [path.relative(root, victim).split(path.sep).join("/")];
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

    const update = run(root, ["update"]);
    assert.equal(update.status, 1);
    assert.match(update.stderr, /instruction file outside the project/);
    assert.doesNotMatch(update.stderr, /SkillConflictError/);
    assert.equal(await readFile(victim, "utf8"), "private notes\n");

    const uninstall = run(root, ["uninstall"]);
    assert.equal(uninstall.status, 1);
    assert.match(uninstall.stderr, /instruction file outside the project/);
    assert.equal(await readFile(victim, "utf8"), "private notes\n");
    // The refusal precedes removal, so the install is still recorded.
    await readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md"));
    await readFile(markerPath);
  } finally {
    await rm(outside, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("init reports a file where a skill directory belongs instead of crashing", async () => {
  const root = await repo();
  try {
    await mkdir(path.join(root, ".agents", "skills"), { recursive: true });
    await writeFile(path.join(root, ".agents", "skills", "recall"), "not a directory\n");

    const result = run(root, ["init", "--yes"]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /a file sits where the skill directory belongs/);
    // No stack trace, and no partial install: an earlier skill must not have
    // landed before the conflict was reported.
    assert.doesNotMatch(result.stderr, /at async|Node\.js v/);
    await assert.rejects(readFile(path.join(root, ".agents", "skills", "discover", "SKILL.md")));
    await assert.rejects(readFile(path.join(root, ".drawbore-install.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init reports an unwritable destination without a stack trace", async () => {
  const root = await repo();
  try {
    await mkdir(path.join(root, ".agents"), { recursive: true });
    await writeFile(path.join(root, ".agents", "skills"), "a file, not a directory\n");

    const result = run(root, ["init", "--yes"]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cannot install into \.agents\/skills/);
    assert.doesNotMatch(result.stderr, /    at async|Node\.js v/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// The index links `decisions/` as a directory, so without a nested pass the map
// stops at that depth: a decision the index never names is one an agent
// following the index will not read.
test("check warns about a decision record the index never links", async () => {
  const root = await notebookRepo({
    "decisions/0001-first.md": DECISION(1),
    "decisions/0002-second.md": DECISION(2),
  });
  try {
    const before = run(root, ["check"]);
    assert.equal(before.status, 0, before.stdout);
    assert.match(before.stdout, /No structural issues found/);

    // Name one record but not the other: the checker must report the second and
    // stay silent about the first.
    const indexPath = path.join(root, ".drawbore", "index.md");
    await writeFile(
      indexPath,
      indexLinks("context.md", "glossary.md", "principles.md", "decisions/", "system.md", "stack.md", "work/", "decisions/0001-first.md"),
    );

    const result = run(root, ["check"]);

    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /decisions\/0002-second\.md is not linked from the index/);
    assert.doesNotMatch(result.stdout, /decisions\/0001-first\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});