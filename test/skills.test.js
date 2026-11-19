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

// The approval gates name a mechanism and a trigger: a choice turn ends in a
// rendered form when one exists, and never on the model's own restatement.
// The trigger says *when* the form is mandatory, not only *how* to ask. An
// agent reading only "offer apply/edit/skip" could satisfy the old clause with
// prose and still be compliant, which is what happened: a review proposed
// eleven findings in a table and asked its question in a sentence, and the
// developer answered by typing ids. `frame` and `release` gate on scope and on
// release authorization respectively; neither claims an execution-approval gate.
const CHOICE_TURN_CLAUSE =
  "A turn that ends by asking the developer to choose ends in a rendered form, not in prose";


// Every skill asks the developer to decide something — scope, a proposal, a
// release authorization — so the asking mechanism is uniform across the set.
// Iterating the directory rather than a hand-kept list makes a new skill fail
// here until it carries the clause.
test("every skill that asks the developer to decide says how", async () => {
  for (const skill of await skills()) {
    const text = await skillText(skill);
    assert.ok(text.includes(CHOICE_TURN_CLAUSE), `${skill}/SKILL.md lost the choice-turn trigger`);
  }
});

// A skill that names a decision list but not its rendering invites prose. These
// four carry batch or per-item choices; a prose question there is the failure
// the trigger exists to prevent.
const FORM_SKILLS = ["discover", "record", "recall", "review"];

test("skills with a batch or per-item decision name the form that collects it", async () => {
  for (const skill of FORM_SKILLS) {
    const text = await skillText(skill);
    assert.match(text, /rendered form/, `${skill}/SKILL.md offers a decision list without naming the form that collects it`);
    assert.match(text, /free-text field|free-text path/, `${skill}/SKILL.md must keep a free-text path for answers the options do not cover`);
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