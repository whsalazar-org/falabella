# E2E suite conventions

Playwright specs for the Nova AI control-plane demo. Read this before adding or
changing anything in `frontend/e2e/`.

## What these tests are

Full-stack tests. They drive the real Compose stack — the browser hits the
Next.js app on `:3000`, and API assertions go through the **Kong gateway** on
`:8000/api`. The Go API is never addressed directly, so gateway routing stays
part of what the suite proves.

## Running locally

```sh
make test-e2e            # start stack, run suite, tear down
make e2e-up              # keep the stack up while iterating
cd frontend && npm run test:e2e
cd frontend && npm run test:e2e:ui
make e2e-down
```

The suite needs no real provider key: `compose.e2e.yml` points `AI_API_URL` at
`mock-provider`, a deterministic OpenAI-compatible stub.

## Provider stubbing

Prefer the `mock-provider` service over Playwright route interception. Route
interception hides the gateway and API from the test; the stub keeps the whole
path real while staying deterministic.

- Any prompt containing `trigger-provider-failure` makes the stub answer with a
  502 and an error body. Use `providerFailurePrompt` from `fixtures.ts`.
- Any other prompt yields `Mock answer from <model>: <prompt>`, so assertions
  can check that the selected model and prompt actually reached the provider.
- Add new deterministic behaviours to `mock-provider/main.go` as explicit
  markers; never make the stub time-, random-, or order-dependent.

## Selector strategy

In priority order:

1. `getByRole` with an accessible name.
2. `getByLabel` for form controls — the app already labels `Tenant`, `Model`,
   and `Message`.
3. `getByText` for static copy.

Never select on CSS-module class names: they are hashed at build time and are
not a stable contract.

## File and naming conventions

- One spec per feature: `frontend/e2e/<feature>.spec.ts`.
- Shared constants and helpers live in `frontend/e2e/fixtures.ts`. Reuse
  `apiBaseUrl`, `expectedModels`, `openPlayground`, and `sendPrompt` rather than
  re-deriving them.
- Test titles read as behaviour statements ("the API rejects an unsupported
  model"), not as implementation notes.
- Keep specs independent: no shared mutable state, no ordering assumptions.

## Tagging and the coverage map — required

Every `test.describe` block must carry the tag of the feature it covers:

```ts
test.describe("chat completion", { tag: "@chat-completion" }, () => { ... });
```

The tag must match a feature `id` in `frontend/e2e/coverage-map.yml`, and that
feature must list the spec file under `specs`. `frontend/scripts/e2e-coverage-gate.mjs`
fails when:

- a mapped spec does not exist or lacks its feature tag;
- a spec uses a tag that the map does not declare;
- an E2E-relevant changed path matches no feature `paths` glob.

So adding a spec is always two edits: the spec file **and** the coverage map.

## Adding coverage for a new behaviour

1. Decide the level. API-only behaviour (validation, status codes, gateway
   routing) → `request`-based test. User-visible behaviour → browser test.
   Behaviour that spans both gets one of each in the same spec.
2. Reuse an existing feature when the behaviour belongs to it; add a new feature
   id only when the surface is genuinely new.
3. Extend `paths` on the feature so the changed source files resolve to it.
4. Run `make test-e2e` and `make e2e-coverage` before opening the pull request.
