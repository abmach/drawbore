import { createHash } from "node:crypto";
import { access, copyFile, cp, lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const supportedLocations = Object.freeze({
  ".agents": "AGENTS.md",
  ".claude": "CLAUDE.md",
  ".codex": "AGENTS.md",
  ".cursor": "AGENTS.md",
  ".omp": "AGENTS.md",
  ".opencode": "AGENTS.md",
});

// A marker is repository-tracked and hand-editable, so only the documented
// harness locations may name a destination; an entry such as "../escape" or an
// absolute path would otherwise become a write target outside the project.
// `in` would also accept inherited keys like "toString", hence Object.hasOwn.
export function isSupportedLocation(value) {
  return typeof value === "string" && Object.hasOwn(supportedLocations, value);
}

export const notebookDirectory = ".drawbore";
export const installMarkerFile = ".drawbore-install.json";
const skillMarkerFile = ".drawbore-skill.json";

const instructionMarkers = Object.freeze({
  start: "<!-- drawbore:start -->",
  end: "<!-- drawbore:end -->",
});

export class SkillConflictError extends Error {
  constructor(conflicts) {
    super(formatConflictMessage(conflicts));
    this.name = "SkillConflictError";
    this.conflicts = conflicts;
  }
}

export class MarkerError extends Error {
  constructor(message) {
    super(message);
    this.name = "MarkerError";
  }
}

// The marker is repository-tracked and hand-editable. `locations` are checked
// against the documented set, `instructions` against containment inside the
// project: `../outside/AGENTS.md` otherwise becomes a write target on `update`
// and a delete target on `uninstall`, outside the tree the developer is in.
export function readMarkerLocations(marker) {
  const recorded = Array.isArray(marker.locations) ? marker.locations : [];
  const allowed = Object.keys(supportedLocations);
  const invalid = recorded.filter((location) => !isSupportedLocation(location));
  if (invalid.length > 0) {
    throw new MarkerError(
      `Install marker lists unsupported location(s): ${invalid.join(", ")}. Supported: ${allowed.join(", ")}. Fix the marker or run \`drawbore init\`.`,
    );
  }
  return [...new Set(recorded)];
}

export function assertMarkerInstruction(root, instructionFile) {
  if (typeof instructionFile !== "string" || instructionFile.length === 0) {
    throw new MarkerError("Install marker lists an empty instruction file. Fix the marker or run `drawbore init`.");
  }
  const destination = path.resolve(root, instructionFile);
  const relative = path.relative(root, destination);
  if (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)) return destination;
  throw new MarkerError(
    `Install marker lists instruction file outside the project: ${instructionFile}. Fix the marker or run \`drawbore init\`.`,
  );
}

// Lexical containment is not enough: an in-project path can be a symlink to a
// file outside the project. Resolve the existing ancestors and the destination
// themselves, then require the canonical target to remain inside the canonical
// project root. A missing destination is allowed because init creates it; its
// existing ancestors still have to stay inside the root.
async function assertCanonicalInstruction(root, instructionFile) {
  const destination = assertMarkerInstruction(root, instructionFile);
  const canonicalRoot = await realpath(root);
  const canonical = await canonicalizeExistingPath(destination);
  if (canonical === null) {
    throw new MarkerError(
      `Install marker lists instruction file that cannot be resolved: ${instructionFile}. Fix the marker or run \`drawbore init\`.`,
    );
  }
  const relative = path.relative(canonicalRoot, canonical);
  if (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)) return destination;
  throw new MarkerError(
    `Install marker lists instruction file outside the project: ${instructionFile}. Fix the marker or run \`drawbore init\`.`,
  );
}

