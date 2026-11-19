# Technical Choices

## Runtime

- Node >= 22.13, ESM (`"type": "module"`). The floor is the resolved `@inquirer/prompts` 8.8.0 engine range (`^22.22.2 || ^24.15.0 || >=26.0.0`), not a preference: a lower floor would install a dependency that declares the runtime unsupported.

## Dependencies

- `@inquirer/prompts` — interactive prompts only.

## Architecture

- CLI entry (`bin/`) → installer/checker/prompts (`lib/`) → templates + skills (`templates/`, `skills/`).

## Testing

- `node --test` (node:test), 87 tests.

## CI

- GitLab CI (`.gitlab-ci.yml`) — `test` (Node 24) and `test-node22` run the suite on branches, merge requests, and tags; `stage-npm` (tag-only, `needs: [test]`) does the npm staged publish via OIDC `id_tokens`. GitHub is a mirror (no CI, no tags).

## Dependency resolution

- The lockfile pins `@inquirer/prompts` 8.8.0, which requires Node >= 22.22; `npm ci` installs it on any line and reports `EBADENGINE` rather than failing, so the manifest floor and the locked floor must move together. The lockfile is not shipped (`package.json` `files`), so this constraint binds the repository, not consumers.
- A consumer without a lockfile resolves `^8.7.5` engine-compatibly: Node 20 picks 8.7.5 (`^20.17.0`), Node 22+ picks 8.8.0. Verified by installing `drawbore@0.5.1` under each runtime. This is why the manifest floor can sit at 22.13 while a Node 20 user still gets a working tree — but that user is outside the range this project tests.