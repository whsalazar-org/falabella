# Model Canvas

A small AI chat platform with a Next.js interface, Go API, Kong gateway, and
Langfuse observability. It works with any OpenAI-compatible chat-completions
provider and exposes a configurable model picker.

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

## Architecture

```text
Browser -> Next.js (:3000) -> Kong (:8000/api) -> Go API (:8080)
                                                    |
                                      model provider + Langfuse
```

The API includes `GET /health`, `GET /v1/models`, and `POST /v1/chat`.
Langfuse receives OpenTelemetry traces through its OTLP HTTP endpoint.

## Development checks

```sh
make test
make build
```
