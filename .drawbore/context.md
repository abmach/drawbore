# Project Context

## Purpose

Durable, curated project context for AI-assisted software development. Drawbore keeps a repository's purpose, principles, decisions, current behavior, and technical choices in one place, and installs portable skills into the agent harness so work consults and reconciles that context.

## Scope

- Durable context (`.drawbore/`), portable skills, structural checks, consent-aware installation, provider-neutral operation.
- No forge, registry, or CI provider assumptions; no language-specific build setups; no lock-in to one agent harness.

## Architecture and relationships

- **`bin/drawbore.js`** — CLI: `init` (interactive or flags, `--global` for a user-level install), `update` (`--dry-run`, `--check`, `--force`, `--global`), `check` (`--json`, `--strict`, `--fix`), and `uninstall` (`--global`, `--dry-run`, `--purge`). Project and user-level scopes share one installer; each scope has its own marker and is refreshed and removed independently.
- **`lib/installer.js`** — skill copying, conflict detection by content, notebook creation, instruction-block insertion, install marker.
- **`lib/checker.js`** — structural linter over `.drawbore/` records.
- **`lib/prompts.js`** — interactive UI (checkbox prompts, readline fallback, spinner).
- **`templates/`** — notebook and instruction templates shipped to consumers.
- **`skills/`** — seven portable skills shipped to consumers.