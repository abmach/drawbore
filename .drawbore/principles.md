# Principles

1. **Consent-aware installation** — never overwrite a file without an explicit choice; locally modified skills are preserved. Source: `copySkillDirectory` + `readInstalledSkillHashes`.
2. **Provider-neutral** — no forge, registry, or CI provider is assumed. Source: README, `init-project` skill, installer has no provider constants.
3. **Content-based conflict detection** — a skill directory is foreign only when its content diverges from the package; a name-only mismatch is preserved, not blocked. Source: `isForeignSkill`.
4. **Keep the record minimal** — create only artifacts with confirmed content; never seed generic doctrine. Source: discover skill boundaries, templates.