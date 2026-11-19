---
name: frame
description: Use this skill in a project with a Drawbore notebook (`.drawbore/index.md` at the repository root) when a feature request, bug fix, refactor, or technical change needs brainstorming or a materially clearer scope before implementation. It collaborates with the developer to define purpose, inclusions, non-goals, change points, acceptance conditions, open questions, and consequences, then maintains a transient Change Brief. If it is missing, do not create it — run `npx drawbore init`.
license: MIT
---

# Frame the change

Requires `.drawbore/index.md` at the repository root. If it is absent, stop: this project is not initialized with Drawbore. Do not create the notebook or any record — tell the developer to run `npx drawbore init` and offer to continue afterwards.

Collaborate with the developer until the intended change is clear enough to implement. This skill shapes scope; it does not orchestrate execution.

## Choose whether scope work is needed

Use scope work when at least one material uncertainty remains:

- the purpose or desired outcome is unclear;
- more than one plausible interpretation would produce different behavior;
- the boundary between in-scope and out-of-scope work is unclear;
- a change point or affected contract is unknown;
- acceptance cannot be stated observably;
- the request conflicts with recorded project context.

Do not use scope work for a straightforward, well-bounded change whose answers are available in the repository.

## Establish shared understanding

1. Read `.drawbore/index.md` and the relevant context, glossary, principles, decisions, current behavior, and active Change Briefs.
2. Inspect the repository before asking questions it can answer.
3. Restate the likely purpose and intended outcome in plain language.
4. Ask only questions whose answers affect scope, behavior, boundaries, or acceptance. Prefer a small number of concrete questions over an exhaustive interview.
5. Probe meaningful alternatives and edge cases only where they could change the implementation.
6. Separate confirmed facts from assumptions and open questions.

A turn that ends by asking the developer to choose ends in a rendered form, not in prose: the question tool is a blocking prompt that cannot be skipped, prose can be scrolled past and answered by momentum. Put the scope questions in that one form rather than a run of single questions — a scope that arrives in pieces gets settled piecemeal and the later answers are never reconciled. When no form tool exists, ask in plain text and stop until they answer. Never treat your own restatement of the options as the answer, and keep a free-text path for answers the options do not cover.

## Maintain a Change Brief

Store a Change Brief in `.drawbore/work/` while the work is being shaped or implemented. Use a descriptive kebab-case filename, for example `add-user-imports.md`.

Maintain one canonical brief per logical change. Before creating or writing a brief, inspect `.drawbore/work/` for a brief describing the same change and update it in place. Create a separate brief only for a distinct change. Never overwrite an existing brief; if a filename collides with distinct work, choose a distinct kebab-case filename.

Follow [the Change Brief format](references/change-brief.md). A brief is transient working context, not a milestone plan or an execution registry.

Update the canonical brief whenever a material scope, assumption, acceptance, change-point, or decision changes. Keep `Acceptance` synchronized with the agreed behavior. Do not rely on the conversation or an earlier revision as the current brief.

Treat a brief as active while its file remains in `.drawbore/work/`. It is terminal only through explicit settlement or cancellation. For cancelled or superseded work, propose any still-durable consequences and the removal of the obsolete brief together. Remove it only after the developer explicitly approves that removal; otherwise keep it as active guidance.

Treat `work/` as tracked by default, but do not add it wholesale to an ignore file. Commit a brief only when it must remain available across sessions or to other agents and the developer explicitly consents to that commit. Ignore a specific brief only when it is intentionally private or local; before sharing that work, remove its ignore rule and ask the developer to commit the required brief.

## Define change points

A **change point** is a place where the implementation can affect established project truth or behavior. Include only applicable points:

- user-visible workflow or interface;
- domain rule or invariant;
- public or internal contract;
- data shape, ownership, or migration;
- integration boundary or external dependency;
- configuration, runtime, deployment, or operational behavior;
- documentation, terminology, glossary, or principle;
- test and verification surface.

For each change point, identify the affected area and the expected consequence. Do not prescribe implementation steps or milestones.

## Settle the work

"Scope agreed" ends clarification but does not settle the work. Settle only after the implementation is complete and every acceptance condition has been checked against the implemented behavior and passes.

1. Resolve each open question, or explicitly mark it irrelevant to the final scope. Any unresolved question that could affect implementation blocks settlement.
2. Resolve or remove every assumption before settlement.
3. Promote durable consequences into the appropriate records through the `record` skill:
   - project vocabulary → glossary;
   - purpose, scope boundaries, and domain relationships → context;
   - enduring constraints → principles;
   - choices that should affect future work → decisions;
   - shipped capabilities and contracts → system behavior;
   - current technical choices → stack.
4. Ensure the brief contains no unique durable rationale that was not promoted.
5. Remove the brief only after every proposed durable update has been applied and written successfully. If an update is skipped or pending, keep the brief and state what remains.
6. Remove only the exact settled brief file from `.drawbore/work/`, but keep the `work/` directory.
7. Do not create a settled-work archive. If the brief was committed, version-control history preserves it.

## Boundaries

- Do not create milestones, task assignments, retries, or execution-approval gates. A question that settles scope is not an approval gate, and neither is the consent the change brief itself requires before removal or commit.
- Do not write code while clarifying scope.
- Do not turn implementation preferences into project-wide principles.
- Do not assume where external issues are tracked.