---
name: release
description: Cut a release for any project — bump version, changelog, tag, push, and verify the pipeline or publish step. Works for repository-only releases and for projects that publish a package to a registry through CI. Includes optional provider notes for common CI systems. Use for any release, tag, publish, or release-pipeline debugging task, including re-tagging and failed publish pipelines.
---

# Release flow (provider-neutral)

Determine the project shape first:

1. Read the root `AGENTS.md` `## Release` section (package name, version stamps, build steps, verify commands, publish mode, pipeline path). Missing or stale → fix it as part of the release.
2. Settle the publish mode. Use `publish mode:` when present; otherwise infer it and say which inference you made:
   - a staging flow described in prose → `staged`;
   - a package with a CI publish job and no staging step → `direct`;
   - no package, or `npm package: none` → `none`.
   Older sections write the package field as `npm package:` rather than `package:`; read either.
3. Settle the pipeline. Use `pipeline:` when present; otherwise treat the repository's CI configuration as the pipeline. A publish job in the CI file means CI publishes on the tag; no publish job means the release is cut by hand.

Never assume a forge or registry: use the remotes, CI configuration, and `## Release` facts the repository actually has.

## Common flow (every project)

1. Bump `version` in the package manifest (if present) and every version-stamped file listed under `## Release`.
2. Add a dated `CHANGELOG.md` section for the new version, with a compare link to the previous tag.
3. Commit the release (`chore(release): vX.Y.Z`). Commit only with the developer's explicit consent.
4. `git tag vX.Y.Z && git push origin vX.Y.Z`.
   Tag pipelines trigger on tags matching `^v\d+\.\d+\.\d+$`; when a package manifest exists, the tag must equal `v` + its version — the pipeline gates on it.
