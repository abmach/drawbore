# Technical Choices

## Runtime

- Node >= 22.22.2, ESM (`"type": "module"`). The floor matches the resolved `@inquirer/prompts` 8.8.0 engine range (`^22.22.2 || ^24.15.0 || >=26.0.0`), not a preference: a lower floor would install a dependency that declares the runtime unsupported.

## Dependencies

- `@inquirer/prompts` — interactive prompts only.

## Architecture

- CLI entry (`bin/`) → installer/checker/prompts (`lib/`) → templates + skills (`templates/`, `skills/`).

## Testing

- `node --test` (node:test) across `test/*.test.js`.

## CI

- GitLab CI (`.gitlab-ci.yml`) — `test` (Node 24) and `test-node22` (pinned to Node 22.22.2) run the suite and the strict notebook check on branches, merge requests, and tags; `stage-npm` (tag-only, `needs: [test, test-node22]`) installs npm CLI 11.21.3 and stages the npm release via OIDC `id_tokens`. The job fails when the manifest version is already published. GitHub is a read-only distribution mirror that currently carries tags through v0.8.2 but has no CI workflow; GitLab remains canonical and owns release CI.

## Dependency resolution

- The lockfile pins `@inquirer/prompts` 8.8.0, which requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`; `npm ci` installs it on any line and reports `EBADENGINE` rather than failing, so the manifest floor and the locked floor must move together. The lockfile is not shipped (`package.json` `files`), so this constraint binds the repository, not consumers.
- A consumer without a lockfile resolves `^8.7.5` engine-compatibly: npm selects the newest version whose own `engines` range supports the runtime (8.8.0 requires `^22.22.2 || ^24.15.0 || >=26.0.0`; 8.7.5 supports older compatible Node lines). Verified by installing `drawbore@0.5.1` under each runtime. The repository's manifest floor is 22.22.2, matching the locked dependency's Node 22 floor; the broader consumer-resolution behavior remains engine-aware because the lockfile is not shipped.