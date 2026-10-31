---
title: "Drill: a project picker"
kind: drill
env: dom
summary: Two queries, the second depending on the first — variables, skip, and all the loading/error states.
focus: [ProjectPicker.tsx, preview.tsx]
readonly: [preview.tsx]
preview: preview.tsx
---

A dashboard widget: pick a project from a dropdown, see a summary of its issues. The lesson's example ran one query. This one needs **two**, and the second can't run until the user has chosen something.

Press **Run preview** any time — it renders your component against the live reference Taskforge API.

## Your task

Build `ProjectPicker` in `ProjectPicker.tsx` (export it by name).

**The dropdown**
- While the project list loads, show the text `Loading projects…`.
- Then render a `<select>` labelled **`Project`** (via `aria-label` or a `<label>`), with a first option `Choose a project…` (value `""`) followed by one option per project: the option's **text is the project's name** and its **value is the project's key**.

**The summary**, once a project is chosen:
- Don't query anything about a project **until one is chosen** (the tests check which operations you sent).
- While loading: `Loading summary…`.
- Then: a heading (`<h2>`) with the project's **name**, a paragraph `24 issues` (the project's `stats.total`), and a list with one `<li>` per status in the form `TODO: 7`, in the order the API returns them.
- If the summary query fails: an element with `role="alert"` containing `Couldn't load project:` followed by the error message.
- Choosing another project shows that project's summary.

Field names to use — `projects { key name }`, and `project(key: $key) { name stats { total byStatus { status count } } }`. (Add `id`s to object selections too; they'll matter next module.)

## Hints

### Waiting for a choice
`useQuery(PROJECT_SUMMARY, { variables: { key }, skip: !key })` — with `skip: true` the hook does nothing and returns `loading: false, data: undefined`.

### Controlled select
Keep the chosen key in `useState('')`, and render `<select value={key} onChange={(e) => setKey(e.target.value)}>`.

### Order of the early returns
For the summary section, check `loading`, then `error`, then render `data.project`. And remember the project list's own loading state is separate from the summary's.
