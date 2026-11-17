# Project conventions

Drawbore keeps a repository's durable context together: purpose, principles, decisions, current behavior, and the portable skills that work from them.

## Release

- package: `drawbore`
- mirror: `github.com/abmach/drawbore`
- package shape: node-lib (CLI)
- build needed before release: no
- version stamps: `package.json`
- dogfooded install: `.drawbore-install.json` must match `package.json`; refresh it with `node bin/drawbore.js update` after the bump. `test/dogfood.test.js` fails when it drifts.
- publish targets: npm
- publish mode: staged
- pipeline: `.gitlab-ci.yml`
- files whitelist notes: ship only the CLI, runtime modules, skills, templates, and documentation needed by consumers
- verify after release: `npm view drawbore@<version>`, `https://cdn.jsdelivr.net/npm/drawbore@<version>/README.md`

<!-- drawbore:start -->
## Drawbore

This project uses `.drawbore/` as its curated, durable project context. Drawbore installs portable skills into the agent harness; use the `discover`, `recall`, `frame`, `record`, `review`, `init-project`, and `release` skills where the task calls for them.

Before implementing a feature, bug fix, refactor, design change, or other technical change, consult the relevant project context, glossary and canonical terms, principles, decisions, current behavior, technical choices, and active Change Briefs. If purpose, scope, or a boundary is materially ambiguous, or the request conflicts with a recorded principle, decision, term, or boundary, collaborate with the developer to resolve it before implementation.

After completing work, reconcile the implementation and verified behavior with durable project context. Offer specific evidence-backed updates and wait for explicit **apply** or approval of edited wording; **skip** or no decision leaves the record unchanged. If no durable consequence changed, explicitly state **No record update needed**. Never silently change curated project truth.
<!-- drawbore:end -->
