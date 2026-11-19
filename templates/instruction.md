<!-- drawbore:start -->
## Drawbore

This project uses `.drawbore/` as its curated, durable project context. Drawbore installs portable skills into the agent harness; use the `discover`, `recall`, `frame`, `record`, `review`, `init-project`, and `release` skills where the task calls for them.

Durable context is written for a reader who is capable and has none of the author's implicit knowledge — the next session, which reads `.drawbore/` and nothing else. Ground each statement in evidence the entry carries, do not use session-dependent phrasing such as "as discussed" or "same as before", define terms the reader cannot resolve, and state conditions completely. This is completeness, not simplification: keep the detail and the project's vocabulary.

Before implementing a feature, bug fix, refactor, design change, or other technical change, consult the relevant project context, glossary and canonical terms, principles, decisions, current behavior, technical choices, and active Change Briefs. If purpose, scope, or a boundary is materially ambiguous, or the request conflicts with a recorded principle, decision, term, or boundary, collaborate with the developer to resolve it before implementation.

After completing work, reconcile the implementation and verified behavior with durable project context. Offer specific evidence-backed updates and wait for explicit **apply** or approval of edited wording; **skip** or no decision leaves the record unchanged. If no durable consequence changed, explicitly state **No record update needed**. Never silently change curated project truth.
<!-- drawbore:end -->