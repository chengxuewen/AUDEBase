/**
 * @audebase/plugin-record-rules — NocoBase Record Rules Plugin
 *
 * Enhances NocoBase ACL with Odoo-style record-level permission filters (D10).
 * Injects Sequelize WHERE conditions into database queries via acl.use() middleware.
 *
 * Usage:
 *   // In NocoBase plugin config (e.g., via permissions table):
 *   {
 *     resource: "orders",
 *     action: "read",
 *     record_rule: ["&", ["status", "=", "draft"], ["assignee_id", "=", "$user.id"]]
 *   }
 *
 *   // The middleware converts this to a Sequelize filter injected into
 *   // ctx.permission.can.params.filter, so the query becomes:
 *   //   WHERE (status = 'draft' AND assignee_id = 42)
 */

import { Plugin } from "@nocobase/server";
import { Context, Next } from "@nocobase/actions";
import {
  parseDomainFilter,
  conditionToSequelize,
  domainFilterToSequelize,
  FilterContext,
  DomainFilterError,
  DomainFilterTuple,
  SequelizeFilter,
} from "./domain-filter";

// ── Types ──────────────────────────────────────────────────────────────

/**
 * A stored record rule from the `record_rules` collection
 * or from plugin configuration.
 */
interface RecordRuleEntry {
  id: string;
  resource: string;
  action: string;
  /** Domain filter tuple stored as JSON array */
  domain_filter: DomainFilterTuple;
  /** Priority — lower number = evaluated first, higher number overrides */
  priority: number;
  enabled: boolean;
}

/** Merged filter with priority tracking */
interface MergedFilter {
  filter: DomainFilterTuple;
  priority: number;
}

// ── Rule Store ─────────────────────────────────────────────────────────

/**
 * In-memory cache of record rules.
 * Phase 1: loaded from plugin config at boot.
 * Phase 2+: loaded from `record_rules` DB collection on change.
 */
const ruleStore = new Map<string, RecordRuleEntry>();

// ── Plugin Class ───────────────────────────────────────────────────────

export class PluginRecordRules extends Plugin {
  /**
   * Load record rules from plugin configuration.
   * Config format:
   *   { record_rules: [{ resource, action, domain_filter, priority?, enabled? }] }
   */
  beforeLoad(): void {
    const config = this.options?.config || {};
    const rules: Array<{
      resource: string;
      action: string;
      domain_filter: DomainFilterTuple;
      priority?: number;
      enabled?: boolean;
    }> = config.record_rules ?? [];

    for (const [idx, rule] of rules.entries()) {
      const id = rule.resource && rule.action
        ? `${rule.resource}:${rule.action}:${idx}`
        : `config-rule-${idx}`;
      ruleStore.set(id, {
        id,
        resource: rule.resource,
        action: rule.action,
        domain_filter: rule.domain_filter,
        priority: rule.priority ?? 0,
        enabled: rule.enabled !== false,
      });
    }

    this.log.info(
      `[plugin-record-rules] Loaded ${ruleStore.size} record rule(s) from config`,
    );

    // Register ACL middleware
    this.registerAclMiddleware();
  }

  afterLoad(): void {
    this.log.info("[plugin-record-rules] Plugin loaded");
  }

  // ── ACL Middleware Registration ────────────────────────────────────

  private registerAclMiddleware(): void {
    // acl.use() registers a middleware in NocoBase's ACL pipeline.
    // It runs AFTER the standard permission check (role-based ACL) and
    // BEFORE the database query executes.
    this.app.acl.use(
      async (ctx: Context, next: Next) => {
        try {
          await this.injectRecordRuleFilter(ctx);
        } catch (err) {
          // ponytail: log and skip — don't block requests on filter parse errors
          if (err instanceof DomainFilterError) {
            this.log.warn(`[plugin-record-rules] Filter parse error: ${err.message}`);
          } else {
            this.log.error(`[plugin-record-rules] Unexpected error in middleware`, err);
          }
        }
        await next();
      },
      {
        // ponytail: run after ACL resolves permission so we can inspect ctx.permission
        before: "acl",
      },
    );
  }

  // ── Filter Injection ────────────────────────────────────────────────

  /**
   * Look up matching record rules for the current request's resource + action,
   * merge them, convert to a Sequelize WHERE filter, and inject into
   * `ctx.permission.can.params.filter`.
   */
  private async injectRecordRuleFilter(ctx: Context): Promise<void> {
    // NocoBase ACL middleware exposes permission on the context
    const permission = (ctx as Record<string, unknown>).permission;
    if (!permission || typeof permission !== "object") {
      return; // No ACL permission resolved — nothing to filter
    }

    const pm = permission as Record<string, unknown>;
    if (!pm.can) return; // No permission grant

    const can = pm.can as Record<string, unknown>;
    // Resource and action come from the resolved permission
    const resourceName = (can.resource_name as string) || (can.resourceName as string);
    const actionName = (can.action_name as string) || (can.actionName as string);

    if (!resourceName || !actionName) return;

    // Find matching record rules
    const matchingRules = this.findMatchingRules(resourceName, actionName);
    if (matchingRules.length === 0) return;

    // Merge rules: lower-priority runs first, higher-priority AND-ed on top
    const filterContext = this.buildFilterContext(ctx);
    const mergedFilter = this.mergeFilters(matchingRules, filterContext);

    if (!mergedFilter) return;

    // Inject into params.filter — NocoBase applies this to Sequelize queries
    const params = (can.params as Record<string, unknown>) || {};
    const existingFilter = params.filter as SequelizeFilter | undefined;
    params.filter = existingFilter
      ? this.combineFilters(existingFilter, mergedFilter)
      : mergedFilter;
    can.params = params;
  }

  // ── Rule Matching ───────────────────────────────────────────────────

  private findMatchingRules(resource: string, action: string): RecordRuleEntry[] {
    const results: RecordRuleEntry[] = [];
    for (const rule of ruleStore.values()) {
      if (!rule.enabled) continue;
      if (rule.resource === resource && rule.action === action) {
        results.push(rule);
      }
    }
    results.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    return results;
  }

  // ── Filter Context ──────────────────────────────────────────────────

  private buildFilterContext(ctx: Context): FilterContext {
    const state = (ctx as Record<string, unknown>).state || {};
    const s = state as Record<string, unknown>;
    return {
      userId: (s.currentUserId as string | number)
        || ((s.currentUser as Record<string, unknown>)?.id as string | number),
      tenantId: (s.currentTenantId as string)
        || ((ctx as Record<string, unknown>).tenantId as string),
    };
  }

  // ── Filter Merging ──────────────────────────────────────────────────

  /**
   * Merge multiple matching record rules by AND-ing them together.
   * All rules must pass.
   */
  private mergeFilters(
    rules: RecordRuleEntry[],
    ctx: FilterContext,
  ): SequelizeFilter | null {
    if (rules.length === 0) return null;

    const filters = rules.map((rule) => {
      const tree = parseDomainFilter(rule.domain_filter);
      return conditionToSequelize(tree, ctx);
    });

    if (filters.length === 1) return filters[0];

    // AND all rules together
    const Sequelize = require("sequelize");
    return { [Sequelize.Op.and]: filters };
  }

  /**
   * Combine the plugin's record-rule filter with any existing filter
   * (e.g., from other ACL middleware) by AND-ing them.
   */
  private combineFilters(
    existing: SequelizeFilter,
    incoming: SequelizeFilter,
  ): SequelizeFilter {
    const Sequelize = require("sequelize");
    return { [Sequelize.Op.and]: [existing, incoming] };
  }
}

export default PluginRecordRules;
