# AUDEBase MVP Docker image — see docker-compose.yml for orchestration

FROM node:22-alpine

# Runtime dependencies for bootstrap script (nc = netcat for port checks)
RUN apk add --no-cache netcat-openbsd

# Install pnpm

WORKDIR /app

# Copy monorepo files for pnpm workspace resolution
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/core/tsconfig.json packages/core/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/plugin-framework/package.json packages/plugin-framework/
COPY packages/plugin-core/package.json packages/plugin-core/
COPY packages/manifest-engine/package.json packages/manifest-engine/
COPY packages/migration/package.json packages/migration/
COPY packages/rbac/package.json packages/rbac/
COPY packages/audit/package.json packages/audit/
COPY packages/i18n/package.json packages/i18n/
COPY packages/event-bus/package.json packages/event-bus/
COPY packages/plugin-communication/package.json packages/plugin-communication/
COPY packages/cron/package.json packages/cron/
COPY packages/websocket/package.json packages/websocket/
COPY packages/health-check/package.json packages/health-check/
COPY packages/logging-infra/package.json packages/logging-infra/

# Install dependencies (--frozen-lockfile ensures reproducibility)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ packages/

EXPOSE 3000

# The bootstrap script handles migration + kernel startup
CMD ["sh", "scripts/docker-bootstrap.sh"]
