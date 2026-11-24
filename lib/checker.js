// Structural linter for a Drawbore record.
//
// Scope is deliberately narrow: only invariants that are mechanically decidable
// from the record files themselves. Semantic questions are NOT checked here.

import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const STATUSES = new Set(["proposed", "accepted", "deprecated", "superseded"]);
const SIGNIFICANCES = new Set(["durable", "architectural"]);
const DECISION_FILE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const FRONT_MATTER_ID = /^id:\s*(\d+)\s*$/m;
const FRONT_MATTER_STATUS = /^status:\s*([A-Za-z-]+)\s*$/m;
const FRONT_MATTER_SIGNIFICANCE = /^significance:\s*([A-Za-z-]+)\s*$/m;
const FRONT_MATTER_DATE = /^date:\s*(\S+)\s*$/m;
const FRONT_MATTER_SUPERSEDED_BY = /^superseded_by:\s*(\d+)\s*$/m;
const FRONT_MATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const REQUIRED_DECISION_SECTIONS = [
  "Context",
  "Decision",
  "Rationale",
  "Alternatives considered",
  "Consequences",
];

function frontMatter(text) {
  const match = String(text).match(FRONT_MATTER_BLOCK);
  return match ? match[1] : "";
}

function hasHeading(text, heading) {
  return stripFences(text).split("\n").some((line) => line.trim() === heading);
}

