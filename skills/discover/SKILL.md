---
name: discover
description: Use this skill when adopting Drawbore in an existing repository or refreshing its initial durable context. It analyzes repository structure, terminology, conventions, current behavior, technical choices, and history, then proposes evidence-backed glossary, context, principle, decision, system, and stack records for developer confirmation.
license: MIT
---

# Discover project context

Build an accurate, minimal starting point for the project's durable context. Discovery proposes; the developer confirms.

## Inspect the project

1. Resolve the project root. Prefer the version-control repository root; otherwise use the current working directory.
2. Read existing guidance and documentation before proposing duplicates: `AGENTS.md`, `CLAUDE.md`, `README.md`, architecture documents, contribution guides, API documentation, and existing records.
3. Inspect source structure and representative code. Use configuration and lockfiles to identify the current stack.
4. Inspect relevant history for decisions that would surprise a future contributor, but do not invent rationale from commit messages alone.
5. Identify existing issue-tracking configuration only as environment evidence; do not add tracker configuration to the record.

## Propose a minimal set

Consider these durable artifacts, but create only those with confirmed content:

- `context.md` — purpose, scope, architecture, and relationships;
- `glossary.md` — project-specific canonical terms;
- `principles.md` — load-bearing rules visible in code or confirmed by the developer;
- `decisions/` — consequential choices supported by evidence or explicit developer confirmation;
- `system.md` — current user-visible capabilities and contracts;
- `stack.md` — current project-specific technical choices and architecture.

Do not seed generic technology preferences, testing doctrine, or design doctrine. The repository's actual choices are authoritative. Propose a rule only when project-specific evidence supports it.

## Confirm candidates in batches

Before proposing, read `.drawbore/index.md` and every existing record that could cover a candidate. Search by project concept, not only by the proposed filename, and identify the exact existing entry to amend or state that no equivalent entry exists. Do not propose a duplicate when an existing record owns the fact.

Present candidates with evidence and a concrete destination, then collect the batch in a rendered form: one checkbox group per artifact offering **apply as proposed**, **edit the developer's wording**, **skip**, or **skip the remaining candidates** for that artifact; the candidate text and its evidence inline in the form; and a free-text field for the wording **edit** asks for. A batch of six artifacts cannot be settled in prose — a prose list invites one blanket answer that the writer then over-applies.

Then wait for the developer's response. **Apply as proposed** approves exactly the displayed proposal; **edit** requires revised wording to be displayed and approved; **skip** changes nothing. Prefer the developer's exact wording. Mark inferred rationale as inferred. Never write, overwrite, amend, or delete an unconfirmed candidate.

A turn that ends by asking the developer to choose ends in a rendered form, not in prose: the question tool is a blocking prompt that cannot be skipped, prose can be scrolled past and answered by momentum. When no form tool exists, ask in plain text and stop until they answer. Never treat your own restatement of the options as the answer, and keep a free-text path for answers the options do not cover.

## Create the record

After confirmation:

1. Create missing artifacts for confirmed candidates and apply only the confirmed amendments to existing artifacts.
2. Use the formats defined by the `record` skill, including its one-owner-per-fact and amendment rules.
3. Create or update `.drawbore/index.md` only as needed to map the confirmed records accurately.
4. Do not create empty `work/` or `decisions/` directories unless confirmed content requires them.
5. Preserve every pre-existing record file and directory unless the developer explicitly approves deleting that exact path.
6. Treat dependent edits—such as a decision, an affected current-truth artifact, and an index correction—as one atomic proposal: apply all or none.
7. Report what was created, what was skipped, what was preserved, and any unresolved disagreement.

Skipping a candidate means leaving the existing path unchanged, not deleting it. An empty or placeholder file is still an existing path. For example, do not delete `glossary.md` merely because no glossary candidate was confirmed.

## Refresh safely

If `.drawbore/` already exists:

1. Inventory the existing record paths and read them before scanning.
2. Identify missing, contradictory, or stale content. Treat **empty** as a content state, not as permission to delete a path.
3. Propose additions or amendments with evidence and show the exact resulting entry or path.
4. Do not overwrite, amend, or delete confirmed records without explicit developer approval of the displayed proposal.
5. Do not delete an existing record or directory during discovery or refresh. Deletion requires a separate explicit proposal that names the exact path and reason, followed by explicit developer approval.
6. Do not settle or remove transient Change Briefs during discovery. Use the `frame` and `record` skills for that workflow; preserve `work/` and its briefs here.
7. After applying approved additions and amendments, run `drawbore check` on the record. Fold any error it reports into a further proposal; do not report the refresh as complete while a structural error remains.

## Boundaries

- Do not infer durable project truth from generic framework conventions.
- Do not create milestones, plans, issues, or execution state.
- Do not assume an external tracker platform.
- Do not create empty records merely to complete the taxonomy.
- Do not delete or rename pre-existing record paths because they are empty, skipped, placeholder-only, or not part of the proposed refresh.