// Resolve the existing part of a path and append the missing tail. Returns
// null when an existing component cannot be resolved — a broken symlink or a
// symlink loop. Such a path has no canonical target, and writing through it
// would create the missing target wherever the link points, so it is refused
// rather than treated as an ordinary missing child.
async function canonicalizeExistingPath(target) {
  const parts = [];
  let current = path.resolve(target);
  while (true) {
    try {
      await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      parts.push(path.basename(current));
      current = parent;
      continue;
    }
    try {
      const resolved = await realpath(current);
      return path.join(resolved, ...parts.reverse());
    } catch {
      return null;
    }
  }
}

export async function assertMarkerInstructions(root, marker) {
  const recorded = Array.isArray(marker.instructions) ? marker.instructions : [];
  const files = [];
  for (const instructionFile of recorded) {
    const destination = await assertCanonicalInstruction(root, instructionFile);
    if ((await pathType(destination)) === "directory") {
      throw new MarkerError(`Install marker lists instruction file that is a directory: ${instructionFile}`);
    }
    if (!files.includes(instructionFile)) files.push(instructionFile);
  }
  return files;
}

export async function loadPackageData() {
  const [manifestText, versionText, instructionText] = await Promise.all([
    readFile(path.join(packageRoot, "templates", "manifest.json"), "utf8"),
    readFile(path.join(packageRoot, "package.json"), "utf8"),
    readFile(path.join(packageRoot, "templates", "instruction.md"), "utf8"),
  ]);

  return {
    ...JSON.parse(manifestText),
    version: JSON.parse(versionText).version,
    instructionTemplate: instructionText,
    packageRoot,
  };
}

