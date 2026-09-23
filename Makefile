.PHONY: dev test build

dev:
	docker compose up --build

test:
	cd backend && go test ./...
	cd frontend && npm run lint

build:
	cd backend && go build ./...
	cd frontend && npm run build
	docker compose config --quiet
