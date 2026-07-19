-- preload.sql — Phase 1 (DDL): create example_todos table
-- Migration: 0.1.0 for @audebase/plugin-example-todo
-- Executed before plugin beforeLoad() hooks run

CREATE TABLE IF NOT EXISTS example_todos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(255) NOT NULL,
    completed   BOOLEAN NOT NULL DEFAULT FALSE,
    user_id     UUID NOT NULL,
    tenant_id   UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_example_todos_tenant ON example_todos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_example_todos_user ON example_todos (user_id);
