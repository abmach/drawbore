---
id: 0001
status: accepted
significance: durable
date: 2026-11-16
---

# Staged npm publish via GitLab CI

## Context

The package needed a publish pipeline that keeps a human in the loop before a version goes public.

## Decision

Tag push → GitLab CI runs `npm test`, then `npm stage publish` via OIDC `id_tokens`. A maintainer approves the staged version with 2FA.

## Rationale

Human approval before public release. Marked inferred: the exact discussion is not recorded; the rationale is inferred from the CI setup and `AGENTS.md`.

## Alternatives considered

- Direct publish from CI — no human gate; not chosen.
- Local publish only — no provenance, no pipeline; not chosen.

## Consequences

- Every release requires a maintainer with 2FA to approve.
- The first stage after a brand-new package bootstraps the trusted-publisher config.