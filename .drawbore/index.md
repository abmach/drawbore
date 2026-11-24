# Project Notebook

Durable, curated context for this project.

## Durable context

- [Context](context.md) — purpose, scope, architecture, and relationships.
- [Glossary](glossary.md) — canonical terms and discouraged aliases.
- [Principles](principles.md) — rules that constrain future work.
- [Decisions](decisions/) — durable choices and their rationale.
  - [0001 — Staged npm publish](decisions/0001-staged-publish.md) — GitLab CI stages; a maintainer approves with 2FA.
  - [0002 — Consent-aware skill conflicts](decisions/0002-content-conflicts.md) — a skill is foreign only when its content diverges.
  - [0003 — Marker instructions are a trust boundary](decisions/0003-marker-instruction-validation.md) — `instructions` are validated for containment before any write.
  - [0004 — Choice turns end in a form](decisions/0004-choice-turn-form-gate.md) — a question that asks the developer to choose is a rendered form, not prose.
  - [0005 — Context is written for a reader with no session](decisions/0005-context-free-reader.md) — durable records address a capable reader with none of the author's implicit knowledge.
  - [0006 — One decidable unit per form](decisions/0006-one-unit-per-form.md) — superseded by the one-submission paginated form in decision 0008.
  - [0007 — Harness locations use canonical containment](decisions/0007-canonical-location-containment.md) — locations resolving outside the project are refused before mutation.
  - [0008 — Collect choice units in one paginated form](decisions/0008-batched-paginated-choice-forms.md) — one submission, one detailed unit per page.
- [System behavior](system.md) — current shipped capabilities and contracts.
- [Technical choices](stack.md) — current stack and architecture.

## Transient work

- [Change Briefs](work/) — scope being shaped or implemented. Promote durable consequences and remove settled briefs.