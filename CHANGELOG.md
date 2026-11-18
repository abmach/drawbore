# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-11-17

### Removed

- `--global` is gone, along with user-level installs. `drawbore init`, `update`, and `uninstall` operate on the project only, and `--global` is rejected as an unknown option. The feature shipped in 0.3.0 and is removed here: one install path, maintained properly, beat two half-maintained ones.

### Fixed

- The `frame`, `recall`, and `record` skills now trigger on the notebook's presence instead of on an instruction file. `recall`'s trigger was "when a project's Drawbore instruction directs you", so in a project with a `.drawbore/` notebook that the running harness could not see — a `CLAUDE.md`-only project under OMP, or an `init --notebook` without `--instruction` — the post-work reconcile silently never ran.
- `init` and `update` no longer splice a CRLF instruction block into an LF instruction file (or the reverse). Mixed endings are invisible to `git diff` and ship in the tarball; the block and every newline the splice adds now follow the destination file.

### Changed

- The notebook gate on `frame`, `recall`, and `record` is stated once instead of twice. The description names `.drawbore/index.md` at the repository root as the trigger and adds only the clause that applies: `recall` notes the project is not initialized, while `frame` and `record` say not to create the notebook. The body keeps the full stop. With user-level installs gone, the only remaining case is a nested repository or a deleted notebook, and the old wording paid for it twice.

## [0.3.1] - 2026-11-17

### Fixed

- `drawbore init` no longer reports a harness location as "already installed" because a skills directory exists there. `.claude/skills` and its siblings often hold other tools' skills, and a stale install marker can outlive the directory it described; a location now counts as installed only when this package's own skills are on disk. Affected locations read "skills directory present, Drawbore not installed" instead.

### Changed

- The four skills that gate on a developer decision (`discover`, `recall`, `record`, `review`) now say how to ask: use the harness's structured question tool when one exists — a blocking prompt that cannot be skipped — otherwise plain text, and never treat the model's own restatement of the options as the answer. `frame`, `init-project`, and `release` keep prose, because they have no approval gate. `test/skills.test.js` pins the shared sentence.

## [0.3.0] - 2026-11-16

### Changed

- The `frame`, `recall`, and `record` skills state their notebook precondition twice: in the description, which an agent reads while choosing a skill, and in the first line of the body, which it reads once the skill is loaded. All three require `.drawbore/index.md` at the repository root and must not create it, so a skill installed globally stops in a project that never ran `drawbore init` instead of bootstrapping a notebook there.
- `test/skills.test.js` pins that contract: every skill must ship a single-line description free of `": "` (which would truncate the YAML scalar), the gated three must carry both clauses, and the ungated four must not claim the precondition.

### Added

- `drawbore uninstall` reverses an install in either scope: it removes the skills the install owns, the Drawbore block from each recorded instruction file, and the install marker. `--dry-run` previews, `--purge` also removes the `.drawbore/` notebook and the `.gitignore` note the installer added.
- `drawbore init --global` and `drawbore update --global` manage a user-level install. Every location has a user-level destination (`~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.omp/agent/skills`, `~/.config/opencode/skills`); the record goes to `~/.config/drawbore/install.json` (XDG-aware), and no notebook or instruction file is written.
- Uninstall never widens ownership: a skill with no Drawbore marker and no matching recorded hashes is reported and left alone, and a skill with local modifications is kept whole with a removal hint instead of being partially deleted.

## [0.2.1] - 2026-11-16

### Fixed

- `init` no longer deletes the content after an unclosed `<!-- drawbore:start -->` marker in an instruction file; the trailing lines are preserved and the block is inserted before them.
- `update` no longer writes outside the project root when the install marker names an unsupported location; it fails with a message instead of creating sibling directories.
- `update` respects the skill subset recorded by `init --skills` instead of silently installing the full set.
- `update` keeps the recorded `notebook` field in the install marker instead of nulling it.
- `update` prints the ownership-conflict message (with the `--force` hint) instead of a stack trace.
- `init --dry-run` prints a single `Would install:` header without the first-install hint; the `Installed:` header no longer leaks into dry-run output.
- `check --json --fix` emits one parseable JSON document with `fixed` and `changed` fields instead of two concatenated objects.
- `update --check` reports the full drift — missing, foreign, path-conflict, and modified skills — instead of only unowned `SKILL.md` divergence.
- `init` and `update` validate every destination before the first write, so a conflict in a later location no longer leaves an unrecorded partial install.

