#!/usr/bin/env node

import path from "node:path";
import {
  addInstruction,
  checkNotebook,
  createNotebook,
  findProjectRoot,
  fixMechanical,
  inspectProject,
  installMarkerFile,
  installSkills,
  loadPackageData,
  notebookDirectory,
  SkillConflictError,
  summarize,
  supportedLocations,
  writeInstallMarker,
} from "../lib/index.js";

const CHECK_FLAGS = new Set(["--json", "--strict", "--fix"]);
const SUPPORTED_INSTRUCTIONS = new Set(["AGENTS.md", "CLAUDE.md"]);

const args = process.argv.slice(2);
const packageData = await loadPackageData();
const command = args[0];

if (args.includes("--help") || args.includes("-h")) {
  if (command === "check") printCheckHelp(packageData.version);
  else printHelp(packageData.version);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(packageData.version);
  process.exit(0);
}

if (command === "check") {
  await runCheck(args.slice(1));
} else if (command !== "init") {
  console.error("Usage: drawbore init | drawbore check");
  process.exit(2);
} else {
  let plan;
  try {
    plan = parseExplicitOptions(args.slice(1), packageData);
  } catch (error) {
    console.error(error.message);
    printHelp(packageData.version);
    process.exit(2);
  }

  const root = await findProjectRoot();
  await inspectProject(root);
  const selectedLocations = plan?.locations ?? [".agents"];
  const createNotebookDirectory = plan?.notebook ?? true;
  const instructionTargets = plan?.instructions ?? [{ instructionFile: "AGENTS.md" }];

  try {
    console.log(`Drawbore ${packageData.version}`);
    console.log(`Project: ${root}`);

    const selection = plan?.skills ? { ...packageData, skills: plan.skills } : packageData;
    const preservedSkillFiles = [];
    const replacedSkillFiles = [];
    const skillHashes = {};

    for (const location of selectedLocations) {
      const result = await installSkills(root, location, selection, {
        replaceExisting: plan?.replaceSkills === true,
        force: plan?.force === true,
      });
      preservedSkillFiles.push(...result.preserved);
      replacedSkillFiles.push(...result.replaced);
      skillHashes[location] = result.hashes;
    }

    let notebookCreated = false;
    if (createNotebookDirectory) {
      await createNotebook(root);
      notebookCreated = true;
    }

    const instructionFiles = [];
    for (const target of instructionTargets) {
      await addInstruction(root, target.instructionFile, packageData);
      instructionFiles.push(target.instructionFile);
    }

    await writeInstallMarker(root, selection, selectedLocations, notebookCreated, [...new Set(instructionFiles)], skillHashes);
    console.log(formatInstallResult(selectedLocations, notebookCreated, instructionFiles, preservedSkillFiles, replacedSkillFiles));
  } catch (error) {
    if (error instanceof SkillConflictError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

function parseExplicitOptions(options, packageData) {
  if (options.length === 0) {
    return {
      locations: [".agents"],
      notebook: true,
      instructions: [{ instructionFile: "AGENTS.md" }],
      replaceSkills: false,
      force: false,
      skills: null,
    };
  }

  const locations = [];
  const instructions = [];
  let notebook = null;
  let replaceSkills = false;
  let force = false;
  let skills = null;

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--location") {
      const value = options[++index];
      if (value === undefined) throw new Error("Missing value for --location");
      for (const location of splitList(value)) {
        if (!supportedLocations[location]) throw new Error(`Unsupported location: ${location}`);
        locations.push(location);
      }
    } else if (option === "--notebook") {
      notebook = true;
    } else if (option === "--instruction") {
      const value = options[++index];
      if (value === undefined) throw new Error("Missing value for --instruction");
      for (const instructionFile of splitList(value)) {
        if (!SUPPORTED_INSTRUCTIONS.has(instructionFile)) throw new Error(`Unsupported instruction file: ${instructionFile}`);
        instructions.push({ instructionFile });
      }
    } else if (option === "--skills") {
      const value = options[++index];
      if (value === undefined) throw new Error("Missing value for --skills");
      const requested = splitList(value);
      const unknown = requested.filter((skill) => !packageData.skills.includes(skill));
      if (unknown.length > 0) throw new Error(`Unknown skill(s): ${unknown.join(", ")}`);
      skills = [...new Set(requested)];
    } else if (option === "--replace-skills") {
      replaceSkills = true;
    } else if (option === "--force") {
      force = true;
    } else if (option === "--yes") {
      // accepted for compatibility
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }

  if (locations.length === 0) locations.push(".agents");
  if (notebook === null) notebook = true;
  if (instructions.length === 0) {
    for (const instructionFile of new Set(locations.map((location) => supportedLocations[location]))) {
      instructions.push({ instructionFile });
    }
  }

  return {
    locations: [...new Set(locations)],
    notebook,
    replaceSkills,
    force,
    skills,
    instructions: [...new Map(instructions.map((target) => [target.instructionFile, target])).values()],
  };
}

function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function runCheck(options) {
  for (const option of options) {
    if (!CHECK_FLAGS.has(option)) {
      console.error(`Unknown option for check: ${option}`);
      process.exit(2);
    }
  }

  const json = options.includes("--json");
  const strict = options.includes("--strict");
  const fix = options.includes("--fix");
  const root = await findProjectRoot();
  const notebookDir = path.join(root, notebookDirectory);

  if (fix) {
    const { fixed } = await fixMechanical(notebookDir);
    if (json) {
      console.log(JSON.stringify({ fixed, changed: fixed.length > 0 }, null, 2));
    } else if (fixed.length === 0) {
      console.log("Nothing to fix.");
    } else {
      for (const item of fixed) {
        console.log(`fixed ${item.code} ${item.file}: ${item.message}`);
      }
    }
  }

  const findings = await checkNotebook(notebookDir);
  const summary = summarize(findings);

  if (json) {
    console.log(JSON.stringify({
      ok: summary.ok,
      errors: summary.errors,
      warnings: summary.warnings,
      stale: summary.stale,
    }, null, 2));
  } else if (findings.length === 0) {
    console.log("No structural issues found.");
  } else {
    for (const finding of findings) {
      const where = finding.file ? ` (${finding.file})` : "";
      const tag = finding.code.startsWith("S") ? "review" : finding.code.startsWith("W") ? "warn" : "error";
      console.log(`${finding.code} [${tag}]${where}: ${finding.message}`);
    }
  }

  const failed = !summary.ok || (strict && summary.warnings.length > 0);
  process.exit(failed ? 1 : 0);
}

function formatInstallResult(locations, notebookCreated, instructionFiles, preservedSkillFiles, replacedSkillFiles) {
  const lines = ["", "Installed:"];
  for (const location of locations) lines.push(`- skills: ${location}/skills/`);
  if (notebookCreated) lines.push(`- record: ${notebookDirectory}/`);
  for (const file of instructionFiles) lines.push(`- instruction: ${file}`);
  lines.push(`- marker: ${installMarkerFile}`);
  if (preservedSkillFiles.length > 0) lines.push("", `Preserved ${preservedSkillFiles.length} file(s).`);
  if (replacedSkillFiles.length > 0) lines.push(`Replaced ${replacedSkillFiles.length} file(s).`);
  lines.push("", "Run the discover skill in your agent to propose the first durable records.");
  return lines.join("\n");
}

function printCheckHelp(version) {
  console.log(`Drawbore ${version}\n\nUsage:\n  drawbore check [--json] [--strict] [--fix]`);
}

function printHelp(version) {
  console.log(`Drawbore ${version}

Usage:
  drawbore init [options]
  drawbore check [--json] [--strict] [--fix]
  drawbore --version
  drawbore --help

init options:
  --location <dir>      Harness location to install into (repeatable).
                        One of: .agents, .claude, .codex, .cursor, .omp, .opencode.
  --notebook            Create or refresh the .drawbore templates.
  --instruction <file>  Add the Drawbore block to an instruction file (repeatable).
                        One of: AGENTS.md, CLAUDE.md.
  --skills <list>       Comma-separated subset of skills to install.
  --replace-skills      Replace installed skill files that differ.
  --force               Replace skills owned by another package.
  --yes                 Accept defaults without prompting.

Drawbore is provider-neutral: it does not assume a forge, registry, or CI provider.`);
}