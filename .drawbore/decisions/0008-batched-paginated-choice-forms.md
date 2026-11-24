---
id: 0008
status: accepted
significance: architectural
date: 2026-11-24
---

# Collect choice units in one paginated form

## Context

Decision 0006 preserved one detailed decision per page but required every page to end the model turn. This made a ten-item review or a six-item record proposal consume ten or six model turns before work could continue, which is especially expensive with slow models. The question tool can render multiple top-level fieldsets in one form as separate pages, so the turn cost was not required by the detailed-page rule.

## Decision

A choice form collects all pending decidable units in one submission and renders one unit per page. Each unit is a top-level fieldset with its full proposal, evidence, target, options, and free-text path. The developer reviews and submits the pages once. A second form is requested only when the developer requests revised wording.

## Rationale

Detailed decisions and low turn cost are compatible when pagination belongs to the form rather than the model turn. The developer retains the full text, per-unit veto, and free-text path required by decision 0006 while the agent continues after one interaction.

## Alternatives considered

- Keep one form per unit — preserves detailed pages but spends one model turn per unit.
- Put all units on one visible page — reduces turns but compresses or scrolls away the detail decision 0006 was designed to preserve.
- Use multiple form elements — the question tool consumes only the first form, so later forms would be ignored.

## Consequences

- discover, record, recall, review, frame, init-project, and release collect pending units in one form.
- A fieldset is the page boundary; every control name is unique across the form.
- The shared form reference and skill tests enforce one submission and one unit per page.
- Revision requests may require one follow-up form; ordinary apply and skip decisions do not.
