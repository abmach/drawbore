import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

// The notebook gate is stated twice per skill: in the description, which the
// model reads at selection time before it has looked at the filesystem, and in
// the first line of the body, which it reads once the skill is loaded. The
// description names the file so the model can check it; the body carries the
// stop. Skills that write a notebook also say so in the description, because
// that is the case where creating one would be a mistake.

const TRIGGER = "in a project with a Drawbore notebook (`.drawbore/index.md` at the repository root)";

// `recall` only reads: if the notebook is gone there is nothing to consult.
const READ_CLAUSE = "If it is missing, the project is not initialized.";

// `frame` and `record` write into `.drawbore/`; without this they could
// bootstrap a notebook in a project that never ran `drawbore init`.
const WRITE_CLAUSE = "If it is missing, do not create it — run `npx drawbore init`.";

const BODY_CLAUSE =
  "Requires `.drawbore/index.md` at the repository root. If it is absent, stop: this project is not initialized with Drawbore. Do not create the notebook or any record — tell the developer to run `npx drawbore init` and offer to continue afterwards.";

// Skills that read or write the notebook. `discover` bootstraps it, and
// `review`, `release`, and `init-project` work without one.
const GATED = ["frame", "recall", "record"];
const WRITERS = ["frame", "record"];
const READERS = ["recall"];
const UNGATED = ["discover", "init-project", "release", "review"];

const skillsDir = path.resolve("skills");

async function skills() {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function frontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : null;
}

async function skillText(skill) {
  return readFile(path.join(skillsDir, skill, "SKILL.md"), "utf8");
}

test("every skill ships front matter with a single-line description", async () => {
  for (const skill of await skills()) {
    const matter = frontMatter(await skillText(skill));
    assert.ok(matter, `${skill}/SKILL.md has no front matter`);

    const description = matter.match(/^description: (.+)$/m);
    assert.ok(description, `${skill}/SKILL.md has no description`);
    assert.ok(description[1].trim().length > 0, `${skill}/SKILL.md has an empty description`);
    // Unquoted YAML scalars end at ": ", so a colon-space would truncate the
    // description for every harness that parses it — silently.
    assert.ok(
      !description[1].includes(": "),
      `${skill}/SKILL.md description contains ": " and would parse as a truncated scalar`,
    );
  }
});

test("skills that read or write the notebook state the gate twice", async () => {
  for (const skill of GATED) {
    const text = await skillText(skill);
    assert.ok(text.includes(TRIGGER), `${skill}/SKILL.md description lost the notebook trigger`);
    assert.ok(text.includes(BODY_CLAUSE), `${skill}/SKILL.md body lost the no-bootstrap clause`);
  }
  for (const skill of WRITERS) {
    assert.ok((await skillText(skill)).includes(WRITE_CLAUSE), `${skill}/SKILL.md must say not to create the notebook`);
  }
  for (const skill of READERS) {
    assert.ok((await skillText(skill)).includes(READ_CLAUSE), `${skill}/SKILL.md lost the not-initialized clause`);
  }
});

// The approval gates name a mechanism now: ask with the harness's structured
// question tool when one exists, and never treat the model's own restatement as
// the answer. Every skill that asks the developer to decide something carries
// the clause, so the asking mechanism is uniform across the set. `frame` and
// `release` gate on scope and on release authorization respectively; neither
// claims an execution-approval gate.
const ASK_CLAUSE =
  "Gate on the developer's answer with the harness's structured question tool when one is available — a blocking prompt that cannot be skipped — otherwise ask in plain text and stop until they answer. Never treat your own restatement of the options as the answer, and keep a free-text path for answers the options do not cover.";

// Every skill asks the developer to decide something — scope, a proposal, a
// release authorization — so the asking mechanism is uniform across the set.
// Iterating the directory rather than a hand-kept list makes a new skill fail
// here until it carries the clause.
test("every skill that asks the developer to decide says how", async () => {
  for (const skill of await skills()) {
    const text = await skillText(skill);
    assert.ok(text.includes(ASK_CLAUSE), `${skill}/SKILL.md lost the structured-question clause`);
  }
});

test("skills that work without a notebook do not claim to require one", async () => {
  for (const skill of UNGATED) {
    const text = await skillText(skill);
    assert.ok(
      !text.includes(TRIGGER),
      `${skill}/SKILL.md claims the notebook precondition but does not need a notebook`,
    );
  }
});