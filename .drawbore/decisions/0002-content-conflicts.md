---
id: 0002
status: accepted
significance: durable
date: 2026-11-14
---

# Consent-aware skill conflict policy

## Context

The installer had to decide what to do when a skill directory already exists at the target location.

## Decision

A skill directory is foreign only when its content diverges from the package. A file/directory mismatch is preserved, not blocked. Overwrite requires `--force`.

## Rationale

Protects user files while still installing cleanly. Source: commit `7044613`, `isForeignSkill` and its tests.

## Alternatives considered

- Name-only conflict detection — would preserve stale hand-copied skills; not chosen.
- Always overwrite — would destroy user edits; not chosen.

## Consequences

- A locally modified skill survives a rerun and an `update`.
- Refreshing an existing install is `drawbore update`, which re-copies skills while preserving local edits; `--force` handles ownership conflicts.