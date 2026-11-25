---
id: 0009
status: accepted
significance: durable
date: 2026-11-25
---

# Brainstorm before framing project scope

## Context

The bundle already used `frame` for brainstorming and scope shaping in technical changes. Open-ended ideas also needed sustained exploration before a project-specific direction existed, including work outside a Drawbore-initialized project.

## Decision

The portable `brainstorm` skill owns idea exploration, constructive challenge, comparison of materially different approaches, and convergence on an agreed direction. It produces a conversational handoff and does not create a Change Brief. The `frame` skill retains ownership of project-specific scope, non-goals, change points, acceptance conditions, and the Change Brief lifecycle.

## Rationale

Separating exploration from scope prevents two skills from maintaining competing scope artifacts while preserving a concrete pre-scope stage. The explicit convergence condition gives the discussion an observable endpoint rather than relying on subjective refinement.

## Alternatives considered

- Extend `frame` with all open-ended ideation — would make `frame` require a Drawbore notebook for ideas that do not yet concern a project and would blur exploration with scope ownership.
- Name the skill `explore` — could be confused with inspecting files, URLs, or repositories; not chosen.
- Keep a generic unbounded discussion workflow — would have no reliable output or stopping condition.

## Consequences

- `brainstorm` works with or without a Drawbore notebook and does not mutate durable context.
- A converged brainstorming session hands an agreed direction, constraints, serious alternatives, risks, and remaining uncertainties to `frame`.
- `frame` states that it turns an agreed direction into project-specific scope.