function validIsoDate(value) {
  const match = String(value).match(ISO_DATE);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

const REQUIRED_HEADINGS = {
  "index.md": "# Project Notebook",
  "context.md": "# Project Context",
  "glossary.md": "# Glossary",
  "principles.md": "# Principles",
  "system.md": "# System Behavior",
  "stack.md": "# Technical Choices",
};

function stripFences(text) {
  const lines = String(text).split("\n");
  const out = [];
  let fence = null;
  for (const line of lines) {
    const m = line.match(/^\s*(```+|~~~+)/);
    if (m) {
      if (fence === null) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      out.push("");
      continue;
    }
    out.push(fence === null ? line : "");
  }
  return out.join("\n");
}

async function checkArtifacts(notebookDir, findings) {
  for (const [file, heading] of Object.entries(REQUIRED_HEADINGS)) {
    let text;
    try {
      text = await readFile(path.join(notebookDir, file), "utf8");
    } catch {
      if (file === "index.md") {
        findings.push({
          code: "E009",
          file,
          message: "missing required notebook index",
        });
      }
      continue;
    }
    if (!hasHeading(text, heading)) {
      findings.push({
        code: "E007",
        file,
        message: `missing required heading "${heading}"`,
      });
    }
  }

  let principles;
  try {
    principles = await readFile(path.join(notebookDir, "principles.md"), "utf8");
  } catch {
    return;
  }
  // A principle may wrap: the `Source:` note can sit on a continuation line
  // after the numbered opener. Scan the whole block from one numbered line to
  // the next (or EOF) rather than only the first line.
  const principleLines = stripFences(principles).split("\n");
  const rules = [];
  for (let index = 0; index < principleLines.length; index += 1) {
    if (!/^\s*\d+[.)]\s+\*\*/.test(principleLines[index])) continue;
    const block = [principleLines[index]];
    let cursor = index + 1;
    while (cursor < principleLines.length && !/^\s*\d+[.)]\s+\*\*/.test(principleLines[cursor])) {
      block.push(principleLines[cursor]);
      cursor += 1;
    }
    rules.push(block.join("\n"));
    index = cursor - 1;
  }
  for (const rule of rules) {
    if (!/Source:/i.test(rule)) {
      findings.push({
        code: "E008",
        file: "principles.md",
        message: `principle has no Source: ${rule.trim().slice(0, 80)}`,
      });
    }
  }
}

async function checkIndex(notebookDir, findings) {
  const indexPath = path.join(notebookDir, "index.md");
  let indexText;
  try {
    indexText = await readFile(indexPath, "utf8");
  } catch {
    return;
  }

  const linkTargets = new Set();
  const linkRe = /\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRe.exec(indexText)) !== null) {
    let href = match[1].trim().replace(/#.*$/, "").replace(/^\.\//, "");
    if (/^[a-z]+:/i.test(href)) continue;
    if (href.endsWith("/")) href = href.replace(/\/+$/, "");
    if (href) linkTargets.add(href);
  }

  let top;
  try {
    top = await readdir(notebookDir, { withFileTypes: true });
  } catch {
    return;
  }
  const artifacts = top
    .filter((entry) =>
      (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") ||
      (entry.isDirectory() && (entry.name === "decisions" || entry.name === "work")),
    )
    .map((entry) => entry.name);

  for (const name of artifacts) {
    if (!linkTargets.has(name)) {
      const label = name === "decisions" || name === "work" ? `${name}/` : name;
      findings.push({
        code: "W003",
        file: "index.md",
        message: `top-level ${label} is not linked from the index`,
      });
    }
  }

  for (const href of linkTargets) {
    const resolved = path.join(notebookDir, href);
    let ok = false;
    try {
      await stat(resolved);
      ok = true;
    } catch {
      ok = false;
    }
    if (!ok) {
      findings.push({
        code: "W004",
        file: "index.md",
        message: `index link target does not exist: ${href}`,
      });
    }
  }

  // The index links the `decisions/` and `work/` directories, so the map stops
  // at that depth unless each record inside them is checked too. A decision the
  // index never names is one an agent following the index will not read.
  for (const directory of ["decisions", "work"]) {
    if (!linkTargets.has(directory)) continue;
    let nested;
    try {
      nested = await readdir(path.join(notebookDir, directory), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of nested) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (linkTargets.has(`${directory}/${entry.name}`)) continue;
      findings.push({
        code: "W003",
        file: "index.md",
        message: `${directory}/${entry.name} is not linked from the index`,
      });
    }
  }
}

export async function checkNotebook(notebookDir) {
  const findings = [];

  let notebookEntries;
  try {
    notebookEntries = await stat(notebookDir);
  } catch {
    findings.push({ code: "E000", file: null, message: `no notebook at ${notebookDir}` });
    return findings;
  }
  if (!notebookEntries.isDirectory()) {
    findings.push({ code: "E000", file: null, message: `notebook path is not a directory: ${notebookDir}` });
    return findings;
  }

  await checkArtifacts(notebookDir, findings);
  await checkIndex(notebookDir, findings);

  const decisionsDir = path.join(notebookDir, "decisions");
  let entries;
  try {
    entries = await readdir(decisionsDir, { withFileTypes: true });
    entries.sort((a, b) => byName(a.name, b.name));
  } catch {
    entries = [];
  }

  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const fileMatch = entry.name.match(DECISION_FILE);
    const text = await readFile(path.join(decisionsDir, entry.name), "utf8");
    const matter = frontMatter(text);
    const idMatch = matter.match(FRONT_MATTER_ID);
    const statusMatch = matter.match(FRONT_MATTER_STATUS);
    const significanceMatch = matter.match(FRONT_MATTER_SIGNIFICANCE);
    const dateMatch = matter.match(FRONT_MATTER_DATE);
    const supersededByMatch = matter.match(FRONT_MATTER_SUPERSEDED_BY);
    const titleMatch = text.match(/^#\s+(.+)$/m);

    records.push({
      file: entry.name,
      fileId: fileMatch ? fileMatch[1] : null,
      id: idMatch ? idMatch[1] : null,
      numId: idMatch ? Number(idMatch[1]) : null,
      status: statusMatch ? statusMatch[1].toLowerCase() : null,
      significance: significanceMatch ? significanceMatch[1].toLowerCase() : null,
      date: dateMatch ? dateMatch[1] : null,
      supersededBy: supersededByMatch ? supersededByMatch[1] : null,
      numSupersededBy: supersededByMatch ? Number(supersededByMatch[1]) : null,
      title: titleMatch ? titleMatch[1].trim() : "",
      text,
    });
  }

  for (const record of records) {
    if (record.fileId === null) {
      findings.push({
        code: "E010",
        file: record.file,
        message: "decision filename must use a numeric prefix followed by a kebab-case slug",
      });
    }
    if (record.id === null) {
      findings.push({ code: "E006", file: record.file, message: "decision file has no numeric id in front matter" });
    }
    if (record.status === null) {
      findings.push({ code: "E011", file: record.file, message: "decision file has no status in front matter" });
    }
    if (record.significance === null) {
      findings.push({ code: "E012", file: record.file, message: "decision file has no significance in front matter" });
    }
    if (record.date === null) {
      findings.push({ code: "E013", file: record.file, message: "decision file has no date in front matter" });
    }
  }

  for (const record of records) {
    if (record.fileId !== null && record.id !== null && Number(record.fileId) !== Number(record.id)) {
      findings.push({
        code: "E002",
        file: record.file,
        message: `front-matter id ${record.id} does not match filename prefix ${record.fileId}`,
      });
    }
  }

  const byId = new Map();
  for (const record of records) {
    if (record.numId === null) continue;
    if (!byId.has(record.numId)) byId.set(record.numId, []);
    byId.get(record.numId).push(record.file);
  }
  for (const [id, files] of byId) {
    if (files.length > 1) {
      findings.push({
        code: "E001",
        file: files.join(", "),
        message: `id ${id} is declared by ${files.length} decision files`,
      });
    }
  }

  for (const record of records) {
    if (record.status !== null && !STATUSES.has(record.status)) {
      findings.push({ code: "E005", file: record.file, message: `invalid status "${record.status}"` });
    }
    if (record.significance !== null && !SIGNIFICANCES.has(record.significance)) {
      findings.push({
        code: "E014",
        file: record.file,
        message: `invalid significance "${record.significance}" (expected durable or architectural)`,
      });
    }
    if (record.date !== null && !validIsoDate(record.date)) {
      findings.push({
        code: "E015",
        file: record.file,
        message: `invalid date "${record.date}" (expected YYYY-MM-DD)`,
      });
    }
    for (const section of REQUIRED_DECISION_SECTIONS) {
      if (hasHeading(record.text, `## ${section}`)) continue;
      findings.push({
        code: "E016",
        file: record.file,
        message: `missing required decision section "## ${section}"`,
      });
    }
  }

  const idToRecord = new Map();
  for (const record of records) {
    if (record.numId !== null && !idToRecord.has(record.numId)) idToRecord.set(record.numId, record);
  }

  for (const record of records) {
    if (record.status === "superseded" && record.supersededBy === null) {
      findings.push({
        code: "E004",
        file: record.file,
        message: "record is marked superseded but declares no superseded_by",
      });
    }
    if (record.numSupersededBy === null) continue;
    const target = idToRecord.get(record.numSupersededBy);
    if (!target) {
      findings.push({
        code: "E003",
        file: record.file,
        message: `superseded_by ${record.supersededBy} points at a decision that does not exist`,
      });
      continue;
    }
    if (record.status === "accepted") {
      findings.push({
        code: "W001",
        file: record.file,
        message: `accepted record declares superseded_by ${record.supersededBy}`,
      });
    }
  }

  const uniqueIds = [...new Set(records.map((record) => record.numId).filter((id) => id !== null))].sort((a, b) => a - b);
  for (let index = 1; index < uniqueIds.length; index += 1) {
    if (uniqueIds[index] !== uniqueIds[index - 1] + 1) {
      findings.push({
        code: "W002",
        file: null,
        message: `id sequence jumps from ${uniqueIds[index - 1]} to ${uniqueIds[index]} (expected if a record was removed; ids are never reused)`,
      });
    }
  }

  findings.push(...(await staleCandidates(notebookDir, records)));
  return findings;
}

function byName(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "use", "using",
  "keep", "must", "should", "when", "are", "was", "were", "has", "have", "not",
  "but", "its", "their", "they", "them", "than", "then", "also", "only", "all",
  "any", "each", "per", "via", "onto", "over", "under", "after", "before",
]);

function significantTerms(text) {
  return [...new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  )];
}

