---
name: review
description: Full read-only analysis of the working repository with a prioritized enhancement proposal, plus an approval-gated implementation phase — shape and stack, architecture and entry points, correctness and risk, hygiene and conventions, dependency and CI health, docs, and repository-specific convention drift. Use when asked to analyze, audit, review, assess, or improve a repo, codebase, or project, including "what should we improve", "review this project", "propose enhancements", "audit then fix", and post-change sanity audits. Analysis never edits; implementation runs only after explicit approval of a numbered plan.
---

# Repository review (analysis + gated implementation)

Two phases. Phase 1 produces **one report** and never edits anything. Phase 2 runs only after the user approves specific numbered items, and only those.

## Rules

- **Evidence or nothing.** A finding without `path:line`, a file list, or a command's output is `[INFERENCE]` — it goes in the `Unverified` section, never in the ranked list.
- **Report what is there.** Missing files are findings only when a convention the repository itself declares requires them; do not grade the repo against an imagined ideal.
- **Read the repo's own checks before judging them.** Manifest scripts, `Makefile`, `justfile`, CI configuration, and lint rules are evidence of intent.
- **Rank, don't dump.** Order by `(impact × confidence) / effort`. A 30-item flat list is a failed audit.
- **Phase 1 ends at the report.** One question, at the end: what to implement.
- **Phase 2 is narrow.** Approved items only, in the approved order. No opportunistic cleanup, no adjacent refactor, no reformatting of touched files.

## Phase 1 — analysis

### 1. Shape

Confirm the workspace is the repository (resolve its root with the version-control tool the project uses), inspect working-tree state and recent history, and read the remotes. Then map it: read the root directory (one level), read the manifests (`package.json`, `Cargo.toml`, `pyproject.toml`, `*.csproj`, `go.mod`, `pom.xml`, …), and check for build, task-runner, and CI files. Note language, package manager, lockfile, entry points, test runner, linter, and CI provider. Record size per area with `find`/`xargs wc -l` when the tree is big enough to matter.

### 2. Architecture

Identify entry points and follow them: `main`/`index`/CLI parsers, HTTP handlers, exported public API. Then the dependency direction between modules — one `mermaid` block, only if there is genuine structure (layering, cross-cutting imports, a plugin boundary). Note cycles, layering violations, god files (> ~500 LOC), duplicated logic, and dead code. For dead code, use a language server's `references` on the symbol when one is configured; a text grep for a rename-class claim silently drops dynamic callsites.

### 3. Correctness and risk

Swallowed exceptions, empty `catch`, `any`/unchecked casts, and a `TODO`/`FIXME`/`HACK`/`XXX` inventory with locations. Unawaited promises, unlocked shared state, leaked handles, unvalidated input at trust boundaries. Then the things that page someone at 3am: missing timeouts, unbounded loops, unindexed queries, non-idempotent retries.

### 4. Hygiene and conventions

Tracked build output, secrets, `.env`, key material; ignore-file gaps; line endings; inconsistent naming or formatting within one tree; stray debug logging; version stamps that disagree across files (manifest vs changelog vs header comments).

Audit line endings against the blobs, not the worktree. `git ls-files --eol` prints `i/<index>  w/<worktree>  attr/<attributes>` and then a **tab** before the path, so split on tab — default whitespace splitting shreds `attr/text=auto eol=lf` into two fields and yields a bogus path. `i/crlf` means CR bytes are in the index or commit; no `eol=lf` fixes that on its own and `git diff` never shows it. Confirm each hit with `git cat-file blob :<path> | tr -cd '\r' | wc -c` — a nonzero count is the finding. Report every affected path with its count, and note the repair is a separate normalization commit (`git add --renormalize -- <paths>`), never a history rewrite. A clean `git status` is not evidence: git compares after the clean filter, so a CR-only difference reads as unmodified.

If the repository declares its own conventions (a root `AGENTS.md` or contributor guide, a documented release process, a required file layout), check the repository against them explicitly — that is the highest-yield pass. Compare declarations with reality and report every disagreement as a finding.

### 5. Dependencies and CI

Run the project's audit command (`npm audit`, `bun audit`, `cargo audit`, or the ecosystem equivalent; report advisories, never fix silently), note majors behind current, duplicated functionality across dependencies, dependencies never imported, and install scripts. For CI: read the pipeline definition, confirm every `needs`/stage edge is real, check that the pipeline runs on the branches and tags the project actually uses, and that the README badge URL matches the project path.

