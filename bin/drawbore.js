#!/usr/bin/env node

import path from "node:path";
import {
  addInstruction,
  buildInstructionChoices,
  buildLocationChoices,
  checkNotebook,
  createNotebook,
  createUi,
  diffSkills,
  findProjectRoot,
  fixMechanical,
  formatInstallResult,
  inspectProject,
  installMarkerFile,
  installSkills,
  isSupportedLocation,
  loadPackageData,
  notebookDirectory,
  preflightInstall,
  readInstallMarker,
  removeInstallMarker,
  removeInstruction,
  removeNotebook,
  removeSkills,
  SkillConflictError,
  summarize,
  supportedLocations,
  writeInstallMarker,
} from "../lib/index.js";

const CHECK_FLAGS = new Set(["--json", "--strict", "--fix"]);
const UPDATE_FLAGS = new Set(["--dry-run", "--check", "--force"]);
const UNINSTALL_FLAGS = new Set(["--dry-run", "--purge"]);

// `update --check` prints one line per divergence; the reason is the drift kind
// `diffSkills` reports, phrased for the reader.
const DRIFT_REASONS = Object.freeze({
  missing: "not installed",
  foreign: "not owned by this install",
  conflict: "is not a directory",
  modified: "differs from the package (a refresh preserves the local copy)",
});

const SUPPORTED_INSTRUCTIONS = new Set(["AGENTS.md", "CLAUDE.md"]);

const args = process.argv.slice(2);
const packageData = await loadPackageData();
const command = args[0];

// --help is scoped to the invoked command: `drawbore check --help` prints check
// usage, `drawbore init --help` prints init help, bare `drawbore --help` prints
// the top-level help. --version always prints the package version regardless of
// command, since the version is the same for every subcommand.
if (args.includes("--help") || args.includes("-h")) {
  if (command === "check") printCheckHelp(packageData.version);
  else if (command === "update") printUpdateHelp(packageData.version);
  else if (command === "uninstall") printUninstallHelp(packageData.version);
  else printHelp(packageData.version);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(packageData.version);
  process.exit(0);
}

