# Drawbore

[![GitLab pipeline](https://gitlab.com/abmach/drawbore/badges/main/pipeline.svg)](https://gitlab.com/abmach/drawbore/-/pipelines)

**You code. It holds.**

Durable context for AI-assisted software development.

Drawbore adds repository-aware context, engineering rules, and portable agent workflows on top of the repository and harness you already use. It adapts to the project rather than replacing the agent, the harness, or the repository’s own structure.

## Status

The installer, notebook templates, structural checker, and portable skills are implemented.

## What it provides

- **Durable context** — a `.drawbore/` containing purpose, scope, architecture, glossary, principles, decisions, current behavior, and technical choices.
- **Portable skills** — `discover`, `recall`, `frame`, `record`, `review`, `init-project`, and `release`.
- **Structural checks** — duplicate decision IDs, broken supersession, invalid records, missing headings, and stale-candidate warnings.
- **Consent-aware installation** — no file is overwritten without an explicit choice; locally modified skills are preserved.
- **Reversible installs** — `uninstall` removes the skills the install owns; skills with local edits are kept and reported rather than deleted.
- **Provider-neutral operation** — no forge, registry, or CI provider is assumed.

## Install

```sh
npx drawbore init
```

The installer asks which harness locations should receive the skills, whether to create `.drawbore/`, and which instruction file should carry the Drawbore block. When stdin is not a terminal — a pipe, a CI job — it refuses rather than guessing, so pass explicit flags there:

```sh
npx drawbore init --location .agents --notebook --instruction AGENTS.md --yes
```

### Requirements

Node >= 22.22.2 (ESM). Drawbore's only runtime dependency is `@inquirer/prompts`, whose own floor is `^22.22.2 || ^24.15.0 || >=26.0.0`.

Which `@inquirer/prompts` you get depends on how you install Drawbore:

| Install | Resolved version | Why |
|---|---|---|
| this repository (`npm ci`) | 8.8.0, from `package-lock.json` | the lockfile pins it; `npm ci` reports `EBADENGINE` rather than failing on an older Node |
| `npm install drawbore` / `npx drawbore` | engine-matched: the newest `@inquirer/prompts` version whose own `engines` range supports the runtime | npm filters by `engines` when no lockfile pins the version |

The lockfile is not shipped, so a consumer's resolution is engine-aware even where this repository's is not. The repository and the locked dependency now share the same >= 22.22.2 floor. If you need a reproducible dependency tree, install into a project and commit its lockfile.

### Supported locations

`.agents`, `.claude`, `.codex`, `.cursor`, `.omp`, `.opencode`

The instruction file is selected from `AGENTS.md` or `CLAUDE.md`.

### Explicit init options

`init` accepts these explicit options in any order. Repeat `--location` and `--instruction` to select more than one value; each option that takes a list also accepts a comma-separated list.

| Option | Effect | Default |
|---|---|---|
| `--location <dir>` | Installs skills under `<dir>/skills`. Repeatable. Supported directories: `.agents`, `.claude`, `.codex`, `.cursor`, `.omp`, `.opencode`. | `.agents` |
| `--notebook` | Creates or refreshes the `.drawbore/` notebook templates. | enabled |
| `--no-notebook` | Does not create or refresh the `.drawbore/` notebook templates. | disabled |
| `--instruction <file>` | Adds the Drawbore block to `AGENTS.md` or `CLAUDE.md`. Repeatable. | the instruction file associated with each selected location (`.claude` uses `CLAUDE.md`; the other locations use `AGENTS.md`) |
| `--no-instruction` | Does not add the Drawbore block to any instruction file. | disabled |
| `--skills <list>` | Installs only the named skills. Comma-separated; unknown names are rejected. | all Drawbore skills |
| `--force` | Replaces a skill directory owned by another package. Locally modified files inside an owned skill are still preserved. | disabled |
| `--yes` | Accepts defaults without prompting. Explicit flags remain authoritative; this option does not authorize unrelated actions. | no effect beyond accepting defaults |
| `--dry-run` | Prints the install plan without writing files. | disabled |

The defaults when explicit options are supplied are: install into `.agents`, create the `.drawbore/` notebook, and update the default instruction file for each selected location. The `--skills` option installs only its named subset and does not select additional locations.

Running `init` again adds the new locations, instruction files, and skills to the existing install marker instead of replacing them. The marker therefore keeps every installed location reversible through one later `drawbore uninstall`.

### Install marker fields

Drawbore writes `.drawbore-install.json` at the project root. The file is repository-tracked, hand-editable, and used by `update` and `uninstall` to identify the installation.

| Field | Type | Meaning |
|---|---|---|
| `version` | string | Drawbore package version that wrote the marker. |
| `installedAt` | string | ISO 8601 timestamp of the install or refresh that wrote the marker. |
| `namespace` | string | Ownership namespace for the installed skills; Drawbore uses `drawbore`. |
| `skills` | string array | Names of the skills selected for this installation. An older marker without this field is treated as selecting the full current skill set. |
| `skillsByLocation` | object | Maps each harness location in `locations` to the skill names installed there. `update` and `uninstall` use this map so a later `init` with a different skill subset cannot widen or narrow the ownership recorded for an earlier location. |
| `locations` | string array | Harness directories containing the installed skills. Each value must be one of `.agents`, `.claude`, `.codex`, `.cursor`, `.omp`, `.opencode`. |
| `notebook` | string or `null` | The notebook directory when this installation created or refreshed it, or `null` when the installation did not manage a notebook. Drawbore uses `.drawbore`. |
| `instructions` | string array | Instruction files that received the Drawbore block. Each value must be `AGENTS.md` or `CLAUDE.md`. |
| `existedBefore` | string array | Subset of `instructions` whose files already existed before Drawbore modified them. `uninstall` removes the block but keeps these files; files created by Drawbore are removed with the block. |
| `skillHashes` | object | SHA-256 hashes of the installed skill files, keyed first by location and then by the file path relative to that location directory (for example `.omp` → `skills/record/SKILL.md`). These hashes identify pristine installed content so a refresh can preserve local edits and uninstall can identify ownership. |

## Uninstall

```sh
npx drawbore uninstall
npx drawbore uninstall --dry-run
npx drawbore uninstall --purge
```

`uninstall` removes the skills the install owns, the Drawbore block from each recorded instruction file, and the install marker. It never removes a skill it does not own, and a skill with local modifications is kept whole and reported. `.drawbore/` survives unless `--purge` is passed, because the notebook is curated developer content.

## Check the notebook

```sh
npx drawbore check
npx drawbore check --json
npx drawbore check --fix
```

`check` is read-only unless `--fix` is passed. `--fix` only aligns decision IDs to filenames and renumbers duplicates; it never rewrites record bodies.

## Refresh an existing install

```sh
npx drawbore update
```

`update` re-copies the package's skills into the locations recorded in `.drawbore-install.json` — preserving locally modified files, same rules as `init` — re-applies the Drawbore block to the recorded instruction files, and refreshes the marker. It never creates a notebook and never prompts for locations; it works from the existing install marker.

```sh
npx drawbore update --dry-run   # print what would change without writing
npx drawbore update --check     # drift report only; exit 1 if the install differs
npx drawbore update --force     # replace skills owned by another package
```

`--check` reports every skill that is missing, foreign, or differs from the package. `--force` replaces a foreign skill directory; it does not discard local edits inside an owned skill.

## Skills

| Skill | Role |
|---|---|
| `discover` | Analyze an existing repository and propose its initial durable context |
| `recall` | Consult durable context before work and reconcile the implementation afterward |
| `frame` | Shape scope and maintain a Change Brief before implementation |
| `record` | Record confirmed terms, principles, decisions, behavior, and technical choices |
| `review` | Analyze a repository and propose a ranked plan, then implement only the approved items |
| `init-project` | Scaffold a provider-neutral project, including its release pipeline |
| `release` | Run a provider-neutral release flow |

## Repository

This repository is canonical on GitLab. GitHub is a read-only distribution mirror: issues and releases live on GitLab.

## Development

```sh
npm install
npm test
npm run check
```

`npm run check` runs the repository's strict notebook check; warnings fail the command.

## License

MIT