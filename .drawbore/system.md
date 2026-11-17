# System Behavior

## Installer

- `drawbore init` — interactive (checkboxes) or flag-driven; installs skills to a harness location, creates `.drawbore/`, appends the Drawbore block to an instruction file, writes `.drawbore-install.json`.

## Checker

- `drawbore check` — structural linter over `.drawbore/`; codes E000–E008 (errors), W001–W004 (warnings), S001 (stale); `--json`, `--strict`, `--fix`.

## Skills

- Seven portable skills: `discover`, `recall`, `frame`, `record`, `review`, `init-project`, `release`.

## Distribution

- npm package `drawbore`; CLI binary `drawbore`.

## Update

- `drawbore update` — refreshes an existing install from the install marker: re-copies the package's skills (preserving locally modified ones), re-applies the instruction block, and refreshes the marker. It never creates a notebook and never prompts for locations.
- Flags: `--dry-run` (preview), `--check` (drift report; exit 1 when a skill is missing, foreign, a path conflict, or modified relative to the package), `--force` (replace skills owned by another package).

## Update

- `drawbore update` — refreshes an existing install from the install marker: re-copies the package's skills (preserving locally modified ones), re-applies the instruction block, and refreshes the marker. It never creates a notebook and never prompts for locations.
- Flags: `--dry-run` (preview), `--check` (drift report; exit 1 when a skill is missing, foreign, a path conflict, or modified relative to the package), `--force` (replace skills owned by another package).

_Rewritten in place when behavior changes; decisions retain the history._