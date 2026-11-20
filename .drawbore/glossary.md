# Glossary

## General

**Notebook**:
The `.drawbore/` directory of durable context — purpose, glossary, principles, decisions, current behavior, stack.
**Harness location**:
A directory receiving installed skills (`.agents`, `.claude`, `.codex`, `.cursor`, `.omp`, `.opencode`).
**Install marker**:
`.drawbore-install.json` in the project root — records version, namespace, accumulated locations, accumulated instruction files, `existedBefore` instruction files, per-location installed skill names, and file hashes so later runs preserve local edits and reverse only what this install created. It is repository-tracked and hand-editable, so every destination it names is validated before use, including canonical containment that rejects symlinked paths resolving outside the project.
**Change Brief**:
Transient scope record under `.drawbore/work/`, shaped by `frame` and settled after acceptance.