---
id: 0006
status: superseded
superseded_by: 0008
significance: architectural
date: 2026-11-20
---

# One decidable unit per form

## Context

Decision 0004 made the form mandatory for every choice turn. It said nothing about
how much a single form may ask, so the skills kept their older batch instructions:
`discover` collected six artifact candidates in one form, `frame` put the whole
scope interview in one form, `init-project` settled four questions in one form,
and `review` rendered one checkbox per finding with the whole ranked table above
it. Each of those forms asked the developer to decide ten to forty things in one
screen. To fit the screen the model summarized the options, and the developer saw
compressed labels rather than the proposal, so the individual decision could not
be discussed. The developer's complaint that named this failure: options arrive in
bulk and the model compresses them, so there is nothing to discuss.

## Decision

A form carries **one decidable unit**: a single decision the developer can take or
refuse as a whole, together with the context that decision needs.

This narrows what a form may hold; it does not relax decision 0004, which stays
in force. A turn that ends by asking the developer to choose still ends in a
rendered form, and splitting a large question into pages is how that form is
rendered when one page would have to compress the options.

- A unit is one record, one finding, one scope item, or one release action.
- When a skill has more units than one form can show, the form is repeated: one
  page per unit, or per small group of units that are decided together, in
  priority order.
- Each page opens with a map line naming the unit, its position in the total, and
  how many remain, so the developer can see the shape of what is being asked and
  can stop at any page.
- A field label carries the option text, never a compressed stand-in for it. The
  proposal and its evidence appear above the fields, not inside a label.
- Every page keeps a free-text field, so a unit the options do not express is
  still answerable.
- **Edit** on a unit displays the revised text and asks again before it is
  written. **Skip** settles that unit only.
- Pages are ordered by priority, highest first, and every earlier answer stands
  when a later page is shown; the pages are not re-litigated.
- The skill's own limit on questions governs when a unit is split, so a skill
  never asks more than it would have asked in one form; the change is the number
  of turns, not the number of questions.

## Rationale

A form is the only place the developer can veto one item instead of a blanket
answer. That veto needs the item's cost in front of them, and the cost of eleven
findings, six records, and a release tail does not fit in a label without being
compressed away. Splitting into pages keeps each unit's full text visible, which
is what decision 0004 was buying. The cost is more turns; the alternative is a
compliant form that the developer cannot actually decide with.

## Alternatives considered

- Keep one form and raise its field limit — the limit was never the constraint;
  the compression of option text was. A bigger form invites a bigger batch.
- Ask one question per turn with no map line — a scope interview that never ends
  has no visible total, and the developer cannot tell whether the last answer
  closed the matter.
- Let the agent judge the batch size — that is the state decision 0004 found,
  where the trigger existed but the batch size was unbounded.
- Use a single form with a section per unit — a section is still one screen; the
  developer answers the section by momentum, which is the failure the form
  exists to prevent.

## Consequences

- `discover`, `record`, `recall`, `review`, `frame`, `init-project`, and
  `release` state the unit rule; `skills/record/references/questions.md` carries
  the full form shape, field budget, and map line the skills point at.
- `test/skills.test.js` fails a skill that claims to settle a batch in one form.
- Every choice turn can take several form rounds; the map line keeps the total
  visible so the developer can stop where they like.