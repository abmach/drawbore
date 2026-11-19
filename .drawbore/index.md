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
- [System behavior](system.md) — current shipped capabilities and contracts.
- [Technical choices](stack.md) — current stack and architecture.

## Transient work

- [Change Briefs](work/) — scope being shaped or implemented. Promote durable consequences and remove settled briefs.