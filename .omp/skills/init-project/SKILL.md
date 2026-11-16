---
name: init-project
description: Scaffold a new project repository in a provider-neutral way — README, LICENSE, CHANGELOG, .gitattributes, .gitignore, a root AGENTS.md with a ## Release section, and a package manifest when the project publishes a package. Generates a release pipeline from the project's answers when a CI provider is named and a pipeline is wanted, and lists the manual setup steps that cannot live in files (forge mirror configuration, registry publishing setup). Use when starting a new repository, standardizing an existing one's project-level files, or setting up a release pipeline.
---

# Initialize a project

This skill owns the **repository layer only**. It does not assume a forge, a registry, a CI provider, or a language ecosystem. Ask the user before generating anything:

1. **Project name and repository path.**
2. **Public or private?** If public and mirrored to another forge, note it; mirror setup is manual (see the checklist).
3. **Does it publish a package?** If yes, settle the package name now: verify availability with the registry's lookup command (`npm view <name> version`, `cargo search <name>`, `pip index versions <name>`, or the ecosystem equivalent). Remember that many registries never recycle names — a bare name may be a dead package forever. Follow the ecosystem's naming conventions.
4. **Primary language and package manager**, so ignore rules and manifests match reality.

## Files to generate

- `.gitattributes` — `* text=auto eol=lf`. CRLF from Windows working trees otherwise creeps into published archives and diffs.
- `LICENSE` — the license the user chooses, current year, consistent copyright line.
- `CHANGELOG.md` — dated sections (Keep a Changelog style) with compare links between tags on the canonical forge.
- `README.md` — title, one-paragraph description, install and use sections, and a build/test badge if the forge provides one. If the repository is mirrored, state which forge is canonical and that issues and releases live there.
- `.gitignore` — language-appropriate, minimal. Never ignore a path that carries project truth the user wants shared.
- `AGENTS.md` (repository root, committed) — include a `## Release` section:
  ```markdown
  ## Release
  - package: <name, or: none — repository-only project>
  - package shape: <library | cli | application | assets | other>
  - build needed before release: <no | exact steps>
  - version stamps: <files whose contents carry vX.Y.Z>
  - publish targets: <registry or artifact store, or none>
  - publish mode: <staged | direct | none>
  - pipeline: <path to the CI file, or none — release manually>
  - verify after release: <commands or URLs that prove the release>
  ```
  The `release` skill reads this at every release — it must stay accurate. `publish mode` decides which publish tail runs; `pipeline` says whether a pipeline exists to run it.
- `package.json` (or the ecosystem manifest) — **only if publishing**: name, `version: 0.1.0`, the files whitelist (ship only what consumers need), repository and bug-tracker URLs pointing at the **canonical** forge, and any ecosystem-specific entry field the registry requires.
- CI configuration — **only when the user names a CI provider and asks for it.** Never add a workflow file for a provider the project does not use, and never for a forge that only mirrors the repository: a mirror does not carry tags, so tag-triggered jobs there can never fire. When a pipeline is wanted, generate it from the answers under "Generate the pipeline" — do not copy a template — and record its path under `pipeline:` in `## Release`.

This skill owns the repository layer only. Do not scaffold language-specific build setups that vary per project (native executables, framework solutions, container recipes); those are built separately when the user asks.

## Manual steps that cannot live in files (print as a checklist)

1. **Mirror (public only):** configure the push mirror in the canonical forge's repository settings. Tags may not mirror — that is expected and fine.
2. **First publication:** if the package does not exist on the registry, publish the first version once with an authenticated account. A brand-new package cannot configure a trusted publisher until it has been published at least once — the bootstrap publish is what makes CI-based publishing available, not a workaround for it. Do not commit a long-lived registry token in its place.
3. **Registry publishing identity:** configure whatever the registry requires for CI-based publishing (trusted publisher, OIDC binding, or a scoped token) **right before the first release**, not at project creation — a fresh configuration can expire if no real publish completes within its validity window. Complete that first real publish inside the window.
4. **Registry hardening (once):** require two-factor authentication and disallow long-lived tokens where the registry supports it. OIDC-based publishing is unaffected.

## Generate the pipeline

Only when the user named a CI provider and asked for a pipeline. Settle three answers first, then write the file; every shape below follows from them.

1. **Publish mode** — `none`, `direct`, or `staged`.
   - `none`: the pipeline builds and tests, and never publishes.
   - `direct`: CI publishes with a registry token or OIDC identity in one step.
   - `staged`: CI stages the version and a maintainer approves it out of band. Choose this when the registry supports a staging area and you want human approval before publication.
2. **Build steps** — the exact commands that produce what ships, or `none` when the manifest ships source as-is. Anything the package needs at publish time (compile, bundle, minify, copy assets) goes here, before the publish step.
3. **Provider** — the forge whose CI runs the pipeline. The release itself still uses the canonical forge's remote; the provider only decides the file name and syntax.

### Required job content (every shape)

- Trigger on tags matching the release tag pattern, and nothing else. Release pipelines exist to run at the tagged commit.
- Gate: fail when the tag does not match `v` + the manifest version. A mismatched tag publishes the wrong version.
- Gate: fail when the version is already on the registry. Registry versions are immutable — a re-push cannot succeed, and the pipeline is only exercised by real new version tags.
- Run the project's own checks before publishing (`npm ci && npm test`, or the ecosystem equivalent). Never publish an artifact the tests have not seen.
- Print what will ship, then publish. For `staged`, print the approval command the maintainer must run.

### Shape by publish mode

| Mode | Steps, in order |
|---|---|
| `none` | build → test → verify (tag exists, changelog link resolves) |
| `direct` | build → test → publish with the registry's CI credential |
| `staged` | build → test → stage publish → print `stage list` / `stage approve` for the maintainer |

### Provider file names

| Provider | File | Notes |
|---|---|---|
| GitLab | `.gitlab-ci.yml` | Needs `id_tokens` for the registry audience; the publish job must declare a matching `environment: name:` when the registry's trusted-publisher config sets one, or publishing 403s. |
| GitHub | `.github/workflows/release.yml` | Tag-triggered; `id-token: write` on the publish job only. |
| Other | whatever the provider documents | State the file name in `## Release`, and say plainly that Drawbore has no template for it. |

The `release` skill's provider notes carry the version floors, token audiences, and YAML parser traps that apply to these files — read them before writing pipeline YAML.

Record the result in `## Release`: `publish mode: <mode>` and `pipeline: <path>`. When the user declines a pipeline, write `pipeline: none — release manually` so the release skill knows to skip the publish tail.

After scaffolding: commit, push to the canonical forge, then cut the first release with the `release` skill.