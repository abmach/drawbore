# Technical Choices

## Runtime

- Node >= 20, ESM (`"type": "module"`).

## Dependencies

- `@inquirer/prompts` — interactive prompts only.

## Architecture

- CLI entry (`bin/`) → installer/checker/prompts (`lib/`) → templates + skills (`templates/`, `skills/`).

## Testing

- `node --test` (node:test), 80 tests.

## CI

- GitLab CI (`.gitlab-ci.yml`) — `test` and `test-node20` jobs run the suite on branches, merge requests, and tags; `stage-npm` (tag-only, `needs: [test]`) does the npm staged publish via OIDC `id_tokens`. GitHub is a mirror (no CI, no tags).