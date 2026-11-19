# System Behavior

## Installer

- `drawbore init` — interactive (checkboxes) or flag-driven; installs skills to a harness location, creates `.drawbore/`, appends the Drawbore block to an instruction file, writes `.drawbore-install.json`. With no flags on a non-TTY stream it exits 2 and writes nothing: the interactive confirm is the gate, and a pipe cannot answer it. A file where a skill directory belongs is reported as a conflict, and nothing is installed.

## Update

- `drawbore update` — refreshes an existing install from the install marker: re-copies the package's skills (preserving locally modified ones), re-applies the instruction block, and refreshes the marker. It never creates a notebook and never prompts for locations.
- Flags: `--dry-run` (preview), `--check` (drift report; exit 1 when a skill is missing, foreign, a path conflict, or modified relative to the package), `--force` (replace skills owned by another package).
- `locations` and `instructions` are both read from the marker, so both are validated: `locations` against the supported set, `instructions` against containment inside the project. An entry outside the project is reported and exits 1 before anything is written.

## Uninstall

- `drawbore uninstall` — reverses an install: removes the skills the install owns, the Drawbore block from each recorded instruction file, and the install marker. It never removes a skill it does not own, and a skill with local modifications is kept whole and reported. The notebook survives unless `--purge` is passed. An instruction file the installer created from nothing is deleted with its block; one the developer already had keeps its content, decided by the `existedBefore` list the marker records at install. A marker without that field keeps the file rather than guessing. The `.gitignore` note is removed either way.
- Flags: `--dry-run` (preview), `--purge` (also delete `.drawbore/`).
- An instruction file that carries only one of the two drawbore markers is left untouched and reported, the same rule `init` follows when it refuses to guess.
- No install recorded in the project is reported and exits 1, matching `update`.

## Checker

- `drawbore check` — structural linter over `.drawbore/`; codes E000–E008 (errors), W001–W004 (warnings), S001 (stale); `--json`, `--strict`, `--fix`. `W003` covers the index map at two depths: top-level artifacts, and the records inside `decisions/` and `work/` once the index links those directories.

## Skills

- Seven portable skills: `discover`, `recall`, `frame`, `record`, `review`, `init-project`, `release`.

## Distribution

- npm package `drawbore`; CLI binary `drawbore`.

_Rewritten in place when behavior changes; decisions retain the history._