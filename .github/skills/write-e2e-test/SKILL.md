---
name: write-e2e-test
description: Author a new Playwright end-to-end test for this repository and wire it into the coverage map. Use after assess-e2e-coverage reports a gap, when the E2E coverage gate fails, or whenever a change to the frontend, API, gateway, or Compose stack needs new end-to-end coverage.
---

# Write an E2E test

Produce a spec that fails if the new behaviour regresses, and a coverage-map
entry that makes it machine-checkable. Both edits are required; one without the
other is an incomplete change.

Read `frontend/e2e/AGENTS.md` first — it is the authoritative style guide for
selectors, fixtures, and stubbing. This skill is the procedure.

## Step 1 — Locate the affected surface

From the diff, name exactly what changed and where it is observable:

| Changed | Observable at |
| --- | --- |
| `backend/main.go` handler or validation | `GET|POST` through `http://localhost:8000/api` |
| `kong/kong.yml` | gateway routing — path stripping, new routes |
| `frontend/src/app/page.tsx` | the rendered playground |
| `compose*.yml` | service wiring, environment defaults |
| `mock-provider/main.go` | provider responses consumed by the API |

## Step 2 — Choose the level

- **API-level** (`request` fixture) for status codes, error bodies, validation,
  and routing. Always go through the gateway prefix (`apiBaseUrl` from
  `fixtures.ts`), never straight to `:8080`.
- **Browser-level** (`page` fixture) for anything a user sees or does.
- **Both** when a change alters an API contract *and* how the UI renders it.

Prefer the cheapest level that still fails on regression.

## Step 3 — Decide new feature vs. extend existing

Open `frontend/e2e/coverage-map.yml`.

- The behaviour belongs to an existing feature → add tests to that feature's
  spec, and extend its `paths` if new source files are involved.
- The surface is genuinely new → add a new feature with a kebab-case `id`, a
  one-line `description`, `paths` globs for the source it covers, optional
  `api_routes`, and the new spec under `specs`.

Do not create a feature per test. Features describe behaviour areas.

## Step 4 — Write the spec

Create or extend `frontend/e2e/<feature>.spec.ts`:

- Import shared helpers from `./fixtures` — `apiBaseUrl`, `expectedModels`,
  `openPlayground`, `sendPrompt`, `providerFailurePrompt`. Add new shared values
  there rather than duplicating them across specs.
- Wrap the tests in `test.describe("<area>", { tag: "@<feature-id>" }, ...)`.
  The tag is mandatory and must match the map.
- Select by role, then label, then text. Never by CSS-module class.
- Assert on observable outcomes — rendered text, status codes, response bodies —
  not on implementation details.
- Keep each test independent and free of arbitrary waits; rely on Playwright's
  auto-waiting `expect`.

If the new behaviour needs a provider response the stub cannot produce, extend
`mock-provider/main.go` with an explicit deterministic marker (as
`trigger-provider-failure` does) and document it in `frontend/e2e/AGENTS.md`.

## Step 5 — Wire the coverage map

Add or update the feature entry so every changed source path resolves to it.
Globs are repository-root relative; `specs` are relative to `frontend/`.

## Step 6 — Validate

```sh
make test-e2e                          # the suite against the real stack
make e2e-coverage BASE=origin/main     # map consistency + changed-path resolution
cd frontend && npm run lint
```

Then confirm the test is meaningful: temporarily revert the production change
(or break it) and check the new test fails. A test that passes against the old
behaviour is not coverage.

## Step 7 — Report

State the feature id, the spec path, the scenarios added, and the commands you
ran with their outcome.
