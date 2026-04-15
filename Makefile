.PHONY: release release-patch release-minor release-major release-list \
        install dev test lint

# ── Release ──────────────────────────────────────────────────────────────────

release:
	@./scripts/release

release-patch:
	@./scripts/release --patch

release-minor:
	@./scripts/release --minor

release-major:
	@./scripts/release --major

release-list:
	@./scripts/release --list

release-dry:
	@./scripts/release --dry-run

# ── Dev ───────────────────────────────────────────────────────────────────────

install:
	pnpm install

dev:
	pnpm --filter @hooky/server dev

test:
	pnpm --filter @hooky/server test
	pnpm --filter webhooky test
	pnpm --filter web typecheck

lint:
	pnpm --filter @hooky/server exec biome check src
