import { createHash } from "node:crypto";
import { access, copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
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

// User-level directories read by the harnesses: Cursor (~/.agents/skills,
// ~/.cursor/skills), OpenCode (~/.agents/skills, ~/.config/opencode/skills),
// Codex (~/.codex/skills), Claude Code (~/.claude/skills), and OMP
// (~/.omp/agent/skills). Every supported location has a user-level counterpart.
export const userLocations = Object.freeze([".agents", ".claude", ".codex", ".cursor", ".omp", ".opencode"]);

function configHome({ env = process.env, home = homedir() } = {}) {
  return env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME)
    ? env.XDG_CONFIG_HOME
    : path.join(home, ".config");
}

// The OMP agent directory: `OMP_PROFILE` (or the legacy `PI_PROFILE`) relocates
// every native user-level path to ~/.omp/profiles/<name>/agent, and the default
// profile's directory can be replaced outright by PI_CODING_AGENT_DIR. Named
// profiles ignore PI_CODING_AGENT_DIR.
function ompAgentDir({ env = process.env, home = homedir() } = {}) {
  const selected = typeof env.OMP_PROFILE === "string" ? env.OMP_PROFILE : env.PI_PROFILE;
  const profile = typeof selected === "string" ? selected.trim() : "";
  if (profile && profile !== "default") return path.join(home, ".omp", "profiles", profile, "agent");
  if (env.PI_CODING_AGENT_DIR) return path.resolve(env.PI_CODING_AGENT_DIR);
  return path.join(home, ".omp", "agent");
}

// User-level destinations, keyed by the label the CLI accepts. Each is the
// directory its harness reads: OpenCode follows XDG_CONFIG_HOME, and OMP uses
// ~/.omp/agent/skills (profile-aware) rather than ~/.omp/skills.
export function userLocationTargets(options = {}) {
  const home = options.home ?? homedir();
  return [
    { label: ".agents", dir: path.join(home, ".agents") },
    { label: ".claude", dir: path.join(home, ".claude") },
    { label: ".codex", dir: path.join(home, ".codex") },
    { label: ".cursor", dir: path.join(home, ".cursor") },
    { label: ".omp", dir: ompAgentDir({ ...options, home }) },
    { label: ".opencode", dir: path.join(configHome(options), "opencode") },
  ];
}

// The per-user marker lives beside the user's config, not in the home root:
// one file, discoverable, and never a stray dotfile.
export function userMarkerFile(options = {}) {
  return path.join(configHome(options), "drawbore", "install.json");
}

// A scope is where an install lives. Everything the installer does is relative
// to one: the project root with a tracked marker, or the home directory with a
// per-user marker and user-level skill directories.
export function projectScope(root) {
  return {
    kind: "project",
    root,
    markerFile: installMarkerFile,
    locations: Object.keys(supportedLocations),
    dir: (location) => path.join(root, location),
    display: (location) => location,
  };
}

export function userScope(options = {}) {
  const home = options.home ?? homedir();
  const targets = userLocationTargets({ ...options, home });
  const byLabel = new Map(targets.map((target) => [target.label, target.dir]));
  return {
    kind: "global",
    root: home,
    markerFile: userMarkerFile({ ...options, home }),
    locations: [...byLabel.keys()],
    dir: (location) => {
      if (!byLabel.has(location)) throw new Error(`Unsupported user-level location: ${location}`);
      return byLabel.get(location);
    },
    // User-level paths are shown relative to the home directory, so the
    // summary reads "~/.config/opencode/skills/" rather than a bare label.
    display: (location) => `~/${path.relative(home, byLabel.get(location)).split(path.sep).join("/")}`,
  };
}

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

export async function inspectProject(root) {
  const locations = [];
  for (const [locationPath, instructionName] of Object.entries(supportedLocations)) {
    locations.push({
      path: locationPath,
      instructionName,
      instructionExists: await exists(path.join(root, instructionName)),
      skillsExist: await exists(path.join(root, locationPath, "skills")),
    });
  }
  return { root, notebookExists: await exists(path.join(root, notebookDirectory)), locations };
}