export async function findProjectRoot(cwd = process.cwd()) {
  let current = path.resolve(cwd);
  while (true) {
    if (await exists(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd);
    current = parent;
  }
}

// A location counts as installed only when this package's skills are on disk
// there. Neither signal alone is enough: a skills directory can belong to other
// tools entirely, and a marker can outlive the directory it described — both
// would claim an install the developer cannot find.
export async function isLocationInstalled(root, location, packageData) {
  const destination = path.join(root, location, "skills");
  if (!(await isDirectory(destination))) return false;

  for (const skill of packageData.skills) {
    const marker = await readSkillMarker(path.join(destination, skill));
    if (isRecord(marker) && marker.namespace === packageData.namespace) return true;
  }

  // A marker-less install is ours while the bytes still match what was
  // recorded, the same rule removal follows.
  const { previousHashes, installNamespace } = await readInstallState(root, location);
  if (installNamespace === packageData.namespace) {
    for (const skill of packageData.skills) {
      if (await matchesRecordedHashes(path.join(destination, skill), skill, previousHashes)) return true;
    }
  }
  return false;
}

export async function inspectProject(root, packageData) {
  const locations = [];
  for (const [locationPath, instructionName] of Object.entries(supportedLocations)) {
    locations.push({
      path: locationPath,
      instructionName,
      instructionExists: await exists(path.join(root, instructionName)),
      skillsExist: await exists(path.join(root, locationPath, "skills")),
      installed: await isLocationInstalled(root, locationPath, packageData),
    });
  }
  return { root, notebookExists: await exists(path.join(root, notebookDirectory)), locations };
}

export async function installSkills(root, location, packageData, options = {}) {
  const locationDir = path.join(root, location);
  await assertDirectoryTarget(locationDir, `${location} in ${root}`);
  const destination = path.join(locationDir, "skills");
  await assertDirectoryTarget(destination, `${location}/skills`);
  await mkdir(destination, { recursive: true });

  const { previousHashes, installNamespace } = await readInstallState(root, location);
  const conflicts = await findConflicts(destination, location, packageData, previousHashes, installNamespace);

  if (conflicts.length > 0 && options.force !== true) {
    throw new SkillConflictError(conflicts);
  }

  const preserved = [];
  const replaced = [];
  const hashes = {};

  for (const skill of skillsForLocation(packageData, location)) {
    const source = path.join(packageRoot, "skills", skill);
    const target = path.join(destination, skill);
    await copySkillDirectory(source, target, `skills/${skill}`, `${location}/skills/${skill}`, {
      preserved,
      replaced,
      hashes,
      previousHashes,
      force: options.force === true,
    });
    await writeSkillMarker(target, packageData.namespace, skill);
  }

  return { preserved, replaced, hashes, conflicts, dir: locationDir };
}

async function findConflicts(destination, location, packageData, previousHashes, installNamespace) {
  const conflicts = [];
  for (const skill of skillsForLocation(packageData, location)) {
    const target = path.join(destination, skill);
    // A file where the skill directory belongs is a conflict `init` must report,
    // not a `mkdir` it crashes on after earlier skills already landed.
    if ((await pathType(target)) === "file") {
      conflicts.push({ location, skill, target, reason: "skill-target-is-file" });
      continue;
    }
    if (!(await isForeignSkill(target, skill, packageData, previousHashes, installNamespace))) continue;
    conflicts.push({ location, skill, target, reason: "foreign-skill" });
  }
  return conflicts;
}

// Validate every destination before the first write. A conflict in the second
// location must not leave the first one installed with no marker recording it:
// that state is indistinguishable from a hand copy and `update` refuses to
// touch it.
export async function preflightInstall(root, locations, packageData) {
  const conflicts = [];
  for (const location of locations) {
    const locationDir = path.join(root, location);
    await assertDirectoryTarget(locationDir, `${location} in ${root}`);
    const destination = path.join(locationDir, "skills");
    await assertDirectoryTarget(destination, `${location}/skills`);
    if (!(await isDirectory(destination))) continue;
    const { previousHashes, installNamespace } = await readInstallState(root, location);
    conflicts.push(...(await findConflicts(destination, location, packageData, previousHashes, installNamespace)));
  }
  return conflicts;
}

export async function readInstallState(root, location) {
  return {
    previousHashes: await readInstalledSkillHashes(root, location),
    installNamespace: await readInstallNamespace(root),
  };
}

// A skill is foreign when it exists and its content diverges from what this
// package ships, unless this installer or this namespace already owns it. A
// path whose type differs from the package's is a file/directory conflict the
// copy loop preserves, never foreign content to overwrite.
async function isForeignSkill(target, skill, packageData, previousHashes, installNamespace) {
  if (!(await isDirectory(target))) return false;
  // One marker read serves both the namespace check and the foreign-marker
  // check below.
  const marker = await readSkillMarker(target);
  if (isRecord(marker) && marker.namespace === packageData.namespace) return false;
  if (isRecord(marker) && typeof marker.namespace === "string") return true;
  if (installNamespace === packageData.namespace && (await matchesRecordedHashes(target, skill, previousHashes))) {
    return false;
  }

  // `divergentFiles` is the single byte comparison; the "a directory where the
  // package has a file" case is the type exemption the copy loop preserves, so
  // it is excluded here rather than counted as divergence.
  return (await divergentFiles(target, skill, { typeMismatch: "ignore" })).length > 0;
}

// Drift is what a refresh would change, decidable from the tree alone:
//   missing  — the skill is not installed, so `update` would add it
//   foreign  — another package owns it, so `update` refuses without --force
//   conflict — a file sits where the skill directory belongs
//   modified — the bytes diverge from the package, so a refresh preserves them
// Marker-owned modifications are reported as `modified` rather than skipped:
// `--check` promises the install differs from the package, not that ownership
// changed.
export async function diffSkills(root, locations, packageData) {
  const drifts = [];
  for (const location of locations) {
    const destination = path.join(root, location, "skills");
    const { previousHashes, installNamespace } = await readInstallState(root, location);
    for (const skill of skillsForLocation(packageData, location)) {
      const target = path.join(destination, skill);
      const type = await pathType(target);
      if (type === null) {
        drifts.push({ location, skill, reason: "missing" });
        continue;
      }
      if (type !== "directory") {
        drifts.push({ location, skill, reason: "conflict" });
        continue;
      }
      if (await isForeignSkill(target, skill, packageData, previousHashes, installNamespace)) {
        drifts.push({ location, skill, reason: "foreign" });
        continue;
      }
      if (await differsFromPackage(target, skill)) drifts.push({ location, skill, reason: "modified" });
    }
  }
  return drifts;
}

// The same byte comparison isForeignSkill makes, minus its "a directory is a
// preserved conflict" exemption: `--check` reports what a refresh would leave
// standing, and a type mismatch is exactly that.
async function differsFromPackage(target, skill) {
  return (await divergentFiles(target, skill)).length > 0;
}

// The divergent files of an installed skill: anything not byte-identical to the
// package, plus any file the package does not ship, except the ownership marker.
// `typeMismatch: "ignore"` keeps the foreign-skill rule that a directory where
// the package has a file is preserved, not counted; the drift report omits it
// because a type mismatch is exactly what `--check` promises to surface.
async function divergentFiles(target, skill, { typeMismatch = "report" } = {}) {
  const source = path.join(packageRoot, "skills", skill);
  const packageFiles = await listFiles(source);
  const divergent = [];
  for (const file of packageFiles) {
    const targetPath = path.join(target, ...file.split("/"));
    if ((await pathType(targetPath)) !== "file") {
      if (typeMismatch === "report") divergent.push(file);
      continue;
    }
    if (!(await readFile(targetPath)).equals(await readFile(path.join(source, ...file.split("/"))))) {
      divergent.push(file);
    }
  }
  for (const file of await listFiles(target)) {
    if (file !== skillMarkerFile && !packageFiles.includes(file)) divergent.push(file);
  }
  return divergent;
}

// Remove the skills this install owns. Ownership follows installation exactly:
// a marker in this namespace, or recorded hashes that still match. Anything
// else is reported and left alone. A skill with any local modification is kept
// whole — deleting the pristine files around an edited one would leave a broken
// skill the harness still advertises.
export async function removeSkills(root, locations, packageData, options = {}) {
  const skills = options.skills ?? packageData.skills;
  const removed = [];
  const preserved = [];
  const foreign = [];
  const pruned = [];
  const dryRun = options.dryRun === true;

  for (const location of locations) {
    const base = path.join(root, location);
    const destination = path.join(base, "skills");
    if (!(await isDirectory(destination))) continue;
    const { previousHashes, installNamespace } = await readInstallState(root, location);

    for (const skill of skillsForLocation(packageData, location, skills)) {
      const target = path.join(destination, skill);
      const type = await pathType(target);
      const label = options.display ? options.display(location) : location;
      const display = `${label}/skills/${skill}`;
      if (type === null) continue;
      if (type !== "directory") {
        foreign.push(display);
        continue;
      }

      const marker = await readSkillMarker(target);
      let owned = false;
      if (isRecord(marker) && typeof marker.namespace === "string") {
        owned = marker.namespace === packageData.namespace;
      } else if (installNamespace === packageData.namespace) {
        owned = await matchesRecordedHashes(target, skill, previousHashes);
      }
      if (!owned) {
        foreign.push(display);
        continue;
      }

      if ((await divergentFiles(target, skill)).length > 0) {
        preserved.push(display);
        continue;
      }
      if (!dryRun) await rm(target, { recursive: true, force: true });
      removed.push(display);
    }

    if (dryRun) continue;
    for (const directory of [destination, base]) {
      if (!(await isDirectory(directory))) continue;
      if ((await readdir(directory)).length > 0) continue;
      await rm(directory, { recursive: true, force: true });
      pruned.push(path.relative(root, directory).split(path.sep).join("/") || directory);
    }
  }

  return { removed, preserved, foreign, pruned };
}

// Remove the Drawbore block from an instruction file. A file carrying only one
// of the two markers is malformed: report it and leave the file untouched, the
// same rule addInstruction follows when it refuses to guess.
export async function removeInstruction(root, instructionFile, options = {}) {
  const destination = path.resolve(root, instructionFile);
  const type = await pathType(destination);
  if (type === null) return { status: "absent" };
  if (type !== "file") return { status: "skipped", reason: `${instructionFile} is not a file` };

  const text = await readFile(destination, "utf8");
  const start = text.indexOf(instructionMarkers.start);
  const end = text.indexOf(instructionMarkers.end);

  if (start === -1 && end === -1) return { status: "absent" };
  if (start === -1 || end === -1 || end < start) return { status: "malformed" };

  const before = text.slice(0, start);
  const after = text.slice(end + instructionMarkers.end.length);
  // The block was appended after a blank line; removing it must not leave two
  // blank lines behind.
  const seam = before.endsWith("\n\n") && after.startsWith("\n") ? after.slice(1) : after;
  const body = `${before}${seam}`;
  // The block was appended with a trailing newline; drop the blank line it
  // leaves at EOF, but never touch a file that continues after the block.
  const updated = seam.trim() === "" ? body.replace(/\n+$/, "\n") : body;
  // An instruction file that carried only the block is now empty. The caller
  // decides whether it existed before the install: deleting a pre-existing file
  // destroys developer content, so only a file this installer created goes.
  if (updated.trim() === "") {
    if (options.dryRun !== true && options.removeEmpty === true) await rm(destination, { force: true });
    return { status: "removed", emptied: true };
  }
  if (options.dryRun !== true) await writeFile(destination, updated, "utf8");
  return { status: "removed" };
}

// The notebook is curated developer content, so only an explicit purge removes
// it — together with the .gitignore note the installer added for it.
export async function removeNotebook(root) {
  const directory = path.join(root, notebookDirectory);
  if ((await pathType(directory)) === null) return false;
  await rm(directory, { recursive: true, force: true });
  await removeGitignoreNote(root);
  return true;
}

export async function removeGitignoreNote(root) {
  const gitignorePath = path.join(root, ".gitignore");
  let existing;
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch {
    return false;
  }
  if (!existing.includes("# `.drawbore/` is tracked on purpose")) return false;
  const next = existing.replace(GITIGNORE_NOTEBOOK_NOTE, "");
  if (next.trim() === "") {
    await rm(gitignorePath, { force: true });
    return true;
  }
  await writeFile(gitignorePath, next, "utf8");
  return true;
}

export async function removeInstallMarker(root) {
  const destination = path.join(root, installMarkerFile);
  if ((await pathType(destination)) === null) return false;
  await rm(destination, { force: true });
  return true;
}

// An installed skill whose marker was deleted still belongs to us while its
// files hash-match what the install marker recorded.
async function matchesRecordedHashes(target, skill, previousHashes) {
  const prefix = `skills/${skill}/`;
  const recorded = Object.keys(previousHashes).filter((key) => key.startsWith(prefix));
  if (recorded.length === 0) return false;
  const targetFiles = (await listFiles(target)).filter((file) => file !== skillMarkerFile);
  if (targetFiles.length !== recorded.length) return false;
  for (const key of recorded) {
    const relative = key.slice(prefix.length);
    if (!targetFiles.includes(relative)) return false;
    const contents = await readFile(path.join(target, ...relative.split("/")));
    if (hashContents(contents) !== previousHashes[key]) return false;
  }
  return true;
}

async function listFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        files.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  }
  await walk(root);
  return files;
}

