# System Behavior

## Installer

- `drawbore init` — interactive (checkboxes) or flag-driven; installs skills to a harness location, creates `.drawbore/`, appends the Drawbore block to an instruction file, writes `.drawbore-install.json`.

## Checker

- `drawbore check` — structural linter over `.drawbore/`; codes E000–E008 (errors), W001–W004 (warnings), S001 (stale); `--json`, `--strict`, `--fix`.

## Skills

- Seven portable skills: `discover`, `recall`, `frame`, `record`, `review`, `init-project`, `release`.

## Distribution

- npm package `drawbore`; CLI binary `drawbore`.

_Rewritten in place when behavior changes; decisions retain the history._