5. Wait for the tag pipeline (or the forge's equivalent) to go green.

Gate the release on the developer's explicit authorization, not on the momentum of the flow. Before committing, pushing, or tagging, restate the exact actions and put them to the developer in one form the harness can render — command, effect, and whether it is local or public. Nothing in that list runs on an implicit yes: a release authorizes only the actions named at that moment, so a later step needs its own consent.

Gate on the developer's answer with the harness's structured question tool when one is available — a blocking prompt that cannot be skipped — otherwise ask in plain text and stop until they answer. Never treat your own restatement of the options as the answer, and keep a free-text path for answers the options do not cover.

Approval of a **staged** publish is never automated and never bundled into this gate: it is the maintainer's interactive proof-of-presence step with 2FA, and only the maintainer can perform it.

### First publish bootstrap

If the registry reports that the package does not exist, the package must exist before CI-based publishing can be configured. Publish the first version once with an authenticated account (normally locally), configure the forge/registry publishing identity, and then continue with the publish tail. Do not add a long-lived registry token to CI as a workaround; the one-time bootstrap publish is not the ongoing release mechanism.

## Publish tail (publish mode is `direct` or `staged`)

Run this after the tag pipeline is green when `pipeline:` names a CI file, or by hand when it says `none`.

**`direct`** — the registry's publish command runs with the CI credential, and the version is public as soon as it succeeds:

```
<registry> publish --provenance --access public
```

**`staged`** — the version now sits in the registry's **staging area**, not public yet. A maintainer approves it out of band; never automate that step:

1. Review and approve (human proof-of-presence — never automate):
   ```
   <registry> stage list
   <registry> stage view <stage-id>       # metadata; commit = exact published revision
   <registry> stage download <stage-id>   # inspect the actual artifact
   <registry> stage approve <stage-id>    # prompts 2FA → LIVE
   ```

2. Verify: the registry's version endpoint, the verify commands or URLs from `## Release`, and provenance state. A staged release publishes at approval time on the maintainer's machine, with no CI/OIDC build context — expect `attestations: null` and check rather than assume.

## Repository-only tail (publish mode is `none`, or no `## Release` section)

1. Verify the tag exists on the canonical forge and the changelog compare link resolves. Optionally attach the changelog section to a forge release on the tag.

## Re-tagging the same version

1. Publishing projects: **reject any staged version for it in the registry first** — the staging area holds one package per version and a re-push collides.
2. `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
3. Re-tag at the fixed commit, push.

Remember: tag pipelines run the CI **at the tag's commit** — a pipeline fix on the main branch does not retro-fix a tagged release.

## Optional provider notes

Read only the note that matches the repository. Do not add a workflow file for a provider the project does not use.

### GitLab CI

- Tag pipelines run the CI config **at the tag's commit**. Recovery is tag surgery (delete tag local + remote, re-tag at the fix commit, push) — safe only if staging never ran for that tag.
- GitLab's YAML parser (Ruby Psych, YAML 1.1) treats an UNQUOTED scalar containing `: ` (colon+space) as a mapping. Symptom: "script config should be a string or a nested array of strings". Rule: single-quote any script line containing `": "`.
- The push mirror to another forge does **not** carry tags, so tag-triggered jobs on the mirror can never fire. Release CI lives on the canonical forge.
- If an `environment` is set in the registry's publishing configuration, the CI job must declare the matching `environment: name: <value>`, or publishing 403s.

### GitHub Actions

- Tag-triggered workflows (`on: push: tags: ['v*']`) run at the tag's commit. Re-running a failed job after fixing the workflow on the main branch does not help a tag that already exists.
- Keep publishing permissions least-privilege (`id-token: write` only for the publish job, `contents: read` elsewhere).
- A mirror repository does not receive tags; do not put release workflows there.

### npm registry

- Publishing from CI with provenance compares the manifest's `repository.url` against the CI provider in the OIDC token. A mismatch fails with `422 Unprocessable Entity — Error verifying sigstore provenance bundle`. Point the manifest at the forge the pipeline runs on.
- The OIDC audience must be `npm:registry.npmjs.org` (the `npm:` prefix is required); the sigstore token uses `aud: sigstore`.
- `--provenance` on `stage publish` is accepted, but the publish happens at `stage approve` on the maintainer's machine, where no CI/OIDC build context exists — staged releases have come out with `attestations: null`. Treat the provenance badge as absent for staged releases unless proven otherwise.
- Staged publishing requires npm CLI >= 11.15 and Node >= 22.14; `node:24` bundles an older npm, so the job must `npm install -g npm@11`.
- Staging holds ONE package per version. Re-tagging the same version while a stage is pending collides — reject the stale staged version first.
- A brand-new package's first stage publishes a public `0.0.0-stage` placeholder — that is how the name gets claimed before first approval.
- A brand-new package cannot configure a trusted publisher until it has been published at least once. Publish the first version with an authenticated account, configure trusted publishing, then complete a real stage within the configuration's validity window.
- The review subcommands (list/view/download/approve) cannot use OIDC by design — they are the interactive proof-of-presence steps.
- Registry versions are immutable; the pipeline is only exercised by real new version tags.
- Trusted-publisher configurations expire if not exercised by a real stage within their validity window (commonly 2 days).
- CRLF creep from Windows working trees lands in tarballs unless `.gitattributes` has `* text=auto eol=lf`.

### Package hygiene (any registry)

- Ship only what consumers need: an explicit files whitelist, not an ignore list.
- For style packages, set the manifest field bundlers read for the main stylesheet.
- CDN verify URL shape: `https://cdn.jsdelivr.net/npm/<name>@<version>/<file>`. jsDelivr auto-minifies a DOTTED filename as `<base>.min.<ext>`.

### Security posture

- Prefer short-lived OIDC tokens bound to (forge, project, CI file) over long-lived credentials.
- Staging may not require 2FA (safe for automation); approval always needs interactive 2FA. A compromised CI can stage junk but nothing goes public without the maintainer.
- Recommended per-package hardening: require two-factor authentication and disallow tokens.