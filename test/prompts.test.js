import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  buildInstructionChoices,
  buildLocationChoices,
  createUi,
  formatInstallResult,
} from "../lib/prompts.js";

const LOCATIONS = [".agents", ".claude", ".codex", ".cursor", ".omp", ".opencode"];

// The UI destructures components out of @inquirer/prompts at runtime; a typo
// there (the historical case: `multiselect` does not exist) crashes the run.
// Pin the contract on the package, not on the source text.
test("the interactive prompts module exports the components the UI calls", async () => {
  const inquirer = await import("@inquirer/prompts");
  assert.equal(typeof inquirer.checkbox, "function");
  assert.equal(typeof inquirer.confirm, "function");
});

test("buildLocationChoices covers six locations and starts with nothing selected", () => {
  const choices = buildLocationChoices({
    locations: LOCATIONS.map((path) => ({
      path,
      instructionName: path === ".claude" ? "CLAUDE.md" : "AGENTS.md",
      instructionExists: false,
      skillsExist: false,
    })),
  });

  assert.equal(choices.length, 6);
  assert.deepEqual(choices.map((choice) => choice.value), LOCATIONS);
  assert.ok(choices.every((choice) => choice.checked === false));
});

test("buildLocationChoices never preselects, even when skills already exist", () => {
  const choices = buildLocationChoices({
    locations: [
      { path: ".agents", instructionName: "AGENTS.md", instructionExists: false, skillsExist: true },
      { path: ".claude", instructionName: "CLAUDE.md", instructionExists: false, skillsExist: false },
    ],
  });

  assert.equal(choices[0].checked, false);
  assert.equal(choices[1].checked, false);
});

test("buildInstructionChoices defaults every choice to checked", () => {
  const choices = buildInstructionChoices([
    { instructionFile: "AGENTS.md", exists: false },
    { instructionFile: "CLAUDE.md", exists: true },
  ]);

  assert.deepEqual(choices.map((choice) => choice.value), ["AGENTS.md", "CLAUDE.md"]);
  assert.ok(choices.every((choice) => choice.checked === true));
  assert.match(choices[0].name, /will be created/);
  assert.match(choices[1].name, /already exists/);
});

test("createUi forces the fallback path when isTTY is false", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const ui = createUi({ isTTY: false, stdin: input, stdout: output });

  const pending = ui.selectLocations([{ name: ".agents", value: ".agents" }]);
  input.write(".agents\n");
  assert.deepEqual(await pending, [".agents"]);
  ui.close();
});

test("fallback selectLocations rejects unsupported values", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const ui = createUi({ isTTY: false, stdin: input, stdout: output });

  const pending = ui.selectLocations([{ name: ".agents", value: ".agents" }]);
  input.write(".nope\n");
  await assert.rejects(pending, /Unsupported location\(s\): \.nope/);
  ui.close();
});

test("fallback confirm honors the default on bare enter", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const ui = createUi({ isTTY: false, stdin: input, stdout: output });

  const pending = ui.confirm({ message: "Install?", defaultValue: true });
  input.write("\n");
  assert.equal(await pending, true);
  ui.close();
});

test("TTY ui delegates to the injected prompts module", async () => {
  const messages = [];
  const prompts = {
    async checkbox(config) {
      messages.push(config.message);
      return config.choices.map((choice) => choice.value);
    },
    async confirm(config) {
      messages.push(config.message);
      return true;
    },
  };
  const ui = createUi({ isTTY: true, prompts });

  const selected = await ui.selectLocations([
    { name: ".agents", value: ".agents" },
    { name: ".claude", value: ".claude" },
  ]);
  assert.deepEqual(selected, [".agents", ".claude"]);
  assert.equal(await ui.confirm({ message: "Install?", defaultValue: true }), true);
  assert.ok(messages.some((message) => /Drawbore skills/.test(message)));
  assert.ok(messages.some((message) => /Install\?/.test(message)));
});

test("formatInstallResult renders the install summary with the discover hint", () => {
  const text = formatInstallResult([".agents"], true, ["AGENTS.md"], [], []);
  assert.match(text, /^Installed:/m);
  assert.match(text, /skills: \.agents\/skills\//);
  assert.match(text, /record: \.drawbore\//);
  assert.match(text, /instruction: AGENTS\.md/);
  assert.match(text, /marker: \.drawbore-install\.json/);
  assert.match(text, /Run the discover skill/);
});

test("formatInstallResult rewords the block for update and dry runs", () => {
  const text = formatInstallResult([".agents"], false, ["AGENTS.md"], [], [], { noun: "Would update", firstInstall: false });
  assert.match(text, /^Would update:/m);
  assert.doesNotMatch(text, /Run the discover skill/);
});

test("formatInstallResult deduplicates instruction files and counts file groups", () => {
  const text = formatInstallResult([".agents", ".claude"], false, ["AGENTS.md", "AGENTS.md"], ["a/SKILL.md"], ["b/SKILL.md", "c/SKILL.md"], { firstInstall: false });
  assert.equal(text.match(/instruction: AGENTS\.md/g).length, 1);
  assert.match(text, /Preserved 1 file\(s\)\./);
  assert.match(text, /Replaced 2 file\(s\)\./);
});