async function readInstallNamespace(root) {
  const marker = await readInstallMarker(root);
  return typeof marker.namespace === "string" ? marker.namespace : null;
}

export async function readSkillMarker(target) {
  try {
    return JSON.parse(await readFile(path.join(target, skillMarkerFile), "utf8"));
  } catch {
    return null;
  }
}

async function writeSkillMarker(target, namespace, skill) {
  await writeFile(
    path.join(target, skillMarkerFile),
    `${JSON.stringify({ namespace, skill }, null, 2)}\n`,
    "utf8",
  );
}

async function copySkillDirectory(source, target, hashTarget, displayTarget, state) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const hashPath = `${hashTarget}/${entry.name}`;
    const displayPath = `${displayTarget}/${entry.name}`;

    if (entry.isDirectory()) {
      const existing = await pathType(targetPath);
      if (existing === "file" && !state.force) {
        state.preserved.push(displayPath);
        continue;
      }
      if (existing === "file" && state.force) {
        await rm(targetPath, { recursive: true, force: true });
      }
      await mkdir(targetPath, { recursive: true });
      await copySkillDirectory(sourcePath, targetPath, hashPath, displayPath, state);
      continue;
    }

    const existing = await pathType(targetPath);
    if (existing === "directory" && !state.force) {
      state.preserved.push(displayPath);
      continue;
    }
    if (existing === "directory" && state.force) {
      await rm(targetPath, { recursive: true, force: true });
    }

    const sourceContents = await readFile(sourcePath);
    const sourceHash = hashContents(sourceContents);

    if (existing === "file") {
      const targetContents = await readFile(targetPath);
      if (sourceContents.equals(targetContents)) {
        state.hashes[hashPath] = sourceHash;
        continue;
      }

      const targetHash = hashContents(targetContents);
      const previousHash = state.previousHashes[hashPath];
      const isUnmodifiedPackageFile = previousHash !== undefined && targetHash === previousHash;
      if (!state.force && !isUnmodifiedPackageFile) {
        state.preserved.push(displayPath);
        if (previousHash !== undefined) state.hashes[hashPath] = previousHash;
        continue;
      }
      state.replaced.push(displayPath);
    }
    await copyFile(sourcePath, targetPath);
    state.hashes[hashPath] = sourceHash;
  }
}

