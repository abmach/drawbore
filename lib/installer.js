import { createHash } from "node:crypto";
import { access, copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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

  for (const skill of packageData.skills) {
    const source = path.join(packageRoot, "skills", skill);
    const target = path.join(destination, skill);
    await copySkillDirectory(source, target, `skills/${skill}`, `${location}/skills/${skill}`, {
      preserved,
      replaced,
      hashes,
      previousHashes,
      replaceExisting: options.replaceExisting === true,
      force: options.force === true,
    });
    await writeSkillMarker(target, packageData.namespace, skill);
  }

  return { preserved, replaced, hashes, conflicts };
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

async function hasSkillMarker(target, namespace) {
  const marker = await readSkillMarker(target);
  return isRecord(marker) && marker.namespace === namespace;
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
      if (!state.replaceExisting && !state.force && !isUnmodifiedPackageFile) {
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
  try {
    return JSON.parse(await readFile(path.join(root, installMarkerFile), "utf8"));
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
    updated = `${existing.slice(0, start)}${block}\n`;
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
  notebookCreated,
  instructionFiles,
  skillHashes = {},
) {
  const destination = path.join(root, installMarkerFile);
  const existing = await readInstallMarker(root);
  const payload = {
    version: packageData.version,
    installedAt: new Date().toISOString(),
    namespace: packageData.namespace,
    skills: packageData.skills,
    locations: selectedLocations,
    notebook: notebookCreated ? notebookDirectory : null,
    instructions: instructionFiles,
    skillHashes: mergeSkillHashes(existing.skillHashes, skillHashes),
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