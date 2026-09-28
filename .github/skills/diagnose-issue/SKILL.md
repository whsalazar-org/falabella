---
name: diagnose-issue
description: Turn a reported problem or error with this framework into an evidence-backed root cause, localized to the frontend, gateway, API, provider stub, or Compose wiring. Use when triaging a bug report or issue, when a symptom needs to be traced to a layer, or before proposing any fix.
---

# Diagnose an issue

Take a prose problem report and produce a root cause backed by evidence you
actually observed. A diagnosis without a reproduction or a cited line is a
guess, and a guess is worse than "not reproducible".

Read `.github/copilot-instructions.md` first for the architecture and the stack
boundaries. This skill is the procedure.

## Step 1 — Extract the report

Pull these out of the issue and write down which ones are missing:

- the symptom, in observable terms (status code, error text, blank screen);
- expected behaviour versus actual behaviour;
- reproduction steps, and whether they run under `make dev` or `make test-e2e`;
- the entry point used — the browser, the gateway (`:8000/api`), or something
  bypassing it;
- environment: model provider, `NEXT_PUBLIC_API_BASE_URL`, relevant env vars;
- logs, stack traces, or gateway responses.

Missing information is a finding, not a blocker. Name it and proceed with what
you have.

## Step 2 — Localize by layer

The topology is fixed, so the symptom usually names the suspect:

| Symptom | First suspect |
| --- | --- |
| 404, or a path reaching the API with `/api` still attached | `kong/kong.yml` |
| JSON error body, wrong status, bad validation on `/v1/*` | `backend/main.go` |
| UI renders wrong, or no request leaves the browser | `frontend/src/app/page.tsx` |
| Service unreachable, wrong env default, startup failure | `compose.yml`, `compose.e2e.yml` |
| Unexpected completion content in E2E runs only | `mock-provider/main.go` |
| Upstream 401/429/5xx surfaced to the user | provider credentials, then `backend/main.go` error mapping |

Two boundary violations are themselves root causes: the frontend calling the Go
API directly instead of the gateway, and provider credentials reaching the
browser. Check for both before anything subtler.

## Step 3 — Reproduce

Prefer the cheapest reproduction that shows the symptom:

```sh
cd backend && go test ./... -run <TestName>   # handler and validation defects
make test                                     # go test + eslint
make test-e2e                                 # behaviour across the real stack
```

For a live probe, bring the stack up with `make e2e-up` and drive it through the
gateway:

```sh
curl -i http://localhost:8000/api/health
curl -i -X POST http://localhost:8000/api/v1/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

Always reproduce through `:8000/api` first, because that is the path the
frontend uses. Only hit `:8080` afterwards, as a bisection step to decide
whether the gateway or the API owns the fault. Tear down with `make e2e-down`.

If you cannot reproduce it, stop and report that. Do not patch a symptom you
have never observed.

## Step 4 — Isolate

Narrow from layer to line:

1. Confirm which hop fails — gateway versus API versus provider — by comparing
   the `:8000/api` response with the same request against `:8080`.
2. Read the handler or component that owns the failing hop and identify the
   exact branch taken.
3. Explain why that branch is reached for this input, citing `file:line`.
4. Check the E2E suite: if a spec already covers this surface and passes, the
   real defect may be in the untested branch next to it. Say which.

## Step 5 — Classify

Pick exactly one:

- **Code defect** — logic, validation, or error mapping is wrong.
- **Config defect** — `kong/kong.yml` or Compose declares the wrong thing.
- **Wiring defect** — services, env vars, or URLs point at the wrong place.
- **Boundary violation** — a stack rule in the instructions is broken.
- **User or environment error** — the framework behaves as designed.
- **Missing feature** — the behaviour was never implemented.
- **Not reproducible** — with the exact commands you tried.

## Output format

````
### Diagnosis

| Symptom | Layer | Root cause | Evidence | Classification | Confidence |
| --- | --- | --- | --- | --- | --- |
| 404 on POST /api/v1/chat | gateway | `/api` prefix is not stripped for the new route | kong/kong.yml:31 — route lacks `strip_path` | Config defect | High |

Reproduction
- <exact command(s)>, outcome: <observed result>

Ruled out
- <layer or hypothesis> — <why>

Information still needed
- <question, or "none">
````

One row per distinct symptom, not one per file read. State confidence honestly;
"medium, because I could not reproduce the provider timeout" is a useful
diagnosis, and a confident wrong one is not.
