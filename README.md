# AUDEBase

**Enterprise application platform. Microkernel + hot-pluggable architecture.** Build OA, ERP, MES, PLM, WMS applications on a unified platform. Inspired by Odoo, NocoBase, and YunBiao.

## Prerequisites

- **Node.js** 22+
- **pnpm** 10+ (`corepack enable && corepack prepare pnpm@10.33.3 --activate`)
- **Docker Desktop** (provides PostgreSQL 16 + Redis 7)

## Quick Start

```bash
# 1. Clone
git clone https://github.com/your-org/audebase.git
cd audebase

# 2. Configure environment
cp .env.template .env
# Edit .env — set AUDE_JWT_SECRET (32+ chars) and AUDE_DB_PASSWORD

# 3. Start infrastructure
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Run database migrations
pnpm db:migrate

# 6. Start development
pnpm dev
```

The kernel starts on `http://localhost:3000` and the Admin UI on `http://localhost:5173`.

## Project Structure

```
audebase/
├── packages/
│   ├── kernel/              # Fastify server, CLI, auth, CRUD API, plugin pipeline
│   ├── admin-ui/            # React 19 + Ant Design 5 management console
│   ├── shared-types/        # Shared TypeScript types and Zod schemas
│   ├── plugin-framework/    # Plugin lifecycle, host abstraction, trust groups
│   ├── plugin-core/         # Bootstrap plugin (admin user, default roles, system tenant)
│   ├── manifest-engine/     # manifest.yaml parsing and validation
│   ├── migration-engine/    # Database migration scanner, resolver, executor
│   ├── rbac/                # Role-based access control with route guards
│   ├── audit/               # Audit log service
│   ├── i18n/                # Internationalization engine
│   ├── health-check/        # Health check endpoints
│   └── logging-infra/       # Structured logging (pino)
├── docs/                    # Architecture, SDD, TDD, plans
├── docker-compose.yml       # PostgreSQL 16 + Redis 7
└── .env.template            # Environment variable template
```

## Available Scripts

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `pnpm dev`           | Start all packages in development mode (watch) |
| `pnpm build`         | Build all packages                             |
| `pnpm test`          | Run all tests (vitest)                         |
| `pnpm test:coverage` | Run tests with coverage report                 |
| `pnpm lint`          | Lint all packages                              |
| `pnpm lint:fix`      | Auto-fix lint issues                           |
| `pnpm format`        | Format code with Prettier                      |
| `pnpm format:check`  | Check formatting                               |
| `pnpm type-check`    | TypeScript type checking                       |
| `pnpm db:migrate`    | Run database migrations                        |
| `pnpm db:up`         | Start Docker services                          |
| `pnpm db:down`       | Stop Docker services                           |

## Architecture

```
AUDEBase
├── Plugin layer     OA │ ERP │ MES │ ... (hot-pluggable)
├── Service layer    RBAC │ Audit │ i18n │ Migration │ Health
├── Kernel           Plugin Framework (load/unload/dependency resolution)
└── Infrastructure   Node.js │ PostgreSQL │ Redis
```

Plugins run in four trust groups: SYSTEM (shared process), Domain (per business domain), Isolated (per third-party plugin), Container (sandboxed). See [docs/architecture.md](docs/architecture.md) for details.

## Phase Status

**Phase 1a complete** — 12 packages, 384 tests covering the full plugin lifecycle, RBAC, audit, i18n, migration, health checks, logging, and Admin UI. See [.agents/memorys/status.md](.agents/memorys/status.md) for the current state and roadmap.

## License

Apache 2.0
