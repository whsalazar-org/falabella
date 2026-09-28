---
name: propose-fix
description: Turn a confirmed root cause into a reviewable fix proposal for this repository — the change, the layer it belongs in, its blast radius, the regression test, and the verification commands. Use after diagnose-issue identifies a defect, and before editing production code.
---

# Propose a fix

Convert a diagnosis into a proposal a reviewer can accept or reject without
rereading the whole investigation. Propose by default; implement only when the
requester asked for the fix, not just the analysis.

This skill requires a completed diagnosis with a reproduction. If the root cause
is unconfirmed, go back to `.github/skills/diagnose-issue/SKILL.md`.

## Step 1 — Fix the right layer

Repair the layer that owns the defect, not the one where the symptom surfaced:

| Root cause in | Fix in | Do not |
| --- | --- | --- |
| Routing, path stripping, proxy config | `kong/kong.yml` | compensate in the Go API |
| Handler logic, validation, error mapping | `backend/main.go` | work around it in the UI |
| Rendering, state, request construction | `frontend/src/app/` | change the API contract to suit the UI |
| Service wiring, env defaults | `compose.yml`, `compose.e2e.yml` | hard-code values in application code |
| Missing deterministic stub response | `mock-provider/main.go` | use Playwright route interception |

A compensating change in the wrong layer is a rejected proposal, even when it
makes the symptom disappear.

## Step 2 — Respect the conventions

- Go: standard library first; no new dependency without a stated need. Handlers
  stay on `*server`; errors go out through `writeError`.
- TypeScript: strict, no `any`, no default exports for helpers, no new frontend
  runtime dependency.
- The frontend talks only to `NEXT_PUBLIC_API_BASE_URL`; provider credentials
  never reach the browser.
- Keep the diff surgical. Do not reformat untouched code or fix unrelated
  pre-existing issues.

## Step 3 — Write the regression test first

For a code defect, a test that fails before the change and passes after it is
mandatory.

- Handler logic, validation, and error bodies → `backend/main_test.go`.
- Anything observable end to end → a Playwright spec, per
  `.github/skills/write-e2e-test/SKILL.md`.

Run the test against the unfixed code and record that it fails. A test written
after the fix, never seen red, proves nothing.

## Step 4 — Settle the E2E coverage obligation

If the change touches `backend/**`, `frontend/src/app/**`, `kong/kong.yml`,
`compose.yml`, `compose.e2e.yml`, or `mock-provider/**`, the proposal must
either cite the feature in `frontend/e2e/coverage-map.yml` that already asserts
the corrected behaviour, or add the spec and map entry.

The `e2e-coverage: not-required` label is not available for a behaviour fix. A
bug fix changes observable behaviour by definition.

## Step 5 — Verify

```sh
make test     # backend/, frontend/, mock-provider/ changes
make build    # same
make test-e2e # whenever behaviour changes
make e2e-coverage BASE=origin/main
```

Report each command's actual outcome. Never claim a fix works on the strength of
reading the diff.

## Output format

````
### Proposed fix

**Root cause** — <one sentence, from the diagnosis>
**Layer** — <file(s)> — <why this layer owns it>

**Change**
```diff
<minimal diff sketch>
```

**Regression test** — <path> — fails before the change because <reason>

**Blast radius** — <what else this touches, who else calls it>

**Alternatives rejected**
- <alternative> — <why not>

**E2E coverage** — <existing feature id, or the spec and map entry to add>

**Verification**
| Command | Result |
| --- | --- |
| make test | <pass/fail> |
````

If the defect is a design problem rather than a bug, say so and stop. Escalating
a bad boundary beats patching around it.
