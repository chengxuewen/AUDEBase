import postgres from 'postgres'

const sql = postgres('postgres://audebase:audebase_dev@localhost:5432/audebase')

async function main() {
  // Drop all existing tables
  await sql`DROP TABLE IF EXISTS migration_history, audit_log, refresh_tokens, role_permissions, user_roles, permissions, roles, users, collections, modules, tenants CASCADE`
  console.log('Dropped all tables')

  // Create tables matching Drizzle schema exactly
  await sql`
    CREATE TABLE tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      domain VARCHAR(500),
      config JSONB DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('tenants OK')

  await sql`
    CREATE TABLE modules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      name VARCHAR(200) NOT NULL UNIQUE,
      version VARCHAR(50) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      state VARCHAR(20) NOT NULL DEFAULT 'discovered',
      category VARCHAR(100),
      description TEXT,
      author VARCHAR(255),
      license VARCHAR(100),
      dependencies JSONB DEFAULT '[]',
      runtime_mode VARCHAR(20) NOT NULL DEFAULT 'inline',
      runtime_partition VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
      auto_install BOOLEAN DEFAULT false,
      manifest_path VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('modules OK')

  await sql`
    CREATE TABLE collections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      table_name VARCHAR(200) NOT NULL UNIQUE,
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      extends_collection_id UUID,
      is_system BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('collections OK')

  await sql`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      username VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      password_hash VARCHAR(255) NOT NULL,
      token_version INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT true,
      must_change_password BOOLEAN NOT NULL DEFAULT false,
      display_name VARCHAR(255),
      avatar_url VARCHAR(500),
      locale VARCHAR(10) DEFAULT 'zh-CN',
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by UUID,
      updated_by UUID
    )
  `
  console.log('users OK')

  await sql`
    CREATE TABLE roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) NOT NULL,
      description VARCHAR(500),
      is_system BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('roles OK')

  await sql`
    CREATE TABLE permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      action VARCHAR(100) NOT NULL,
      resource VARCHAR(200) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      module_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('permissions OK')

  await sql`
    CREATE TABLE user_roles (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      assigned_by UUID,
      PRIMARY KEY (user_id, role_id)
    )
  `
  console.log('user_roles OK')

  await sql`
    CREATE TABLE role_permissions (
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      tenant_id UUID,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (role_id, permission_id)
    )
  `
  console.log('role_permissions OK')

  await sql`
    CREATE TABLE refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      user_agent VARCHAR(500),
      ip VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('refresh_tokens OK')

  await sql`
    CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      actor_id UUID,
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(200) NOT NULL,
      resource_id UUID,
      old_values JSONB,
      new_values JSONB,
      ip VARCHAR(50),
      user_agent VARCHAR(500),
      request_id VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('audit_log OK')

  await sql`
    CREATE TABLE migration_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      version VARCHAR(50) NOT NULL,
      phase VARCHAR(20) NOT NULL,
      filename VARCHAR(500),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      error_message TEXT,
      execution_time_ms INTEGER,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('migration_history OK')

  console.log('All 11 tables created matching Drizzle schema!')
  await sql.end()
}

main().catch(e => { console.error(e); process.exit(1) })
