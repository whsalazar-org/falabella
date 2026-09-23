---
name: assess-e2e-coverage
description: Decide whether the existing Playwright end-to-end suite already covers the behaviour a diff changes, and report covered / partially covered / uncovered with reasoning. Use when reviewing a pull request in this repository, when asked whether a change needs a new E2E test, or before authoring one.
---

# Assess E2E coverage

Judge whether `frontend/e2e/` already proves the behaviour a diff changes.
Produce a verdict with evidence — never a guess.

## Inputs you need

- The diff (`git diff --name-only --diff-filter=d <base>...HEAD` plus the patch).
- `frontend/e2e/coverage-map.yml` — the authoritative source/spec mapping.
- The spec files the map points at.

## Step 1 — Classify every changed file

Apply `change_rules` from the coverage map, in this order:

1. If the path matches an `exempt` glob, it is **not** E2E-relevant. Stop.
2. If it matches a `relevant` glob, it is E2E-relevant.
3. Otherwise it is out of scope.

Do not invent extra rules. If a path feels relevant but no glob matches, that is
itself a finding: the rules need updating.

## Step 2 — Classify the changed *behaviour*, not just the file

For each E2E-relevant file, read the patch and name what observably changed:

- a new or altered API route, status code, or response shape;
- a new or altered validation rule;
- a new or altered user-visible element, state, or flow;
- a change in gateway routing or service wiring;
- refactoring with identical observable behaviour.

Pure refactoring with no observable change is **covered by definition** if the
file already maps to a feature — say so explicitly rather than demanding a test.

## Step 3 — Resolve against the map

For each E2E-relevant file, find the features whose `paths` globs match, then
open their `specs`. Ask the specific question: *does an existing assertion fail
if this new behaviour regresses?*

Matching a feature's `paths` proves the **file** is mapped. It does not prove
the **new behaviour** is asserted. Keep the two apart.

## Step 4 — Verdict per behaviour

- **Covered** — an existing assertion would fail if the behaviour regressed.
  Cite the spec file and the test title.
- **Partially covered** — the surface is exercised but the new branch, field,
  state, or error path is not asserted. Name the precise missing assertion.
- **Uncovered** — no spec touches the behaviour, or no feature `paths` glob
  matches the file at all.

## Step 5 — Check for map drift

Also report, as problems:

- a `specs` entry that does not exist on disk;
- a spec missing the `@<feature-id>` tag its feature requires;
- a spec using a tag the map does not declare;
- a new source directory that no `relevant`/`exempt` glob classifies.

`cd frontend && npm run e2e:coverage -- --base <base>` performs these mechanical
checks; run it to confirm your reading.

## Output format

```
### E2E coverage assessment

| Change | Behaviour | Verdict | Evidence |
| --- | --- | --- | --- |
| backend/main.go | POST /v1/chat rejects >100 messages | Covered | e2e/chat-errors.spec.ts — "the API rejects an empty message list" |

Gaps
- <behaviour> — uncovered. Suggested spec: `frontend/e2e/<name>.spec.ts`,
  feature id `@<id>`, scenario: <one sentence>.

Map problems
- <problem or "none">
```

Keep it short. One row per behaviour, not one per line of diff. If everything is
covered, say so plainly and recommend no new test — a needless test is a cost,
not a win.
