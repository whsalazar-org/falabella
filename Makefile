.PHONY: dev test build test-e2e e2e-browsers e2e-up e2e-down e2e-coverage

COMPOSE_E2E := docker compose -f compose.yml -f compose.e2e.yml

dev:
	docker compose up --build

test:
	cd backend && go test ./...
	cd frontend && npm run lint

build:
	cd backend && go build ./...
	cd mock-provider && go build ./...
	cd frontend && npm run build
	docker compose config --quiet
	$(COMPOSE_E2E) config --quiet

# Brings the stack up against the deterministic mock provider, runs the
# Playwright suite, then tears the stack down.
test-e2e: e2e-browsers e2e-up
	cd frontend && npm run test:e2e; \
	status=$$?; \
	$(MAKE) -C $(CURDIR) e2e-down; \
	exit $$status

e2e-browsers:
	cd frontend && npx playwright install chromium

e2e-up:
	$(COMPOSE_E2E) up --build -d --wait

e2e-down:
	$(COMPOSE_E2E) down --volumes --remove-orphans

# Checks the coverage map against the suite and the changes on this branch.
e2e-coverage:
	cd frontend && npm run e2e:coverage -- --base $(or $(BASE),origin/main)
