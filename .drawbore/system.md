# System Behavior

## Installer

- `drawbore init` — interactive (checkboxes) or flag-driven; installs skills to a harness location, creates `.drawbore/`, appends the Drawbore block to an instruction file, writes `.drawbore-install.json`.
- `drawbore init --global --location <dir>` — installs into a user-level skill directory instead of a project: skills only, no notebook, no instruction file, no `.gitignore` note. Requires `--location`. Destinations are `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.omp/agent/skills` (profile-aware), and `~/.config/opencode/skills`; the record is written to `~/.config/drawbore/install.json` (`$XDG_CONFIG_HOME` when set).

## Update

- `drawbore update` — refreshes an existing install from the install marker: re-copies the package's skills (preserving locally modified ones), re-applies the instruction block, and refreshes the marker. It never creates a notebook and never prompts for locations.
- Flags: `--dry-run` (preview), `--check` (drift report; exit 1 when a skill is missing, foreign, a path conflict, or modified relative to the package), `--force` (replace skills owned by another package), `--global` (refresh the user-level install instead of the project install).

## Uninstall

- `drawbore uninstall` — reverses an install: removes the skills the install owns, the Drawbore block from each recorded instruction file, and the install marker. It never removes a skill it does not own, and a skill with local modifications is kept whole and reported. The notebook survives unless `--purge` is passed, which also removes the `.gitignore` note the installer added. An instruction file left empty by the removal is deleted; one that existed beforehand keeps its content.
- Flags: `--global` (the user-level install), `--dry-run` (preview), `--purge` (also delete `.drawbore/`).
- An instruction file that carries only one of the two drawbore markers is left untouched and reported, the same rule `init` follows when it refuses to guess.
- No install recorded in the selected scope is reported and exits 1, matching `update`.

## Checker

- `drawbore check` — structural linter over `.drawbore/`; codes E000–E008 (errors), W001–W004 (warnings), S001 (stale); `--json`, `--strict`, `--fix`.

## Skills

- Seven portable skills: `discover`, `recall`, `frame`, `record`, `review`, `init-project`, `release`.

## Distribution

- npm package `drawbore`; CLI binary `drawbore`.

_Rewritten in place when behavior changes; decisions retain the history._