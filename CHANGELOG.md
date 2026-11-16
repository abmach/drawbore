# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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