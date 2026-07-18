-- --[[ Phase 1a database initialization ]]--
-- Applied on first container start via docker-entrypoint-initdb.d.
-- Creates extensions only; tables are managed by Drizzle migrations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
