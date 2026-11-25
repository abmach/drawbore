---
id: 0010
status: accepted
significance: durable
date: 2026-11-25
---

# Record full and subset skill selections in the install marker

## Context

The install marker recorded the installed skill names per location but not whether a location followed the package's complete skill set or an explicit `--skills` selection. `drawbore update` treated every recorded set as fixed, so a full install never received a skill added by a later package version. The marker is also repository-tracked and hand-editable, so metadata that changes update behavior must be validated before mutation.

## Decision

The install marker records `skillSelectionByLocation`, mapping each installed harness location to `full` or `subset`. A `full` location follows the package's current complete skill set and receives skills added by later versions during `update`. A `subset` location keeps only its recorded skills, and `update` never widens it. A marker without the field keeps its recorded set and is not widened automatically.

The field is a trust boundary. Its keys must be supported harness locations that appear in the marker's `locations`, and its values must be `full` or `subset`. `init`, `update`, and `uninstall` reject malformed values with exit 1 before changing any file.

## Rationale

A full install that never receives new package skills contradicts the meaning of a full install, while silently widening an explicit subset violates the developer's selection. Recording the distinction makes both behaviors deterministic and preserves legacy markers conservatively. Decision 0003 requires every marker field that influences a destination to be validated before use.

## Alternatives considered

- Compare the recorded skill set with the package's complete set on every update — a package that removes a skill makes a previously full install look like an explicit subset.
- Widen every marker when the package adds a skill — would silently override an explicit `--skills` selection.
- Infer selection mode from the marker version and per-skill introduction versions — requires historical metadata for every skill and remains ambiguous when a package removes or renames skills.

## Consequences

- The install marker format gains `skillSelectionByLocation`; older markers remain valid and keep their recorded set.
- `drawbore update` installs newly shipped skills for full locations and preserves explicit subsets.
- Malformed selection metadata fails closed before any skill, instruction block, or removal is touched.
- `init` records `full` for a default install and `subset` for an explicit `--skills` install.
