# Glossary

## General

**Notebook**:
The `.drawbore/` directory of durable context — purpose, glossary, principles, decisions, current behavior, stack.
**Harness location**:
A directory receiving installed skills (`.agents`, `.claude`, `.codex`, `.cursor`, `.omp`, `.opencode`).
**Install scope**:
`project` (skills under a harness location in the repository, recorded in the tracked `.drawbore-install.json`) or `user-level` (`--global`; skills under a user-level directory, recorded in `~/.config/drawbore/install.json`). Scopes are independent.
**Install marker**:
`.drawbore-install.json` (project) or `~/.config/drawbore/install.json` (user-level) — records version, namespace, locations, the resolved skill directory per location, and file hashes so later runs preserve local edits and remove the right files.
**Change Brief**:
Transient scope record under `.drawbore/work/`, shaped by `frame` and settled after acceptance.