export async function installSkills(root, location, packageData, options = {}) {
  const locationDir = options.dir ? options.dir(location) : path.join(root, location);
  await assertDirectoryTarget(locationDir, `${location} in ${root}`);
  const destination = path.join(locationDir, "skills");
  await assertDirectoryTarget(destination, `${location}/skills`);
  await mkdir(destination, { recursive: true });

  const { previousHashes, installNamespace } = await readInstallState(root, location, options.markerFile);
  const conflicts = await findConflicts(destination, location, packageData, previousHashes, installNamespace);

  if (conflicts.length > 0 && options.force !== true) {
    throw new SkillConflictError(conflicts);
  }

  const preserved = [];
  const replaced = [];
  const hashes = {};

  for (const skill of packageData.skills) {
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
  for (const skill of packageData.skills) {
    const target = path.join(destination, skill);
    if (!(await isForeignSkill(target, skill, packageData, previousHashes, installNamespace))) continue;
    conflicts.push({ location, skill, target, reason: "foreign-skill" });
  }
  return conflicts;
}

// Validate every destination before the first write. A conflict in the second
// location must not leave the first one installed with no marker recording it:
// that state is indistinguishable from a hand copy and `update` refuses to
// touch it.
export async function preflightInstall(root, locations, packageData, options = {}) {
  const conflicts = [];
  for (const location of locations) {
    const locationDir = options.dir ? options.dir(location) : path.join(root, location);
    await assertDirectoryTarget(locationDir, `${location} in ${root}`);
    const destination = path.join(locationDir, "skills");
    await assertDirectoryTarget(destination, `${location}/skills`);
    if (!(await isDirectory(destination))) continue;
    const { previousHashes, installNamespace } = await readInstallState(root, location, options.markerFile);
    conflicts.push(...(await findConflicts(destination, location, packageData, previousHashes, installNamespace)));
  }
  return conflicts;
}

export async function readInstallState(root, location, markerFile) {
  return {
    previousHashes: await readInstalledSkillHashes(root, location, markerFile),
    installNamespace: await readInstallNamespace(root, markerFile),
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

  const source = path.join(packageRoot, "skills", skill);
  const packageFiles = await listFiles(source);
  const targetFiles = await listFiles(target);
  const divergent = [];

  for (const file of packageFiles) {
    const targetPath = path.join(target, ...file.split("/"));
    // A directory where the package has a file is the `SKILL.md` collision
    // shape; it is preserved, not counted as foreign content.
    if ((await pathType(targetPath)) !== "file") continue;
    if (!(await readFile(targetPath)).equals(await readFile(path.join(source, ...file.split("/"))))) {
      divergent.push(file);
    }
  }
  for (const file of targetFiles) {
    if (file !== skillMarkerFile && !packageFiles.includes(file)) divergent.push(file);
  }
  return divergent.length > 0;
}

// Drift is what a refresh would change, decidable from the tree alone:
//   missing  — the skill is not installed, so `update` would add it
//   foreign  — another package owns it, so `update` refuses without --force
//   conflict — a file sits where the skill directory belongs
//   modified — the bytes diverge from the package, so a refresh preserves them
// Marker-owned modifications are reported as `modified` rather than skipped:
// `--check` promises the install differs from the package, not that ownership
// changed.
export async function diffSkills(root, locations, packageData, options = {}) {
  const drifts = [];
  for (const location of locations) {
    const destination = path.join(options.dir ? options.dir(location) : path.join(root, location), "skills");
    const { previousHashes, installNamespace } = await readInstallState(root, location, options.markerFile);
    for (const skill of packageData.skills) {
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

// The divergent files of an installed skill, used by both the drift report and
// removal: anything not byte-identical to the package, plus any file the
// package does not ship, except the ownership marker.
async function divergentFiles(target, skill) {
  const source = path.join(packageRoot, "skills", skill);
  const packageFiles = await listFiles(source);
  const divergent = [];
  for (const file of packageFiles) {
    const targetPath = path.join(target, ...file.split("/"));
    if ((await pathType(targetPath)) !== "file") {
      divergent.push(file);
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

// A user-level inspection mirrors the project one, so the interactive location
// picker offers the same choices in either scope.
export async function inspectUserScopes(options = {}) {
  const home = options.home ?? homedir();
  const locations = [];
  for (const target of userLocationTargets({ ...options, home })) {
    locations.push({
      path: target.label,
      instructionName: null,
      instructionExists: false,
      skillsExist: await isDirectory(path.join(target.dir, "skills")),
    });
  }
  return { root: home, notebookExists: false, locations };
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
    const base = options.dir ? options.dir(location) : path.join(root, location);
    const destination = path.join(base, "skills");
    if (!(await isDirectory(destination))) continue;
    const { previousHashes, installNamespace } = await readInstallState(root, location, options.markerFile);

    for (const skill of skills) {
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
  if (updated.trim() === "") {
    if (options.dryRun !== true) await rm(destination, { force: true });
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

async function removeGitignoreNote(root) {
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

export async function removeInstallMarker(root, markerFile = installMarkerFile) {
  const destination = path.resolve(root, markerFile);
  if ((await pathType(destination)) === null) return false;
  await rm(destination, { force: true });
  // The user-level marker sits in its own config directory; drop it when the
  // removal leaves it empty.
  const parent = path.dirname(destination);
  if (parent !== path.resolve(root) && (await isDirectory(parent)) && (await readdir(parent)).length === 0) {
    await rm(parent, { recursive: true, force: true });
  }
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

async function readInstallNamespace(root, markerFile) {
  const marker = await readInstallMarker(root, markerFile);
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

async function readInstalledSkillHashes(root, location, markerFile) {
  const marker = await readInstallMarker(root, markerFile);
  return sanitizeHashes(marker.skillHashes?.[location]);
}

export async function readInstallMarker(root, markerFile = installMarkerFile) {
  try {
    return JSON.parse(await readFile(path.resolve(root, markerFile), "utf8"));
  } catch {
    return {};
  }
}

function formatConflictMessage(conflicts) {
  const lines = conflicts.map((conflict) => `- ${[conflict.location, "skills", conflict.skill].join("/")}`);
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

async function assertDirectoryTarget(target, label) {
  const type = await pathType(target);
  if (type === "file") throw new Error(`Cannot install into ${label}: ${target} exists as a file`);
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

export async function addInstruction(root, instructionFile, packageData) {
  const destination = path.join(root, instructionFile);
  const destinationType = await pathType(destination);
  if (destinationType === "directory") throw new Error(`Cannot write ${destination}: path is a directory`);
  const existing = destinationType === "file" ? await readFile(destination, "utf8") : "";
  const block = packageData.instructionTemplate.trim();
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
    const separator = rest.length === 0 || rest.endsWith("\n") ? "" : "\n";
    updated = `${existing.slice(0, start)}${block}\n${rest}${separator}`;
  } else {
    const separator = existing.length === 0 ? "" : existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    updated = `${existing}${separator}${block}\n`;
  }
  await writeFile(destination, updated, "utf8");
}

export async function writeInstallMarker(
  root,
  packageData,
  selectedLocations,
  notebook,
  instructionFiles,
  skillHashes = {},
  options = {},
) {
  const markerFile = options.markerFile ?? installMarkerFile;
  const destination = path.resolve(root, markerFile);
  const existing = await readInstallMarker(root, markerFile);
  // The user-level marker sits in a config directory that may not exist yet.
  await mkdir(path.dirname(destination), { recursive: true });
  const payload = {
    version: packageData.version,
    installedAt: new Date().toISOString(),
    namespace: packageData.namespace,
    skills: packageData.skills,
    locations: selectedLocations,
    notebook: typeof notebook === "string" ? notebook : null,
    instructions: instructionFiles,
    skillHashes: mergeSkillHashes(existing.skillHashes, skillHashes),
    skillDirs: mergeSkillDirs(existing.skillDirs, options.skillDirs),
  };
  await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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

// The marker records where each location was installed, so a later run under a
// different OMP profile or XDG_CONFIG_HOME still finds — and removes — what was
// actually written.
function mergeSkillDirs(existing, next) {
  const merged = {};
  for (const [location, dir] of Object.entries(existing ?? {})) {
    if (typeof dir === "string" && dir.length > 0) merged[location] = dir;
  }
  for (const [location, dir] of Object.entries(next ?? {})) {
    if (typeof dir === "string" && dir.length > 0) merged[location] = dir;
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