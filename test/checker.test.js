import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkNotebook, fixMechanical, summarize } from "../lib/checker.js";

const INDEX = `# Project Notebook

- [Context](context.md) — purpose.
- [Glossary](glossary.md) — terms.
- [Principles](principles.md) — rules.
- [Decisions](decisions/) — choices.
- [System behavior](system.md) — behavior.
- [Technical choices](stack.md) — stack.
- [Change Briefs](work/) — transient.
`;

// `checkIndex` walks `decisions/` and `work/` below the directory link, so a
// fixture that adds records must name them here too.
function indexLinks(...links) {
  return `${INDEX}${links.map((link) => `- [${link}](${link})\n`).join("")}`;
}

const ARTIFACTS = {
  "context.md": "# Project Context\n",
  "glossary.md": "# Glossary\n",
  "principles.md": "# Principles\n",
  "system.md": "# System Behavior\n",
  "stack.md": "# Technical Choices\n",
};

function decision({ id, status = "accepted", supersededBy = null, slug = "record" }) {
  const lines = ["---", `id: ${id}`, `status: ${status}`];
  if (supersededBy !== null) lines.push(`superseded_by: ${supersededBy}`);
  lines.push("---", "", `# Decision ${id}`, "");
  return lines.join("\n");
}

// Records the fixture writes under `decisions/` or `work/` are linked from the
// index by default: the index's nested pass would otherwise report every
// fixture decision as unlinked, which is the checker working, not the fixture.
async function notebookWith(files, dirs = ["decisions", "work"]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "drawbore-checker-"));
  const notebook = path.join(root, ".drawbore");
  await mkdir(notebook, { recursive: true });
  for (const dir of dirs) await mkdir(path.join(notebook, dir), { recursive: true });
  const nested = Object.keys(files)
    .filter((name) => name.includes("/"))
    .sort();
  const all = { ...ARTIFACTS, "index.md": indexLinks(...nested), ...files };
  for (const [name, body] of Object.entries(all)) {
    const full = path.join(notebook, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  return { root, notebook };
}

function codes(findings) {
  return findings.map((f) => f.code).sort();
}

test("clean notebook produces no findings", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": decision({ id: 1, slug: "first" }),
    "decisions/0002-second.md": decision({ id: 2, slug: "second" }),
  });
  try {
    assert.deepEqual(await checkNotebook(notebook), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("notebook with an empty decisions directory is not an error", async () => {
  const { root, notebook } = await notebookWith({}, ["decisions", "work"]);
  try {
    assert.deepEqual(await checkNotebook(notebook), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("absent notebook is a hard failure (E000)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "drawbore-checker-"));
  try {
    const findings = await checkNotebook(path.join(root, ".drawbore"));
    assert.deepEqual(codes(findings), ["E000"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("duplicate ids differing only by padding are caught (1 vs 0001)", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": decision({ id: 1, slug: "first" }),
    "decisions/0001-duplicate.md": decision({ id: 1, slug: "duplicate" }),
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("E001"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("id/filename mismatch is reported", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0007-record.md": decision({ id: 6, slug: "record" }),
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("E002"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dangling superseded_by is reported", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": decision({ id: 1, status: "superseded", supersededBy: 9 }),
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("E003"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("superseded without superseded_by is reported", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": decision({ id: 1, status: "superseded" }),
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("E004"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("valid supersession chain is clean", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": decision({ id: 1, status: "superseded", supersededBy: 2 }),
    "decisions/0002-second.md": decision({ id: 2, status: "accepted" }),
  });
  try {
    assert.deepEqual(await checkNotebook(notebook), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid status is reported", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": decision({ id: 1, status: "retired" }),
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("E005"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing id is reported", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": "---\nstatus: accepted\n---\n\n# First\n",
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("E006"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing required heading is reported", async () => {
  const { root, notebook } = await notebookWith({
    "context.md": "No heading here.\n",
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("E007"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("principle without a Source is reported", async () => {
  const { root, notebook } = await notebookWith({
    "principles.md": "# Principles\n\n1. **Keep it simple** — because simple is better.\n",
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("E008"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepted record with superseded_by is a warning", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": decision({ id: 1 }),
    "decisions/0002-second.md": decision({ id: 2, status: "accepted", supersededBy: 1 }),
  });
  try {
    const findings = await checkNotebook(notebook);
    assert.ok(codes(findings).includes("W001"));
    assert.equal(summarize(findings).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("summarize separates errors from warnings", async () => {
  const findings = [
    { code: "E001", file: "a.md", message: "x" },
    { code: "W002", file: null, message: "y" },
    { code: "S001", file: "z.md", message: "w" },
  ];
  const summary = summarize(findings);
  assert.equal(summary.errors.length, 1);
  assert.equal(summary.warnings.length, 1);
  assert.equal(summary.stale.length, 1);
  assert.equal(summary.ok, false);
});

test("--fix aligns the front-matter id to the filename prefix", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0007-record.md": decision({ id: 6, slug: "record" }),
  });
  try {
    const result = await fixMechanical(notebook);
    assert.equal(result.changed, true);
    const text = await readFile(path.join(notebook, "decisions", "0007-record.md"), "utf8");
    assert.match(text, /^id: 0007$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--fix renumbers duplicate ids without touching bodies", async () => {
  const { root, notebook } = await notebookWith({
    "decisions/0001-first.md": decision({ id: 1, slug: "first" }),
    "decisions/0001-duplicate.md": decision({ id: 1, slug: "duplicate" }),
  });
  try {
    const result = await fixMechanical(notebook);
    assert.equal(result.changed, true);
    const renamed = await readFile(path.join(notebook, "decisions", "0002-first.md"), "utf8");
    assert.match(renamed, /^id: 0002$/m);
    // The index still names the pre-fix path; the rename moves the record out
    // from under that link, so the map must be corrected with it.
    const findings = await checkNotebook(notebook);
    assert.deepEqual(codes(findings), ["W003", "W004"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});