### Changed

- `formatInstallResult` lives only in `lib/prompts.js`, parameterized by `noun`/`firstInstall`; the CLI's private, drifted copy is gone.
- Unused APIs removed: the never-wired spinner (`createSpinner`, `startSpinner`), the `replaceExisting` install option, and the internal `hasSkillMarker` helper.
- CI: the suite runs on branches, merge requests, and tags on Node 24 and Node 20; the publish job `needs: [test]` and pins `npm@^11.15`.
- Bare `drawbore` prints the full help; unknown commands print `Unknown command: <cmd>`.

## [0.2.0] - 2026-11-16

Published to npm as `drawbore@0.2.0` — staged via GitLab CI, maintainer approved with 2FA.

### Changed

- **Breaking:** `drawbore init --replace-skills` is removed. Use the new `drawbore update` command to refresh an existing install; it re-copies the package's skills while preserving locally-modified ones. Scripts calling `init --replace-skills` must switch to `update`.

### Added

- `drawbore update` — refreshes an existing install: re-copies skills (preserving local edits), re-applies the instruction block, and refreshes the install marker. Supports `--dry-run`, `--check` (drift report, exit 1 on divergence), and `--force` (ownership conflicts). Requires an existing install; run `drawbore init` first.

## [0.1.2] - 2026-11-16

### Fixed

- `check --fix` renumbers a duplicate decision id to the widest existing filename prefix, so `1-dup.md` next to `0007-other.md` becomes `0002-dup.md`, not `2-dup.md`.
- `isForeignSkill` reads a skill's marker once instead of twice per skill.
- A principle whose `Source:` note wraps onto a continuation line is recognized instead of reported as missing one.
- `--version` and `--help` respect the invoked command: `check --help` prints check usage.

### Added

- `init --dry-run` prints the install plan without writing anything.
- `init` documents `.drawbore/`'s tracked-by-default status in `.gitignore`, with the sanctioned path for keeping it local instead.
- The TTY location prompt says to select none to skip, matching the non-TTY fallback.

## [0.1.1] - 2026-11-16

Published to npm as `drawbore@0.1.1` — the first release through the staged-publish pipeline (GitLab CI staged, maintainer approved with 2FA).

### Fixed

- `drawbore init` with no flags now runs the interactive installer: checkbox prompts for harness locations, notebook creation, instruction files, and a final confirmation. The prompt layer existed in `lib/prompts.js` but was never wired into the CLI, so a bare `init` silently installed hardcoded defaults. Non-TTY streams (CI, pipes) still use the defaults without prompting.

## [0.1.0] - 2026-11-16

Published to npm as `drawbore@0.1.0` (bootstrap publish; the first staged release is next).

### Added

- Consent-aware installer for `.agents`, `.claude`, `.codex`, `.cursor`, `.omp`, and `.opencode`.
- `.drawbore/` notebook templates and a structural checker.
- `drawbore init` and `drawbore check` CLI commands.
- Seven portable skills: `discover`, `recall`, `frame`, `record`, `review`, `init-project`, and `release`.
- `init-project` generates a release pipeline from the project's answers — publish mode, build steps, and provider — instead of copying a template, and records the result in the root `AGENTS.md` under `publish mode` and `pipeline`.

### Changed

- Skill conflicts are decided by content rather than by name. A skill directory is foreign only when its contents diverge from what the package ships; a file/directory mismatch is preserved instead of blocking the install.
- `release` branches on `publish mode` and `pipeline`, reading them from `AGENTS.md`. Sections written before those fields existed are still handled: the mode is inferred from the prose and the CI file, and the package field is read as either `package` or `npm package`.

[0.4.0]: https://gitlab.com/abmach/drawbore/-/compare/v0.3.1...v0.4.0
[0.3.1]: https://gitlab.com/abmach/drawbore/-/compare/v0.3.0...v0.3.1
[0.3.0]: https://gitlab.com/abmach/drawbore/-/compare/v0.2.1...v0.3.0
[0.2.1]: https://gitlab.com/abmach/drawbore/-/compare/v0.2.0...v0.2.1
[0.2.0]: https://gitlab.com/abmach/drawbore/-/compare/v0.1.2...v0.2.0
[0.1.2]: https://gitlab.com/abmach/drawbore/-/compare/v0.1.1...v0.1.2
[0.1.1]: https://gitlab.com/abmach/drawbore/-/compare/v0.1.0...v0.1.1