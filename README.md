# Nova AI Control Plane Demo

A reference AI control-plane experience with a Next.js interface, Go entity
API, Kong gateway, and Langfuse observability. The playground demonstrates how
a tenant-scoped, approved agent moves from its frontend configuration through
the gateway to any OpenAI-compatible chat-completions provider.

## Run locally

1. Copy the environment template and add your provider key:

   ```sh
   cp .env.example .env
   ```

2. Optionally add Langfuse public and secret keys to `.env`. Tracing is disabled
   when they are omitted.
3. Start the stack:

   ```sh
   docker compose up --build
   ```

Open <http://localhost:3000>. Kong exposes the API at
<http://localhost:8000/api>; its admin endpoint is available on port `8001`.

`AI_MODELS` is a comma-separated list of model IDs supported by the configured
provider. Set `AI_API_URL` to use another OpenAI-compatible provider.

## Demo architecture

```text
Tenant workspace
      |
Next.js frontend (:3000)
      |
Kong AI Gateway (:8000/api)
      |
Go Entity API / BFF (:8080) -----> OpenAI-compatible model provider
      |
      +--------------------------> Langfuse traces (optional)
```

The interface maps the reference architecture into a focused demo:

- **Tenant management** is represented by the workspace tenant selector.
- **Approvals, artifact management, and provisioning** appear as the selected
  agent's policy status, artifact version, and model mapping.
- **Kong AI Gateway** exposes the API and routes playground requests.
- **Knowledge retrieval and OpenFGA** are identified as extension points rather
  than simulated integrations.
- **Langfuse** receives OpenTelemetry traces when credentials are configured.

The API includes `GET /health`, `GET /v1/models`, and `POST /v1/chat`.

## Development checks

```sh
make test
make build
```
