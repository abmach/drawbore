# How to ask: one unit per form

Every skill ends a choice turn in a rendered form (decision 0004). This file says
what that form may carry and how to split what does not fit (decision 0006).

## The rule

**One form carries one decidable unit.** A unit is one decision the developer can
take or refuse as a whole, with everything needed to decide it visible on that
same screen: the proposal, its evidence, the target, and the cost of each option.

A unit is one of:

| Kind of unit | Example |
| --- | --- |
| One record | a glossary entry, a principle, one decision, one current-behavior line |
| One finding | a review item with its `path:line`, severity, effort, and fix |
| One scope question | a Change Brief purpose, boundary, change point, or acceptance condition |
| One release action | the commit, the push, the tag |
| One scaffolding answer | the package name, the repository path |

A unit is *not* a whole artifact when the artifact holds several facts. Six
glossary entries are six units. Eleven findings are eleven units. The six
artifact files a discovery pass can write are six units, not one.

## Split, do not compress

When more than one unit is pending, the form repeats:

- One page per unit, or one page per small group of units that are genuinely
  decided together — a decision and the current-truth artifact that records it,
  for instance, which decision 0005-style atomic proposals already require.
- Pages are ordered by priority, highest first: the unit the developer most needs
  to weigh comes first, not the first one the scan happened to produce.
- Every page ends the turn. The developer answers, then the next page is shown.
  Never render two pages in one turn.
- An earlier answer stands. When page three is shown, page one is settled; do not
  restate it or reopen it.
- A page the developer skips settles that unit as skipped, not as deferred to a
  later page of the same pass.

## The map line

Every page opens with one line, above everything else:

```
Scope question 2 of 7 · 5 remaining · purpose
```

It carries the unit's position, how many remain, and the unit's name. The
developer can see how much is left and stop at any page without wondering
whether the answer just settled the whole matter. The line is prose, not a
field.

## Field budget

- **At most 7 fields on a page.** A field is a checkbox group, a radio group, a
  text input, a textarea, or a select.
- **At most 3 heavy fields.** A heavy field is a checkbox group with more than
  three choices, a select with more than five options, or a textarea.
- A page over budget is two units. Split it; do not shrink the labels.

## Labels carry text, never summaries

The developer is reading the form to decide, not to be reminded.

- The proposal, its evidence, and its target appear as text **above** the fields.
  They are the reason the question is being asked; the fields only answer it.
- A field label states the option in the words that will be used if it is
  chosen — the record's actual wording, the finding's actual claim. It is never a
  compression of that text into "apply", "yes", or a truncated phrase.
- When an option is a record's text, the label repeats the text or the field is
  followed by that text on the same page. A label the developer cannot judge
  without scrolling up is a label that lost the decision.
- Every page keeps a free-text field, always. Options are a menu, not the menu.

## The unit form

One page for one unit:

```html
<form>
  <p>Scope question 2 of 7 · 5 remaining · glossary: "Change Brief"</p>

  <p><strong>Proposal.</strong> New glossary entry under <code>.drawbore/glossary.md</code>:</p>
  <pre><strong>Change Brief</strong>:
  Transient scope record under .drawbore/work/, shaped by frame and settled
  after acceptance.</pre>

  <p><strong>Evidence.</strong> frame skill line 41 and record skill line 97 both
  describe the artifact; no glossary entry names it yet.</p>

  <fieldset>
    <legend>What to do with this entry</legend>
    <label><input type="radio" name="glossary_entry" value="apply" checked> Apply as proposed</label>
    <label><input type="radio" name="glossary_entry" value="edit"> Edit the wording</label>
    <label><input type="radio" name="glossary_entry" value="skip"> Skip — leave glossary.md unchanged</label>
  </fieldset>

  <label>Wording to use instead, if you chose Edit
    <textarea name="glossary_entry_text" rows="4"></textarea></label>
</form>
```

The shape is always the same, whatever the skill:

1. the map line;
2. the proposal and its evidence, as text;
3. one radio or checkbox group for the decision on this unit;
4. one free-text field, mandatory whenever a wording decision is possible.

## Edit, skip, apply

- **Apply** approves exactly the text displayed above the fields. Not a paraphrase
  of it, not the skill's summary of it.
- **Edit** is a request for different wording, never consent to write. Display the
  revised text as a new page and obtain approval of that page before writing.
  The revised page carries its own map line and its own apply/skip group.
- **Skip** changes nothing and settles this unit only. A skipped record is still
  an existing path: never delete a file because its unit was skipped.
- A **free-text answer** that is not one of the options is read as the answer to
  this unit and confirmed in the same way an **edit** is.

## What the developer is answering

The form is the unit's only question. Everything the skill already knows — the
scan result, the file list, the ranked table — is context printed above the map
line or above the unit, never re-asked as a field. A ranked table of eleven
findings with one checkbox per row is eleven units wearing one form; the table
belongs to the report, and the forms belong to the decisions.

## When there is no form tool

Ask in plain text and stop until the developer answers. Keep the same unit: one
unit per message, the map line first, the proposal and evidence above the
question, and a line inviting wording in the developer's own words.

## What never changes

- The form is mandatory on a choice turn (decision 0004); splitting into pages is
  not a way around the trigger.
- One unit per form is not permission to ask a skill's questions twice: the skill's
  own limit on how many questions it asks still governs, and the split changes
  the number of turns, not the number of decisions.
- The developer's exact wording always wins over the skill's draft.