---
id: 0007
status: accepted
significance: durable
date: 2026-11-24
---

# Harness locations use canonical containment before mutation

## Context

The supported harness locations are mutable filesystem destinations. Before this decision, Drawbore checked only whether a location was a file; a symlink or Windows junction from a supported location to a directory outside the repository was treated as an ordinary directory. `init` copied skills through that link, and `uninstall` removed the copied content and could prune the linked directory. Instruction files already used canonical containment, but harness locations did not.

## Decision

Before `init`, `update`, or `uninstall` writes to or removes content from a harness location, Drawbore resolves the location and its existing ancestors canonically. The canonical target must remain inside the canonical project root. A location that resolves outside the project is reported with exit 1 before any skill is copied, removed, or pruned.

## Rationale

A supported location name does not guarantee that the path still names content inside the project. The marker is only one source of destinations; a symlink already present in the repository can redirect ordinary location paths. Applying the same canonical containment rule to locations and instruction files closes the gap without adding a second filesystem policy.

## Alternatives considered

- Reject every symlinked harness location, including one that resolves inside the project — this would forbid a destination the canonical containment rule can prove safe.
- Trust the supported location name and use lexical containment only — lexical containment does not detect a junction or symlink to an external target.
- Validate locations only during `init` — `update` and `uninstall` read the same destinations from the marker and would remain exposed.

## Consequences

- `init`, `update`, and `uninstall` refuse a harness location whose canonical target resolves outside the repository and touch no content through it.
- Existing installations whose locations resolve inside the project keep working.
- The marker format is unchanged; containment is enforced independently of marker contents.
- Other mutable destinations introduced later must use the same canonical containment rule.