async function readInstalledSkillHashes(root, location) {
  const marker = await readInstallMarker(root);
  return sanitizeHashes(marker.skillHashes?.[location]);
}

export async function readInstallMarker(root) {
  let text;
  try {
    text = await readFile(path.join(root, installMarkerFile), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new MarkerError(`Cannot read install marker ${installMarkerFile}: ${error.message}`);
  }
  try {
    const marker = JSON.parse(text);
    if (!isRecord(marker)) throw new Error("marker must be a JSON object");
    return marker;
  } catch (error) {
    throw new MarkerError(`Install marker ${installMarkerFile} is malformed: ${error.message}`);
  }
}

function formatConflictMessage(conflicts) {
  const lines = conflicts.map((conflict) =>
    conflict.reason === "skill-target-is-file"
      ? `- ${[conflict.location, "skills", conflict.skill].join("/")}: a file sits where the skill directory belongs`
      : `- ${[conflict.location, "skills", conflict.skill].join("/")}`,
  );
  return `Drawbore will not overwrite skills it does not own:\n${lines.join("\n")}\nRe-run with --force to replace them.`;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hashContents(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function pathType(target) {
  try {
    const stats = await stat(target);
    return stats.isDirectory() ? "directory" : "file";
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function isDirectory(target) {
  return (await pathType(target)) === "directory";
}

export class InstallTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = "InstallTargetError";
  }
}

// A destination the installer cannot use is the user's tree, not a bug: the CLI
// prints the message and exits 1. Throwing a plain `Error` here made the CLI
// sniff message prefixes to tell the two apart.
async function assertDirectoryTarget(target, label) {
  const type = await pathType(target);
  if (type === "file") throw new InstallTargetError(`Cannot install into ${label}: ${target} exists as a file`);
}

export async function createNotebook(root) {
  const destination = path.join(root, notebookDirectory);
  await assertDirectoryTarget(destination, notebookDirectory);
  await mkdir(destination, { recursive: true });
  for (const subdirectory of ["decisions", "work"]) {
    await assertDirectoryTarget(path.join(destination, subdirectory), `${notebookDirectory}/${subdirectory}`);
  }
  await cp(path.join(packageRoot, "templates", "record"), destination, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
  await mkdir(path.join(destination, "decisions"), { recursive: true });
  await mkdir(path.join(destination, "work"), { recursive: true });
  await ensureGitignoreNote(root);
}

// Ensure the notebook's tracked-by-default status is documented in the repo's
// .gitignore. We never add .drawbore/ to the ignore list — the comment exists
// so a future reader (or agent) knows its absence from the ignore list is
// intentional, and knows the sanctioned path if they want it local instead.
const GITIGNORE_NOTEBOOK_NOTE = [
  "",
  "# `.drawbore/` is tracked on purpose: it is this project's durable context,",
  "# validated by `drawbore check`. To keep it local instead, remove it from the",
  "# repository (git rm -r --cached .drawbore) and add a `.drawbore/` line here —",
  "# that is a deliberate choice, not the default.",
  "",
].join("\n");

async function ensureGitignoreNote(root) {
  const gitignorePath = path.join(root, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch {
    existing = "";
  }
  if (existing.includes("# `.drawbore/` is tracked on purpose")) return false;

  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const next = `${existing}${separator}${GITIGNORE_NOTEBOOK_NOTE}`;
  await writeFile(gitignorePath, next, "utf8");
  return true;
}

export async function assertInstructionTarget(root, instructionFile) {
  const destination = path.resolve(root, instructionFile);
  const relative = path.relative(root, destination);
  if (relative !== "" && (relative.startsWith("..") || path.isAbsolute(relative))) {
    throw new InstallTargetError(`Cannot write ${destination}: path is outside the project`);
  }
  const canonicalRoot = await realpath(root);
  const canonical = await canonicalizeExistingPath(destination);
  if (canonical === null) {
    throw new InstallTargetError(`Cannot write ${destination}: path cannot be resolved`);
  }
  const canonicalRelative = path.relative(canonicalRoot, canonical);
  if (canonicalRelative !== "" && (canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative))) {
    throw new InstallTargetError(`Cannot write ${destination}: path resolves outside the project`);
  }
  const type = await pathType(destination);
  if (type === "directory") throw new InstallTargetError(`Cannot write ${destination}: path is a directory`);
  return destination;
}

// `instructionExists` reports whether a file is already there, so the caller can
// record it before `addInstruction` splices the block in: a file the developer
// had is kept on uninstall, one created from nothing is removed.
export async function instructionExists(root, instructionFile) {
  return (await pathType(await assertInstructionTarget(root, instructionFile))) === "file";
}

export async function addInstruction(root, instructionFile, packageData) {
  const destination = await assertInstructionTarget(root, instructionFile);
  const destinationType = await pathType(destination);
  const existing = destinationType === "file" ? await readFile(destination, "utf8") : "";
  // Splicing the template verbatim lets a CRLF template land in an LF file (or
  // the reverse), leaving mixed endings that `git diff` hides and `npm pack`
  // ships. The block and every newline the splice adds follow the destination.
  const nl = usesCrlf(existing) ? "\r\n" : "\n";
  const block = matchLineEndings(packageData.instructionTemplate.trim(), existing);
  const { start: startMarker, end: endMarker } = instructionMarkers;
  const start = existing.indexOf(startMarker);
  const end = existing.indexOf(endMarker);
  let updated;

  if (start !== -1 && end !== -1 && end > start) {
    updated = `${existing.slice(0, start)}${block}${existing.slice(end + endMarker.length)}`;
  } else if (start !== -1) {
    // An unclosed start marker: keep whatever follows it. Dropping the tail
    // would destroy user content a partial or hand-merged block left behind.
    const lineEnd = existing.indexOf("\n", start);
    const rest = lineEnd === -1 ? "" : existing.slice(lineEnd + 1);
    const separator = rest.length === 0 || rest.endsWith("\n") ? "" : nl;
    updated = `${existing.slice(0, start)}${block}${nl}${rest}${separator}`;
  } else {
    const separator = existing.length === 0 || existing.endsWith(nl + nl)
      ? ""
      : existing.endsWith(nl)
        ? nl
        : nl + nl;
    updated = `${existing}${separator}${block}${nl}`;
  }
  await writeFile(destination, updated, "utf8");
}

// A file is CRLF when most of its newlines are; an empty file is LF.
function usesCrlf(text) {
  const total = (text.match(/\n/g) ?? []).length;
  const crlf = (text.match(/\r\n/g) ?? []).length;
  return crlf * 2 > total;
}

function matchLineEndings(text, reference) {
  const crlf = usesCrlf(reference);
  return crlf ? text.replace(/\r?\n/g, "\r\n") : text.replace(/\r\n/g, "\n");
}

export async function writeInstallMarker(
  root,
  packageData,
  selectedLocations,
  notebook,
  instructionFiles,
  skillHashes = {},
  existedBefore = [],
  existingMarker = null,
) {
  const destination = path.join(root, installMarkerFile);
  const existing = existingMarker ?? await readInstallMarker(root);
  const locations = [...new Set([...stringArray(existing.locations), ...selectedLocations])];
  const instructions = [...new Set([...stringArray(existing.instructions), ...instructionFiles])];
  const skills = [...new Set([...stringArray(existing.skills), ...packageData.skills])];
  const skillsByLocation = mergeSkillsByLocation(existing.skillsByLocation, selectedLocations, packageData);
  const payload = {
    version: packageData.version,
    installedAt: new Date().toISOString(),
    namespace: packageData.namespace,
    skills,
    locations,
    notebook: typeof notebook === "string" ? notebook : typeof existing.notebook === "string" ? existing.notebook : null,
    instructions,
    // A file the developer already had keeps its content on uninstall; one the
    // installer created is removed with its block. Without this the marker
    // cannot tell the two apart, and `uninstall` deleted the developer's file.
    existedBefore: [...new Set([...stringArray(existing.existedBefore), ...existedBefore])].filter((file) => instructions.includes(file)),
    skillsByLocation,
    skillHashes: mergeSkillHashes(existing.skillHashes, skillHashes),
  };
  await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

// Each location keeps the skill set it was installed with. A refresh passes
// the recorded per-location sets back through `packageData.skillsByLocation`,
// so unioning the global skill list here would widen a restricted location.
function mergeSkillsByLocation(existing, locations, packageData) {
  const merged = {};
  for (const [location, recorded] of Object.entries(existing ?? {})) {
    if (Array.isArray(recorded)) merged[location] = [...new Set(recorded)];
  }
  for (const location of locations) {
    const recorded = packageData.skillsByLocation?.[location];
    const selected = Array.isArray(recorded) ? recorded : packageData.skills;
    merged[location] = [...new Set([...(merged[location] ?? []), ...selected])];
  }
  return merged;
}

function skillsForLocation(packageData, location, fallback = packageData.skills) {
  const recorded = packageData.skillsByLocation?.[location];
  return Array.isArray(recorded) ? recorded : fallback;
}

function mergeSkillHashes(existing, next) {
  const merged = {};
  for (const [location, hashes] of Object.entries(existing ?? {})) {
    const sanitized = sanitizeHashes(hashes);
    if (Object.keys(sanitized).length > 0) merged[location] = sanitized;
  }
  for (const [location, hashes] of Object.entries(next ?? {})) {
    const sanitized = sanitizeHashes(hashes);
    merged[location] = sanitized;
  }
  return merged;
}

function sanitizeHashes(hashes) {
  if (!isRecord(hashes)) return {};
  return Object.fromEntries(
    Object.entries(hashes).filter(([, hash]) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)),
  );
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}