if (command === "check") {
  await runCheck(args.slice(1));
} else if (command === "update") {
  await runUpdate(args.slice(1), packageData);
} else if (command === "uninstall") {
  await runUninstall(args.slice(1), packageData);
} else if (command === undefined) {
  // Bare `drawbore` is a help request, not an error worth a one-line usage.
  printHelp(packageData.version);
  process.exit(2);
} else if (command !== "init") {
  console.error(`Unknown command: ${command}`);
  console.error("Usage: drawbore init | drawbore update | drawbore check | drawbore uninstall");
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
  const inspection = await inspectProject(root, packageData);
  const ui = createUi();

  // No flags + non-interactive (pipe, CI, test): use the defaults rather than
  // prompting on a stream nobody is reading. The prompts layer itself falls
  // back to readline, which would block forever on a closed stdin.
  // --dry-run is a flags-mode preview; with no flags the interactive confirm
  // already serves as the gate, so it is not threaded through the fallback.
  if (!plan && !ui.isInteractive) {
    plan = {
      locations: [".agents"],
      notebook: true,
      instructions: [{ instructionFile: "AGENTS.md" }],
      force: false,
      dryRun: false,
      skills: null,
    };
  }


  try {
    console.log(`Drawbore ${packageData.version}`);
    console.log(`Project: ${root}`);

    if (!plan) ui.renderProjectState(inspection);

    const selectedLocations = plan?.locations ?? await pickLocations(inspection, ui);
    if (selectedLocations.length === 0) {
      console.log("No harness locations selected. Nothing was installed.");
      process.exit(0);
    }

    const createNotebookDirectory = plan?.notebook ?? await pickNotebook(ui, inspection);
    const instructionTargets = plan?.instructions ?? await pickInstructions(selectedLocations, inspection, ui);

    if (!plan && !(await ui.confirm({ message: "Install Drawbore with these choices?", defaultValue: true }))) {
      console.log("Installation cancelled. Nothing was installed.");
      process.exit(0);
    }
    if (plan?.dryRun) {
      console.log("Dry run — nothing will be written.");
      console.log(formatInstallResult(selectedLocations, createNotebookDirectory, instructionTargets.map((target) => target.instructionFile), [], [], { noun: "Would install", firstInstall: false }));
      process.exit(0);
    }

    const selection = plan?.skills ? { ...packageData, skills: plan.skills } : packageData;

    // Every destination is validated before the first write, so a conflict in
    // one location cannot leave the others installed without a marker.
    const conflicts = await preflightInstall(root, selectedLocations, selection);
    if (conflicts.length > 0 && plan?.force !== true) {
      throw new SkillConflictError(conflicts);
    }

    const preservedSkillFiles = [];
    const replacedSkillFiles = [];
    const skillHashes = {};

    for (const location of selectedLocations) {
      const result = await installSkills(root, location, selection, { force: plan?.force === true });
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

    await writeInstallMarker(root, selection, selectedLocations, notebookCreated ? notebookDirectory : null, [...new Set(instructionFiles)], skillHashes);
    console.log(formatInstallResult(selectedLocations, notebookCreated, instructionFiles, preservedSkillFiles, replacedSkillFiles));
  } catch (error) {
    if (error instanceof SkillConflictError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  } finally {
    ui.close();
  }
}

// `drawbore update` refreshes an existing install: re-copies the package's
// skills (preserving locally-modified ones, same rules as init), re-applies the
// instruction block, and refreshes the install marker. Unlike init it never
// creates a notebook or asks where to install — it works from the existing
// install marker.

async function runUpdate(options, packageData) {
  for (const option of options) {
    if (!UPDATE_FLAGS.has(option)) {
      console.error(`Unknown option for update: ${option}`);
      printUpdateHelp(packageData.version);
      process.exit(2);
    }
  }

  const dryRun = options.includes("--dry-run");
  const checkOnly = options.includes("--check");
  const force = options.includes("--force");
  const root = await findProjectRoot();
  const marker = await readInstallMarker(root);
  const locations = readMarkerLocations(marker);

  if (locations.length === 0) {
    console.error("No existing Drawbore install found. Run `drawbore init` first.");
    process.exit(1);
  }

  // The marker records what the user asked for: `init --skills` installs a
  // subset, and `update` must not widen it behind their back. A marker without
  // a skills list (older install) refreshes the full set.
  const recordedSkills = Array.isArray(marker.skills)
    ? marker.skills.filter((skill) => packageData.skills.includes(skill))
    : null;
  const selection = recordedSkills === null
    ? { ...packageData }
    : { ...packageData, skills: [...new Set(recordedSkills)] };
  const drifts = await diffSkills(root, locations, selection);

  console.log(`Drawbore ${packageData.version}`);
  console.log(`Project: ${root}`);

  if (checkOnly) {
    if (drifts.length === 0) {
      console.log("No drift detected. Installed skills match this package.");
      process.exit(0);
    }
    for (const drift of drifts) {
      console.log(`- ${drift.location}/skills/${drift.skill}: ${DRIFT_REASONS[drift.reason] ?? drift.reason}`);
    }
    process.exit(1);
  }

  if (dryRun) {
    console.log("Dry run — nothing will be written.");
    console.log(formatInstallResult(locations, false, (marker.instructions ?? []).map((f) => f), [], [], { noun: "Would update", firstInstall: false }));
    process.exit(0);
  }

  const preservedSkillFiles = [];
  const replacedSkillFiles = [];
  const skillHashes = {};
  try {
    const conflicts = await preflightInstall(root, locations, selection);
    if (conflicts.length > 0 && !force) throw new SkillConflictError(conflicts);

    for (const location of locations) {
      const result = await installSkills(root, location, selection, { force });
      preservedSkillFiles.push(...result.preserved);
      replacedSkillFiles.push(...result.replaced);
      skillHashes[location] = result.hashes;
    }
  } catch (error) {
    // `init` already turns this into a readable message; update must not dump
    // the stack at a user who only needs the --force hint.
    if (error instanceof SkillConflictError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const instructionFiles = [];
  for (const instructionFile of marker.instructions ?? []) {
    await addInstruction(root, instructionFile, packageData);
    instructionFiles.push(instructionFile);
  }

  // A refresh keeps the recorded notebook: `update` never creates one, and
  // nulling the field would erase the record a previous `init` wrote.
  const notebook = typeof marker.notebook === "string" ? marker.notebook : null;
  await writeInstallMarker(root, selection, locations, notebook, [...new Set(instructionFiles)], skillHashes);
  console.log(formatInstallResult(locations, false, instructionFiles, preservedSkillFiles, replacedSkillFiles, { noun: "Updated", firstInstall: false }));
}


function printUpdateHelp(version) {
  console.log(`Drawbore ${version}

Usage:
  drawbore update [--dry-run] [--check] [--force]

Refresh an existing install: re-copies the package's skills (preserving
locally-modified ones) and re-applies the instruction block.

Options:
  --dry-run   Print what would change without writing anything.
  --check     Report drift only; exit 1 if a skill is missing, foreign, or differs
              from the package.
  --force     Replace skills owned by another package (ownership conflicts).`);
}

// `drawbore uninstall` reverses an install: it removes the skills this install
// owns, the Drawbore block from each recorded instruction file, and the marker.
// The notebook survives unless --purge is passed, and a locally modified skill
// is kept whole rather than partially deleted.
async function runUninstall(options, packageData) {
  for (const option of options) {
    if (!UNINSTALL_FLAGS.has(option)) {
      console.error(`Unknown option for uninstall: ${option}`);
      printUninstallHelp(packageData.version);
      process.exit(2);
    }
  }

  const dryRun = options.includes("--dry-run");
  const purge = options.includes("--purge");
  const root = await findProjectRoot();
  const marker = await readInstallMarker(root);
  const locations = readMarkerLocations(marker);

  if (locations.length === 0) {
    console.error("No Drawbore install found. Run `drawbore init` first.");
    process.exit(1);
  }

  // Removal follows the marker's skill list, not the package's: a subset install
  // must not have skills removed that it never installed.
  const recordedSkills = Array.isArray(marker.skills)
    ? marker.skills.filter((skill) => packageData.skills.includes(skill))
    : packageData.skills;
  const selection = { ...packageData, skills: [...new Set(recordedSkills)] };

  console.log(`Drawbore ${packageData.version}`);
  console.log(`Project: ${root}`);
  if (dryRun) console.log("Dry run — nothing will be written.");

  const removed = await removeSkills(root, locations, selection, { dryRun });

  const instructions = [];
  for (const instructionFile of marker.instructions ?? []) {
    const result = await removeInstruction(root, instructionFile, { dryRun });
    if (result.status === "removed") instructions.push(instructionFile);
    else if (result.status === "malformed") {
      console.error(`Left ${instructionFile} untouched: it carries only one drawbore marker.`);
    } else if (result.status === "skipped") {
      console.error(`Left ${instructionFile} untouched: ${result.reason}.`);
    }
  }

  const notebookRemoved = purge && (dryRun || await removeNotebook(root));
  if (!dryRun) await removeInstallMarker(root);

  console.log(formatUninstallResult(removed, {
    noun: dryRun ? "Would uninstall" : "Uninstalled",
    instructions,
    markerFile: installMarkerFile,
    notebookRemoved,
    dryRun,
  }));
}

function formatUninstallResult(result, { noun, instructions, markerFile, notebookRemoved, dryRun }) {
  const verb = dryRun ? "would remove" : "removed";
  const lines = ["", `${noun}:`];
  for (const item of result.removed) lines.push(`- ${verb}: ${item}`);
  for (const item of result.pruned) lines.push(`- ${verb} empty directory: ${item}`);
  for (const file of instructions) lines.push(`- ${verb} instruction block: ${file}`);
  lines.push(`- ${verb} marker: ${markerFile}`);
  if (notebookRemoved) lines.push(`- ${verb} notebook: ${notebookDirectory}/`);
  if (result.preserved.length > 0) {
    lines.push("", `Kept ${result.preserved.length} locally modified skill(s):`);
    for (const item of result.preserved) lines.push(`- ${item}`);
    lines.push("", "Delete them by hand if you no longer want them.");
  }
  if (result.foreign.length > 0) {
    lines.push("", "Left alone, not owned by this install:");
    for (const item of result.foreign) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

function printUninstallHelp(version) {
  console.log(`Drawbore ${version}

Usage:
  drawbore uninstall [--dry-run] [--purge]

Reverse an install: remove the skills this install owns, the Drawbore block from
each recorded instruction file, and the install marker. The notebook survives
unless --purge is passed, and a locally modified skill is kept whole.

Options:
  --dry-run   Print what would be removed without writing anything.
  --purge     Also delete the .drawbore/ notebook and its .gitignore note.`);
}

function parseExplicitOptions(options, packageData) {
  if (options.length === 0) {
    return undefined;
  }

  const locations = [];
  const instructions = [];
  let notebook = null;
  let force = false;
  let dryRun = false;
  let skills = null;

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--location") {
      const value = options[++index];
      if (value === undefined) throw new Error("Missing value for --location");
      for (const location of splitList(value)) {
        if (!isSupportedLocation(location)) {
          throw new Error(`Unsupported location: ${location}. Supported: ${Object.keys(supportedLocations).join(", ")}`);
        }
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
    } else if (option === "--force") {
      force = true;
    } else if (option === "--dry-run") {
      dryRun = true;
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
    force,
    dryRun,
    skills,
    instructions: [...new Map(instructions.map((target) => [target.instructionFile, target])).values()],
  };
}

async function pickLocations(inspection, ui) {
  const choices = buildLocationChoices(inspection);
  const selected = await ui.selectLocations(choices);
  return validateSelectedLocations(selected);
}

async function pickNotebook(ui, inspection) {
  const message = inspection.notebookExists
    ? `Create or refresh the ${notebookDirectory} templates? Existing files will be preserved.`
    : `Create ${notebookDirectory} with starter records?`;
  return ui.confirm({ message, defaultValue: true });
}

async function pickInstructions(selectedLocations, inspection, ui) {
  const targets = [...new Set(selectedLocations.map((location) => supportedLocations[location]))].map(
    (instructionFile) => ({
      instructionFile,
      exists: inspection.locations.some((entry) => entry.instructionName === instructionFile && entry.instructionExists),
    }),
  );
  const choices = buildInstructionChoices(targets);
  const picked = await ui.selectInstructions(choices);

  const invalid = picked.filter((value) => !targets.some((target) => target.instructionFile === value));
  if (invalid.length > 0) {
    throw new Error(`Unsupported instruction file(s): ${invalid.join(", ")}`);
  }

  return picked.map((instructionFile) => ({ instructionFile }));
}

function validateSelectedLocations(selected) {
  if (!selected || selected.length === 0) {
    return [];
  }
  const allowed = Object.keys(supportedLocations);
  const invalid = selected.filter((location) => !allowed.includes(location));
  if (invalid.length > 0) {
    throw new Error(`Unsupported location(s): ${invalid.join(", ")}. Supported: ${allowed.join(", ")}`);
  }
  return [...new Set(selected)];
}

function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

// The install marker is repository-tracked and hand-editable, so it is a trust
// boundary: an entry outside the documented locations would otherwise become a
// write target outside the project root.
function readMarkerLocations(marker) {
  const recorded = Array.isArray(marker.locations) ? marker.locations : [];
  const allowed = Object.keys(supportedLocations);
  const invalid = recorded.filter((location) => !allowed.includes(location));
  if (invalid.length > 0) {
    console.error(`Install marker lists unsupported location(s): ${invalid.join(", ")}`);
    console.error(`Supported: ${allowed.join(", ")}. Fix the marker or run \`drawbore init\`.`);
    process.exit(1);
  }
  return [...new Set(recorded)];
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

  let fixReport = null;
  if (fix) {
    const { fixed } = await fixMechanical(notebookDir);
    fixReport = { fixed, changed: fixed.length > 0 };
    if (!json) {
      if (fixed.length === 0) {
        console.log("Nothing to fix.");
      } else {
        for (const item of fixed) {
          console.log(`fixed ${item.code} ${item.file}: ${item.message}`);
        }
      }
    }
  }

  const findings = await checkNotebook(notebookDir);
  const summary = summarize(findings);

  if (json) {
    // One document for both --fix and --json: two concatenated objects are not
    // parseable, which would break the flag's machine-readable contract.
    console.log(JSON.stringify({
      ...fixReport,
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

function printCheckHelp(version) {
  console.log(`Drawbore ${version}\n\nUsage:\n  drawbore check [--json] [--strict] [--fix]`);
}

function printHelp(version) {
  console.log(`Drawbore ${version}

Usage:
  drawbore init [options]
  drawbore update [--dry-run] [--check] [--force]
  drawbore check [--json] [--strict] [--fix]
  drawbore uninstall [--dry-run] [--purge]
  drawbore --version
  drawbore --help

init options:
  --location <dir>      Harness location to install into (repeatable).
                        One of: .agents, .claude, .codex, .cursor, .omp, .opencode.
  --notebook            Create or refresh the .drawbore templates.
  --instruction <file>  Add the Drawbore block to an instruction file (repeatable).
                        One of: AGENTS.md, CLAUDE.md.
  --skills <list>       Comma-separated subset of skills to install.
  --force               Replace skills owned by another package.
  --yes                 Accept defaults without prompting.
  --dry-run             Print what would be installed without writing anything.

update options:
  --dry-run             Print what would change without writing anything.
  --check               Report drift only; exit 1 if the install differs from the package.
  --force               Replace skills owned by another package.

uninstall options:
  --dry-run             Print what would be removed without writing anything.
  --purge               Also delete the .drawbore/ notebook and its .gitignore note.

Drawbore is provider-neutral: it does not assume a forge, registry, or CI provider.`);
}