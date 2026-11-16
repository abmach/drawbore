# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-16

### Added

- Consent-aware installer for `.agents`, `.claude`, `.codex`, `.cursor`, `.omp`, and `.opencode`.
- `.drawbore/` notebook templates and a structural checker.
- `drawbore init` and `drawbore check` CLI commands.
- Seven portable skills: `discover`, `recall`, `frame`, `record`, `review`, `init-project`, and `release`.
- `init-project` generates a release pipeline from the project's answers — publish mode, build steps, and provider — instead of copying a template, and records the result in the root `AGENTS.md` under `publish mode` and `pipeline`.

### Changed

- Skill conflicts are decided by content rather than by name. A skill directory is foreign only when its contents diverge from what the package ships; a file/directory mismatch is preserved instead of blocking the install.
- `release` branches on `publish mode` and `pipeline`, reading them from `AGENTS.md`. Sections written before those fields existed are still handled: the mode is inferred from the prose and the CI file, and the package field is read as either `package` or `npm package`.