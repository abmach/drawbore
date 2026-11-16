# Project conventions

Drawbore keeps a repository's durable context together: purpose, principles, decisions, current behavior, and the portable skills that work from them.

## Release

- package: `drawbore`
- mirror: `github.com/abmach/drawbore`
- package shape: node-lib (CLI)
- build needed before release: no
- version stamps: `package.json`
- publish targets: npm
- publish mode: staged
- pipeline: `.gitlab-ci.yml`
- files whitelist notes: ship only the CLI, runtime modules, skills, templates, and documentation needed by consumers
- verify after release: `npm view drawbore@<version>`, `https://cdn.jsdelivr.net/npm/drawbore@<version>/README.md`