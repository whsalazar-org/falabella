# GitHub Copilot Features: Repository Demo

This walkthrough uses the Nova AI control-plane demo to explain four GitHub
Copilot concepts:

- **MCP (Model Context Protocol)** — a standard way for Copilot to discover and
  call tools or retrieve context from external systems.
- **Custom Extensions** — repository-specific instructions, agents, and
  integrations that tailor Copilot to a team's workflow.
- **Skills** — reusable, focused procedures that teach Copilot how to perform a
  particular task.
- **Agent Toolchains** — a composed workflow in which an agent uses instructions,
  skills, tools, and validation commands to complete work safely.

The repository already contains the building blocks for custom extensions,
skills, and a toolchain. It does not ship an MCP server; the MCP portion of the
demo uses a configured MCP client/server in the Copilot environment.

## Repository in one minute

```text
Browser
  -> Next.js frontend (:3000)
  -> Kong gateway (:8000/api)
  -> Go API (:8080)
  -> OpenAI-compatible provider
                         \
                          -> optional Langfuse traces
```

Useful locations:

| Concern | Repository example |
| --- | --- |
| Product and architecture context | `README.md` |
| Persistent Copilot guidance | `.github/copilot-instructions.md` |
| Custom agents | `.github/agents/` |
| Reusable skills | `.github/skills/` |
| E2E-specific operating procedure | `frontend/e2e/AGENTS.md` |
| Full-stack validation | `Makefile`, `compose.e2e.yml` |
| Gateway boundary | `kong/kong.yml` |

## Feature overview

### MCP

MCP separates a model from the implementation details of a tool. An MCP
server advertises typed tools and resources; Copilot decides when to call them,
subject to the user's permissions and the server's configuration.

For this demo, configure an MCP server that can read repository files or query
GitHub Actions. Then ask:

> “Using the repository context and the latest workflow result, explain how the
> E2E stack is validated.”

The expected result is a grounded explanation that cites `Makefile`,
`compose.e2e.yml`, and the workflow result rather than inventing commands.
MCP is an integration boundary, not a replacement for the repository's source
files or test suite.

### Custom Extensions

Custom extensions make Copilot behave like a repository-aware teammate. This
repository demonstrates that through:

- `.github/copilot-instructions.md` for architecture boundaries, conventions,
  security rules, and required checks.
- `.github/agents/issue-diagnostician.md` and
  `.github/agents/e2e-test-author.md` for specialized agent entry points.
- The GitHub MCP tools used by the development environment for issues, pull
  requests, Actions, and repository files.

An extension should narrow the agent's operating context and permissions. It
should not bypass the gateway, put provider credentials in the browser, or
weaken tests.

### Skills

A skill is a focused playbook that an agent can apply repeatedly. The E2E
coverage skill at `.github/skills/assess-e2e-coverage/SKILL.md` is a concrete
example: it defines inputs, classifies changed files, resolves behavior to the
coverage map, and produces a covered/partially-covered/uncovered verdict.

The companion `write-e2e-test` skill turns an identified gap into a Playwright
spec and a matching `frontend/e2e/coverage-map.yml` entry. Skills are narrower
than agents: a skill describes a procedure; an agent coordinates that
procedure with tools and repository context.

### Agent Toolchains

An agent toolchain is the end-to-end path from request to verified change. In
this repository the E2E coverage toolchain is:

1. Repository instructions establish the architecture and non-negotiable
   boundaries.
2. A specialized agent selects the relevant skill.
3. The skill reads the diff and coverage map.
4. The agent uses repository tools to inspect or edit only the allowed files.
5. `make test-e2e` runs the real Compose stack with the deterministic
   `mock-provider`.
6. `make e2e-coverage BASE=origin/main` checks that behavior is mapped.

This is more than a prompt: each stage has an explicit input, output, and
failure condition.

## Live demo script

### 1. Start with the product boundary

**Say:**

> “This is a tenant-scoped AI control plane. The browser talks to Kong, Kong
> routes to the Go API, and only the API talks to the model provider.”

**Show:**

```sh
sed -n '30,54p' README.md
sed -n '15,26p' .github/copilot-instructions.md
cat kong/kong.yml
```

Point out that `/api` is stripped by Kong and that provider credentials are not
browser inputs.

### 2. Demonstrate custom instructions

**Ask Copilot:**

> “Where is the API boundary, and what must not happen when changing the
> frontend?”

**Expected result:** Copilot cites `.github/copilot-instructions.md` and says
that the frontend uses the gateway URL, not the Go API directly.

### 3. Demonstrate an MCP tool

With an MCP server enabled, **ask:**

> “List the latest CI workflow runs for this repository, then identify which
> command runs the browser suite.”

**Expected result:** Copilot uses the MCP GitHub/Actions tool and connects the
workflow to `make test-e2e` and `.github/workflows/e2e.yml`. If no MCP server is
enabled, explain that the same question can be answered from checked-in files,
but the live Actions lookup is unavailable.

### 4. Invoke a custom agent and skill

**Ask Copilot:**

> “Assess whether a change to `backend/main.go` that alters the chat error
> response needs a new E2E test.”

Walk through:

1. `e2e-test-author` identifies the E2E coverage task.
2. `assess-e2e-coverage` reads the diff, map, and matching specs.
3. The result names the exact behavior and gives a verdict.
4. If uncovered, `write-e2e-test` adds the spec and map entry.

Emphasize that the agent must not weaken an existing test or use browser route
interception when the mock provider can exercise the real gateway and API path.

### 5. Run the validation toolchain

For this documentation-only change, these are reference commands for the demo
rather than required execution. For an application change, run:

```sh
make test
make build
make test-e2e
make e2e-coverage BASE=origin/main
```

Explain that `compose.e2e.yml` replaces the real provider with
`mock-provider`, so the E2E suite is deterministic and does not require a real
provider key.

### 6. Close with the distinction

**Say:**

> “MCP connects Copilot to external tools and context. Custom extensions shape
> Copilot for this repository. Skills encode repeatable procedures. An agent
> toolchain composes all of them with tests and policy so the result is
> reviewable.”

## Demo checklist

- [ ] Show the frontend → gateway → API → provider path.
- [ ] Show the repository instructions and one custom agent.
- [ ] Show the E2E coverage skill and coverage map.
- [ ] Use MCP for one live repository or Actions lookup, if configured.
- [ ] Run or explain the validation commands.
- [ ] State which behavior is covered and where the evidence lives.