async function staleCandidates(notebookDir, records) {
  const out = [];
  const truthFiles = ["system.md", "stack.md"];
  const truthText = {};
  for (const file of truthFiles) {
    try {
      truthText[file] = (await readFile(path.join(notebookDir, file), "utf8")).toLowerCase();
    } catch {
      truthText[file] = "";
    }
  }

  for (const record of records) {
    if (record.status !== "superseded") continue;
    const terms = significantTerms(record.title || "");
    for (const file of truthFiles) {
      const hits = terms.filter((term) => truthText[file].includes(term));
      if (hits.length > 0) {
        out.push({
          code: "S001",
          file: `${file} (candidate from ${record.file})`,
          message: `superseded decision "${record.title}" may still be described as current; terms found: ${hits.join(", ")}. Review whether ${file} reflects the superseding decision.`,
        });
      }
    }
  }
  return out;
}

export function summarize(findings) {
  const errors = findings.filter((finding) => finding.code.startsWith("E"));
  const warnings = findings.filter((finding) => finding.code.startsWith("W"));
  const stale = findings.filter((finding) => finding.code.startsWith("S"));
  return { errors, warnings, stale, ok: errors.length === 0 };
}

async function updateIndexLinks(notebookDir, renames) {
  if (renames.length === 0) return false;
  const indexPath = path.join(notebookDir, "index.md");
  let text;
  try {
    text = await readFile(indexPath, "utf8");
  } catch {
    return false;
  }

  const before = text;
  for (const { oldName, newName } of renames) {
    const oldHref = `decisions/${oldName}`;
    const newHref = `decisions/${newName}`;
    const linkRe = /(\]\()([^)]+)(\))/g;
    text = text.replace(linkRe, (match, prefix, href, suffix) => {
      const target = href.trim().replace(/#.*$/, "").replace(/^\.\//, "");
      if (target !== oldHref) return match;
      return `${prefix}${href.replace(oldHref, newHref)}${suffix}`;
    });
  }
  if (text === before) return false;

  const temporary = `${indexPath}.drawbore-fix.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, indexPath);
  return true;
}

export async function fixMechanical(notebookDir) {
  const decisionsDir = path.join(notebookDir, "decisions");
  let entries;
  try {
    entries = await readdir(decisionsDir, { withFileTypes: true });
  } catch {
    return { fixed: [], changed: false };
  }

  const files = entries
    .filter((entry) => entry.isFile() && DECISION_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort(byName);
  let nextId = files.reduce((highest, file) => {
    const id = Number(file.match(DECISION_FILE)?.[1] ?? 0);
    return Math.max(highest, id);
  }, 0) + 1;
  const nextAvailable = () => {
    const candidate = nextId;
    nextId += 1;
    return candidate;
  };

  const seen = new Map();
  const fixed = [];
  const renames = [];
  let changed = false;

  for (const file of files) {
    const full = path.join(decisionsDir, file);
    let text = await readFile(full, "utf8");
    const fileMatch = file.match(DECISION_FILE);
    const before = text;

    const idMatch = frontMatter(text).match(FRONT_MATTER_ID);
    if (idMatch && Number(idMatch[1]) !== Number(fileMatch[1])) {
      text = text.replace(/^id:\s*\d+\s*$/m, `id: ${fileMatch[1].padStart(idMatch[1].length, "0")}`);
      fixed.push({ code: "E002", file, message: `aligned id to filename prefix ${fileMatch[1]}` });
    }

    const numId = Number(frontMatter(text).match(FRONT_MATTER_ID)?.[1] ?? fileMatch[1]);
    let finalName = file;
    if (seen.has(numId) && seen.get(numId) !== file) {
      const newId = nextAvailable();
      // Preserve the existing filename padding width, allocating above the
      // highest existing ID so retired decision IDs are never reused.
      const widths = files.map((name) => name.match(DECISION_FILE)?.[1].length ?? 0);
      const width = Math.max(fileMatch[1].length, ...widths);
      const padded = String(newId).padStart(width, "0");
      text = text.replace(/^id:\s*\d+\s*$/m, `id: ${padded}`);
      finalName = `${padded}-${file.slice(fileMatch[1].length + 1)}`;
      renames.push({ oldName: file, newName: finalName });
      fixed.push({ code: "E001", file, message: `renumbered duplicate id ${numId} to ${newId} (renamed to ${finalName})` });
    } else if (!seen.has(numId)) {
      seen.set(numId, file);
    }

    if (text !== before || finalName !== file) {
      if (finalName !== file) {
        await writeFile(path.join(decisionsDir, finalName), text);
        await rm(full);
      } else {
        await writeFile(full, text);
      }
      changed = true;
    }
  }
  if (await updateIndexLinks(notebookDir, renames)) changed = true;
  return { fixed, changed };
}