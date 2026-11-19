# Principles

1. **Consent-aware installation** — never overwrite a file without an explicit choice; locally modified skills are preserved. Source: `copySkillDirectory` + `readInstalledSkillHashes`.
2. **Provider-neutral** — no forge, registry, or CI provider is assumed. Source: README, `init-project` skill, installer has no provider constants.
3. **Content-based conflict detection** — a skill directory is foreign only when its content diverges from the package; a name-only mismatch is preserved, not blocked. Source: `isForeignSkill`.
4. **Every destination is validated, not trusted** — a repository-tracked file is hand-editable, so anything it names as a write or delete target is checked against the project before use. Source: `assertMarkerInstructions`, `readMarkerLocations`, decision 0003.
5. **A choice turn ends in a form** — when the agent asks the developer to decide, the question is a rendered form and not prose, so the cost of each option is visible and the answer cannot be given by momentum. Source: all seven skills, `test/skills.test.js`, decision 0004.
6. **Keep the record minimal** — create only artifacts with confirmed content; never seed generic doctrine. Source: discover skill boundaries, templates.