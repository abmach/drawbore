import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

// The notebook precondition is stated twice per skill: in the description,
// which the model reads at selection time before it has looked at the
// filesystem, and in the first line of the body, which it reads once the skill
// is loaded. The two must not drift apart, and neither may drift between the
// skills that need a notebook — so the contract is asserted here.

const DESCRIPTION_CLAUSE =
  "Requires a Drawbore notebook (`.drawbore/index.md` at the repository root); check for it first, and if it is absent do not create it — tell the developer to run `npx drawbore init`.";

const BODY_CLAUSE =
  "Requires `.drawbore/index.md` at the repository root. If it is absent, stop: this project is not initialized with Drawbore. Do not create the notebook or any record — tell the developer to run `npx drawbore init` and offer to continue afterwards.";

// Skills that read or write the notebook. `discover` bootstraps it, and
// `review`, `release`, and `init-project` work without one.
const GATED = ["frame", "recall", "record"];
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

test("skills that read or write the notebook state the precondition twice", async () => {
  for (const skill of GATED) {
    const text = await skillText(skill);
    assert.ok(text.includes(DESCRIPTION_CLAUSE), `${skill}/SKILL.md description lost the notebook precondition`);
    assert.ok(text.includes(BODY_CLAUSE), `${skill}/SKILL.md body lost the no-bootstrap clause`);
  }
});

test("skills that work without a notebook do not claim to require one", async () => {
  for (const skill of UNGATED) {
    const text = await skillText(skill);
    assert.ok(
      !text.includes(DESCRIPTION_CLAUSE),
      `${skill}/SKILL.md claims the notebook precondition but does not need a notebook`,
    );
  }
});