### 6. Security

If the harness exposes a security-scan or vulnerability-discovery tool, offer it as a **follow-up**, not a pass here — it has its own review flow and is opt-in. Run discovery, then validate each candidate before calling it real; report unvalidated candidates as leads. If no such tool is available, say so and list manual checks worth doing (dependency advisories, secret scanning, permission boundaries).

### 7. Docs

Does `README.md` answer what/why/install/use for a newcomer? Is `CHANGELOG.md` current against the latest tag? Does the contributor or agent guidance file match reality? License present and current-year?

### 8. Report

Lead with a 3–5 line verdict: what the repo is, its strongest and weakest aspect. Then, in order:

1. **Shape** — one paragraph, no restating the tree.
2. **Findings** — grouped by severity (`Blocker`, `Should fix`, `Nice to have`). Each carries a **stable id** (`F1`, `F2`, …), in this exact order: claim, evidence (`path:line` or command output), why it matters, concrete fix, effort (`S`/`M`/`L`).
3. **Comparison table** — id / finding / severity / area / effort / confidence.
4. **Proposed order of work** — 3–5 numbered steps referencing those ids, highest ratio first, each with a verifiable done-condition.
5. **Unverified** — `[INFERENCE]` items and what check would settle each.

End with exactly one question:

> Which items should I implement? Reply with ids or step numbers (e.g. `F1, F4` or `do step 2`). Anything not named stays untouched.

Then stop. Do not start implementing from a vague "yes" or "go ahead" — that authorizes nothing specific.

## Phase 2 — approval-gated implementation

Enter only on an explicit selection of ids or step numbers.

### 2.1 Confirm the scope, in writing

Before the first edit, restate the selected ids with: files each will touch, the change in one line, the done-condition, and the verification command. Then require an explicit confirmation naming that scope. A single "yes" to the phase-1 question is not this confirmation.

Gate on the developer's answer with the harness's structured question tool when one is available — a blocking prompt that cannot be skipped — otherwise ask in plain text and stop until they answer. Never treat your own restatement of the options as the answer, and keep a free-text path for answers the options do not cover.

### 2.2 Baseline first

Run the verification command **before** editing, and record the output. A verification step is worthless if it was already failing, and a red baseline tells you the repo was broken before you arrived — report that rather than attributing it to your change.

### 2.3 Implement in plan order

One id at a time, in the approved order. Each item:

1. Read the target code; check references for any exported symbol before renaming.
2. Make the change.
3. Run the done-condition check.
4. Report `id — done | failed: <output>`. Then next id.

If an item turns out to be wrong, larger than stated, or to require touching files outside its declared scope: **stop, report, ask.** Do not widen the change to keep momentum.

### 2.4 Final verification

Re-run the repository's own checks once, after all items: build, tests, lint. Fix only failures your changes caused — a pre-existing failure goes in the report, not into a drive-by fix.

### 2.5 Close out

Report what changed (id → file → what), what verification proved, and what was left undone. Update docs or changelog if the change is user-visible.

## Boundaries that never move

- **No commits, no pushes, no tags, no version bumps** in either phase unless the user explicitly asks for that step. Phase 2 authorizes edits only.
- **No dependency changes** unless the user named the item as a dependency change.
- **No touching unrelated code**, however tempting. "I fixed a typo nearby" turns an approved change into an unapproved diff.
- **Nothing outside the repository** unless the user explicitly authorizes it: harness configuration, global tool configuration, system installs.
- **Items the user did not select are not implemented.** Not partially, not "while I was there".

## Large repositories

If the harness offers session checkpoints or a rewind mechanism, snapshot before exploration and keep only the report. Delegate independent areas (build, tests, dependencies, CI, docs) as parallel read-only subagents in one dispatch when a single pass would be shallow; per-area finders return evidence, not prose. You keep the synthesis, the prioritization, and phase 2.

## Anti-patterns

- Formatting nits as findings. Mention once, in aggregate.
- Proposing a framework or rewrite without naming what it buys over the current design.
- Findings the repo already documents as intentional (search the docs first).
- Running builds or test suites during phase 1 unless a finding requires it; an audit observes, it does not verify work.
- Editing anything in phase 1. The moment you fix a typo, it is not an audit.
- Treating "yes, implement" as approval for all findings. It is approval for the ones you listed.