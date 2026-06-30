# SmartSched — common Docker tasks (macOS / Linux; Windows users see DOCKER.md)
.PHONY: up down build logs reset migrate ps

up:        ## Build + start the whole stack
	docker compose up --build -d

down:      ## Stop the stack (keeps the database volume)
	docker compose down

build:     ## Rebuild images
	docker compose build

logs:      ## Tail logs for all services
	docker compose logs -f

ps:        ## Show running services
	docker compose ps

reset:     ## Stop AND wipe the database volume (re-runs all migrations on next up)
	docker compose down -v

migrate:   ## Apply all SQL migrations to a running db (for existing volumes)
	@for f in database/migrations/*.sql backend/db/migrations/*.sql; do \
		echo "→ applying $$f"; \
		docker compose exec -T db psql -U smartsched -d smartsched < "$$f"; \
	done
