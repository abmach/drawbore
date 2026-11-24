---
id: 0003
status: accepted
significance: durable
date: 2026-11-19
---

# The install marker is a trust boundary for both locations and instructions

## Context

`.drawbore-install.json` is repository-tracked and hand-editable, and it names the
destinations a later `update` and `uninstall` write to. `locations` were validated
against the supported set, but `instructions` were passed straight to the
filesystem: an entry such as `../outside/AGENTS.md` made `update` append the
Drawbore block to a file outside the working tree, and made `uninstall` delete that
file outright when the block was its whole content.

## Decision

Every marker field that names a filesystem destination is validated before the
first write. `locations` must be in the supported set; `instructions` entries must
be `AGENTS.md` or `CLAUDE.md` and resolve inside the project root; recorded skill
names must be members of the package's current skill set. A violation is reported
with exit 1, before any skill is copied, any block is spliced, or any file is
removed.

## Rationale

A path that only one of the two commands checks is a hole in the other, and the
destructive direction is `uninstall`: it deletes. Validating in one place
(`assertMarkerInstructions`, called by both commands) keeps the two from drifting
apart again. Source: commits `0a38e35` (the vulnerable state) and the fix in
`chore(release): v0.5.2`.

## Alternatives considered

- Validate in each command separately — the two lists would drift, which is how
  `instructions` came to be unchecked while `locations` were not.
- Treat the marker as trusted because it is tracked — it is tracked *and*
  hand-editable; a clone or fork owns the file, not just the original author.
- Normalise paths instead of rejecting them — `../outside/AGENTS.md` inside the
  root has no legitimate meaning, so rejection is the honest signal.

## Consequences

- `update` and `uninstall` both refuse an out-of-root instruction entry, exit 1,
  and touch nothing.
- Unsupported instruction files and skill names are rejected before mutation.
- The marker format is unchanged; existing valid markers keep working.
- Any new marker field that names a destination MUST get the same treatment.