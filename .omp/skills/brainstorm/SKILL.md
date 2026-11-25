---
name: brainstorm
description: Explore and refine an idea through sustained discussion, materially different alternatives, constructive challenge, and convergence on an agreed direction. Use before implementation when a new feature, design, implementation approach, product idea, or other topic needs to be thought through. Works with or without a Drawbore notebook; hands project-specific scope to the frame skill.
license: MIT
---

# Brainstorm an idea

Explore an idea with the developer, challenge weak assumptions, compare materially different approaches, and converge on a direction worth pursuing. This skill refines thinking; it does not implement the result.

Works with or without a Drawbore notebook. It does not require, create, or modify one.

## Establish the objective

1. Restate the topic and the outcome the developer wants from the discussion.
2. Inspect available evidence before asking questions that evidence can answer. For a repository topic, read the relevant files; for a general topic, use the information the developer supplied.
3. Separate confirmed facts, supplied preferences, assumptions, and open questions.
4. Ask only questions whose answers could change the objective, constraints, candidate approaches, or selected direction. Prefer a few consequential questions over an exhaustive interview.

Exploratory questions may be conversational prose when they invite reasoning, examples, constraints, or free-form input. A turn that asks the developer to choose among options is a choice turn and must follow the rendered-form rule below.

## Explore before converging

Generate approaches that differ materially. Do not present minor variations of the first idea as alternatives.

For each serious approach, explore:

- the problem or objective it serves;
- how it works at a conceptual level;
- benefits and costs;
- assumptions it depends on;
- risks, failure modes, and likely objections;
- reversibility and the cost of changing course later;
- constraints it may violate.

Include a simpler alternative and a no-change alternative when either could plausibly satisfy the objective. Challenge the developer's decisions constructively: identify unsupported assumptions, hidden dependencies, omitted users or stakeholders, premature commitments, and cases where the proposed approach may not fit the actual objective. Do not manufacture objections merely to appear thorough; omit objections that do not survive scrutiny.

Keep discussion grounded. Mark facts derived from evidence separately from inferences and suggestions. Ask the developer for missing domain facts when they cannot be inferred and would materially change the options.

## Converge

Compare the serious approaches against the agreed objective and constraints. Make the trade-offs visible instead of silently selecting one.

A brainstorming session has converged only when all of these conditions hold:

1. The objective is understood.
2. A direction has been agreed.
3. No unresolved material decision could change the selected direction or materially change the approach.
4. Remaining uncertainties have been identified and do not block convergence.
5. The handoff summary is complete.

Do not continue merely because additional questions or ideas are possible. If a material decision remains, resolve it before declaring convergence.

## Choice turns

A turn that ends by asking the developer to choose ends in a rendered form, not in prose: the question tool is a blocking prompt that cannot be skipped, prose can be scrolled past and answered by momentum. Put all pending choice units in one form, with **one decidable unit per page**: one top-level `<fieldset>` per choice, in order of consequence, with the proposal, evidence, trade-offs, and consequence visible on that page. Open each page with a map line naming the choice, its position in the total, and how many remain. Use unique control names for every choice. The developer submits the form once as one submission for all pending choices; do not end the model turn after each choice, and an answer to one choice is not consent for another. When no form tool exists, ask one choice per plain-text message, map line first, and stop until they answer. Never treat your own restatement of the options as the answer, and keep a free-text path for answers the options do not cover.

Do not reopen a choice the developer has settled unless new evidence invalidates it. New evidence must be stated with the decision it calls into question.

## Hand off

End a converged session with a summary containing:

- **Direction** — the selected approach and why it best fits the objective.
- **Constraints** — requirements and boundaries that materially shaped the direction.
- **Alternatives** — serious alternatives considered and why they were not selected.
- **Risks** — risks requiring validation during scoping, design, or implementation.
- **Remaining uncertainties** — open questions that do not affect the selected direction.

The summary is the brainstorming result. It is conversational output; it is not a durable project artifact.

When the topic is a concrete change in a project initialized with Drawbore, end by handing the summary to the `frame` skill. `frame` owns project-specific scope, non-goals, change points, acceptance conditions, and the Change Brief. `brainstorm` does not create or update a Change Brief and does not maintain a competing scope artifact.

Do not implement the selected direction and do not update durable project context. Implementation follows an approved scope; durable knowledge is recorded later through the `record` skill.

## Boundaries

- Do not manufacture breadth, complexity, or novelty to make the discussion feel substantial.
- Do not treat agreement with the first plausible approach as convergence.
- Do not let a long discussion continue without an observable convergence condition.
- Do not ask questions the available evidence can answer.
- Do not maintain execution plans, task registries, approval gates, or implementation steps.
- Do not mutate the repository, notebook, or external systems. Hand implementation and durable-record work to the skills that own them.
