import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  buildInstructionChoices,
  buildLocationChoices,
  createSpinner,
  createUi,
  formatInstallResult,
} from "../lib/prompts.js";

const LOCATIONS = [".agents", ".claude", ".codex", ".cursor", ".omp", ".opencode"];

test("every @inquirer/prompts name destructured in lib/prompts.js is a real export", async () => {
  const source = await readFile("lib/prompts.js", "utf8");
  const destructured = new Set();
  for (const match of source.matchAll(/const \{([^}]+)\}[^;]*?await load\(\)/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(":")[0].trim();
      if (name) destructured.add(name);
    }
  }

  assert.ok(destructured.size > 0, "expected at least one destructured prompt");

  const inquirer = await import("@inquirer/prompts");
  for (const name of destructured) {
    assert.equal(typeof inquirer[name], "function", `expected @inquirer/prompts.${name} to be a function`);
  }
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

test("createSpinner is silent when stderr is not a TTY", () => {
  const stderr = new PassThrough();
  stderr.resume();
  const stop = createSpinner({ message: "Installing…", stderr });
  stop();
});

test("formatInstallResult mirrors the CLI installed summary", () => {
  const text = formatInstallResult([".agents"], true, ["AGENTS.md"], [], []);
  assert.match(text, /Installed:/);
  assert.match(text, /skills: \.agents\/skills\//);
  assert.match(text, /notebook: \.drawbore\//);
  assert.match(text, /instruction: AGENTS\.md/);
  assert.match(text, /marker: \.drawbore-install\.json/);
});

test("formatInstallResult deduplicates instruction files", () => {
  const text = formatInstallResult([".agents", ".claude"], false, ["AGENTS.md", "AGENTS.md"], [], []);
  assert.equal(text.match(/instruction: AGENTS\.md/g).length, 1);
});