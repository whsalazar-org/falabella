# Copilot instructions — Nova AI control-plane demo

## What this repository is

A reference AI control-plane demo. A tenant-scoped, approved agent moves from
its frontend configuration, through an API gateway, to an OpenAI-compatible
chat-completions provider.

```text
Next.js frontend (:3000)  ->  Kong AI Gateway (:8000/api)  ->  Go Entity API (:8080)  ->  model provider
                                                                     |
                                                                     +-> Langfuse traces (optional)
```

## Stack boundaries

| Area | Path | Notes |
| --- | --- | --- |
| Frontend | `frontend/src/app/` | Next.js App Router, client component, CSS modules. Talks only to `NEXT_PUBLIC_API_BASE_URL` (the gateway). |
| Gateway | `kong/kong.yml` | Declarative Kong config; `/api` is stripped and proxied to the API. |
| API | `backend/main.go` | Go `net/http` with `GET /health`, `GET /v1/models`, `POST /v1/chat`. No database. |
| Provider stub | `mock-provider/main.go` | Deterministic OpenAI-compatible stub used by the E2E suite only. Never used in `make dev`. |
| Orchestration | `compose.yml`, `compose.e2e.yml` | Base stack and the E2E override. |

The frontend must never call the Go API directly, and the API must never be
given provider credentials from the browser.

## Checks

```sh
make test        # go test + eslint
make build       # go build, next build, compose validation
make test-e2e    # Playwright against the Compose stack + mock provider
make e2e-coverage BASE=origin/main   # coverage gate
```

Run `make test` and `make build` for any change to `backend/`, `frontend/`, or
`mock-provider/`. Run `make test-e2e` whenever behaviour changes.

## E2E coverage policy

The repository keeps a machine-checkable map between behaviour-bearing source
and the Playwright specs that exercise it:
**`frontend/e2e/coverage-map.yml`**.

A change is **E2E-relevant** when it touches `backend/**`,
`frontend/src/app/**`, `kong/kong.yml`, `compose.yml`, `compose.e2e.yml`, or
`mock-provider/**`, and is not exempt (markdown, Dockerfiles, `*_test.go`,
lockfiles — the authoritative lists live in `change_rules` in the map).

For every E2E-relevant pull request you must either:

1. point at the existing feature(s) in the coverage map that already cover the
   changed behaviour; or
2. add or extend a spec in `frontend/e2e/` **and** update the coverage map so
   the changed paths resolve to a feature.

A behaviour-changing pull request that adds no coverage and updates no map entry
is incomplete. `.github/workflows/e2e.yml` enforces this with
`frontend/scripts/e2e-coverage-gate.mjs`; Copilot code review flags it
advisorily before CI does.

The escape hatch is the `e2e-coverage: not-required` label plus a comment
justifying it. Use it only for changes with no observable behaviour.

## Working on the E2E suite

`frontend/e2e/AGENTS.md` is the authoritative guide for selectors, fixtures,
provider stubbing, naming, and tagging. Read it before touching
`frontend/e2e/`.

Two repository skills exist for this workflow:

- `.github/skills/assess-e2e-coverage/` — decide whether a diff is already
  covered.
- `.github/skills/write-e2e-test/` — author the missing spec and map entry.

`.github/agents/e2e-test-author.md` composes both and can be invoked from a pull
request comment as `@e2e-test-author`.

## Code conventions

- Go: standard library first; no new dependencies without a clear need. Handlers
  stay on `*server`; errors return JSON via `writeError`.
- TypeScript: strict mode, no `any`, no default exports for helpers, and no new
  runtime dependencies for the frontend.
- Comments explain *why*, not *what*, and only where the reason is non-obvious.
- Keep diffs surgical; do not reformat untouched code.
