---
id: 0004
status: accepted
significance: durable
date: 2026-11-19
---

# A turn that asks the developer to choose ends in a rendered form

## Context

All seven skills already carried a shared clause requiring the harness's
structured-question tool when one exists. It said *how* to ask and never *when*
the form was mandatory, so an agent that wrote "offer **apply**, **edit**, or
**skip**" in prose was compliant. In practice a review proposed eleven findings
in a ranked table and asked its question in a sentence; the developer answered by
typing ids, which is exactly the outcome the clause existed to prevent. The same
gap covered the record and discover batch decisions, and the review phase-2
scope restatement.

## Decision

A turn that ends by asking the developer to choose ends in a rendered form, not
in prose: the question tool is a blocking prompt that cannot be skipped, and
prose can be scrolled past and answered by momentum. The trigger is stated
verbatim in every skill. Where a skill offers a decision, it names the form that
collects it and the fields that form carries, rather than only listing the
options.

## Rationale

A form does three things prose cannot: it blocks until answered, it renders the
cost of each option inline, and it gives a per-item veto instead of one blanket
answer. The failure was not a missing mechanism but a missing trigger. Source:
the 0.5.2 review cycle, and `test/skills.test.js`'s `CHOICE_TURN_CLAUSE` and
`FORM_SKILLS` assertions.

## Alternatives considered

- Add the trigger to the four decision-carrying skills only — the two that only
  ask scope questions (`frame`, `init-project`) can drift back into prose, which
  is how the clause came to be applied unevenly in 0.3.1.
- Require a form for every question, including read-only ones — it would make a
  clarifying question heavier than the answer it seeks. The trigger is about
  turns that end in a choice.
- Leave the clause as-is and rely on the agent to judge — that is the state that
  produced the failure.

## Consequences

- All seven skills carry the same trigger sentence; `test/skills.test.js` fails
  a new skill that lacks it.
- `discover`, `record`, `recall`, and `review` name their form and fields; a
  regression to prose fails `FORM_SKILLS`.
- A skill may still ask in plain text when the harness has no form tool; the
  trigger names the form as the requirement and plain text as the fallback.