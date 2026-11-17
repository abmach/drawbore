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

The installer asks which harness locations should receive the skills, whether to create `.drawbore/`, and which instruction file should carry the Drawbore block. In non-interactive environments, use explicit flags:

```sh
npx drawbore init --location .agents --notebook --instruction AGENTS.md --yes
```

### Supported locations

`.agents`, `.claude`, `.codex`, `.cursor`, `.omp`, `.opencode`

The instruction file is selected from `AGENTS.md` or `CLAUDE.md`.

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

`--check` reports every skill that is missing, foreign, or differs from the package.

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
```

## License

MIT