---
id: 0005
status: accepted
significance: durable
date: 2026-11-19
---

# Written context is addressed to a reader with none of the author's implicit knowledge

## Context

Drawbore's whole value is the session boundary. The notebook and the Change Brief
are the only context the next session has, and the skills never said how to write
them: `record` required evidence, one canonical owner per fact, and developer
approval; `frame` required observable acceptance. Neither said what the *reader*
can assume. The failure the notebook exists to prevent was therefore reachable
through a fully compliant record — a context entry that says "the architecture is
as discussed", a principle that cites a decision nobody read, a brief whose
acceptance reads "the import works". Each is complete by the letter of the
current rules and wrong for the reader who arrives with no session history.

## Decision

A record or brief is written for a reader who is capable and has **none of the
author's implicit knowledge**. That reader is the next agent session, a future
contributor, and the developer after the context is gone. The bar:

- Every claim carries its own grounding: the observed behavior, the diff, the
  command output, or the recorded decision. A reference is not a substitute for
  the fact it points at.
- Nothing depends on the current session: no "as discussed", "the above",
  "the usual", "same as before", no unresolved pronoun or antecedent the reader
  cannot find in the artifact.
- Terms carry the project's canonical vocabulary, and a term the reader cannot
  resolve from the record is defined where it is introduced — the glossary when
  it is a project term, the sentence when it is local to the record.
- Conditions are stated observably and completely: trigger, behavior, failure
  path, and the input or environment that makes it apply. "Works" is not a
  condition.

The tone is plain and technical, addressed to a capable reader. This is not a
simplification rule: no "explain it like", no childish phrasing, no loss of
precision, no expansion of what a term means. Complexity is stated, not hidden.

## Rationale

The session boundary is the mechanism Drawbore exists to serve: a new session
reads `.drawbore/` and the brief and nothing else. What is implicit to the author
is unavailable to it, and the cost of an implicit rule is that the reader invents
a plausible reading and acts on it — the exact failure mode the notebook's
purpose, scope, principles, and decisions are curated to prevent. Requiring the
fact at the point of use is what makes the record portable rather than
decorative. Source: the Smart Kid Principle in Chapter 4 of *Spec-Driven
Development* (Felipe Fontoura), applied at record level rather than spec level;
`record`'s evidence requirement and `frame`'s observable-acceptance rule already
assume it.

Accepted as shipped: principle 7 states the same bar at project level, and the
index links this record. The rule asks for completeness, not simplification.

## Alternatives considered

- A new artifact that states the writing rules — rejected: it would be doctrine
  the existing rules already imply, and a second place to drift from.
- Apply the rule only to `record` — rejected: the Change Brief is equally
  session-bound, and `discover` writes the same artifacts.
- Apply it to `review` and `init-project` findings — rejected: those artifacts
  address the developer in the current session, not a reader with no context.
- Keep the "kid" framing — rejected: it invites childish prose and dilutes
  precision, which is the opposite of the intent.

## Consequences

- `record`, `frame`, and `discover` state the same addressee sentence, and `test/skills.test.js` asserts it is present in each, alongside the session-dependent phrasing it forbids and the non-degradation clause that keeps the rule from becoming a request for simpler prose.
- The installed instruction block (`templates/instruction.md`) carries the bar too, so a session that loads no skill still meets it in `AGENTS.md` or `CLAUDE.md`.
- `frame`'s Change Brief format states the same bar and requires acceptance as input, environment, and observable result, so a later session can check the brief without the conversation.
- `review` and `init-project` are unchanged: their artifacts address the developer in the current session, not a reader with no context.