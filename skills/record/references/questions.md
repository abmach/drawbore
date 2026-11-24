# How to ask: one unit per page

Every skill ends a choice turn in a rendered form (decision 0004). This file says
how to collect several decisions without spending one model turn per decision
(decision 0008).

## The rule

**One form carries all pending decidable units at once, with one unit per page.**
A unit is one decision the developer can take or refuse as a whole, with
everything needed to decide it visible on that page: the proposal, its evidence,
the target, and the cost of each option.

A unit is one of:

| Kind of unit | Example |
| --- | --- |
| One record | a glossary entry, a principle, one decision, one current-behavior line |
| One finding | a review item with its `path:line`, severity, effort, and fix |
| One scope question | a Change Brief purpose, boundary, change point, or acceptance condition |
| One release action | the commit, the push, the tag |
| One scaffolding answer | the package name, the repository path |

Six glossary entries are six units. Eleven findings are eleven units. The six
artifact files a discovery pass can write are six units, not one.

## One form, one submission

- Put every pending unit in **one `<form>`**.
- Represent each unit as a **top-level `<fieldset>`**. When the harness supports
  a tabbed form, two or more top-level fieldsets appear as one tab per unit and
  a Review tab. A field outside the fieldsets becomes another tab.
- Give every control a unique `name`; two units cannot share one control name.
- Keep the unit's context inside its fieldset so the page carries the complete
  decision.
- Let the developer review and submit the whole form in one interaction. Do not
  end the model turn after each page and do not request another form for the
  next unit.

Never emit multiple `<form>` elements: the question tool consumes only the
first form. The fieldsets are pages within that one form.

## Page order and map line

Order units by priority, highest first: the unit the developer most needs to
weigh comes first, not the first one the scan happened to produce.

Every page opens with one line, above everything else in its fieldset:

```
Scope question 2 of 7 · 5 remaining · purpose
```

It carries the unit's position, how many remain, and the unit's name. The
developer can see how much is left and stop at any page without wondering
whether the answer settled the whole matter. The line is prose, not a field.

## Field budget

- **At most 7 fields on a page.** A field is a checkbox group, a radio group, a
  text input, a textarea, or a select.
- **At most 3 heavy fields.** A heavy field is a checkbox group with more than
  three choices, a select with more than five options, or a textarea.
- A page over budget is two units. Split it; do not shrink the labels.

## Labels carry text, never summaries

The developer is reading the form to decide, not to be reminded.

- The proposal, its evidence, and the target appear as text **above the fields**.
  They are the reason the question is being asked; the fields only answer it.
- A field label states the option in the words that will be used if it is
  chosen — the record's actual wording, the finding's actual claim. It is never
  a compression of that text into "apply", "yes", or a truncated phrase.
- When an option is a record's text, the label repeats the text or the field is
  followed by that text on the same page. A label the developer cannot judge
  without scrolling up is a label that lost the decision.
- Every page keeps a free-text field, always. Options are a menu, not the menu.

## The unit page

One fieldset for one unit inside one form:

```html
<form>
  <fieldset>
    <legend>Scope question 2 of 7 · 5 remaining · glossary: "Change Brief"</legend>

    <p><strong>Proposal.</strong> New glossary entry under <code>.drawbore/glossary.md</code>:</p>
    <pre><strong>Change Brief</strong>:
    Transient scope record under .drawbore/work/, shaped by frame and settled
    after acceptance.</pre>

    <p><strong>Evidence.</strong> frame skill line 41 and record skill line 97 both
    describe the artifact; no glossary entry names it yet.</p>

    <label><input type="radio" name="glossary_entry_2" value="apply" checked> Apply as proposed</label>
    <label><input type="radio" name="glossary_entry_2" value="edit"> Edit the wording</label>
    <label><input type="radio" name="glossary_entry_2" value="skip"> Skip — leave glossary.md unchanged</label>

    <label>Wording to use instead, if you chose Edit
      <textarea name="glossary_entry_2_text" rows="4"></textarea></label>
  </fieldset>
</form>
```

The shape is always the same, whatever the skill:

1. the map line as the fieldset legend or the first paragraph;
2. the proposal and its evidence, as text;
3. one radio or checkbox group for the decision on this unit;
4. one free-text field, mandatory whenever a wording decision is possible.

## Apply, edit, skip

- **Apply** approves exactly the text displayed above the fields. Not a
  paraphrase of it, not the skill's summary of it.
- **Edit** is a request for different wording, never consent to write. Collect
  edit requests from the submitted form, then display the revised proposals in
  a second form containing only those revisions, one unit per page, and obtain
  explicit approval before writing. This follow-up turn happens only when the
  developer requested an edit.
- **Skip** changes nothing and settles that unit only. A skipped record is still
  an existing path: never delete a file because its unit was skipped.
- A **free-text answer** that is not one of the options is read as the answer to
  that unit and confirmed in the same way as an **edit**.

## What the developer is answering

The form's pages are the questions. Everything the skill already knows — the
scan result, the file list, the ranked table — is context inside the relevant
unit's fieldset, never re-asked as a field. A ranked table of eleven findings
with one checkbox per row is eleven units wearing one form; the table belongs
to the report, and the unit fieldsets belong to the decisions.

## When there is no form tool

Ask in plain text and stop until the developer answers. Keep the same unit: one
unit per message, the map line first, the proposal and evidence above the
question, and a line inviting wording in the developer's own words.

## What never changes

- The form is mandatory on a choice turn (decision 0004); pagination is not a
  way around the trigger.
- One unit per page is not permission to ask a skill's questions twice: the
  skill's own limit on how many questions it asks still governs.
- The developer's exact wording always wins over the skill's draft.
- An answer approves only the unit it belongs to. Batch submission never turns
  one unit's answer into consent for another unit.
