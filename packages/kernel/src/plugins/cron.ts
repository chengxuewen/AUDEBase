import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { registerCronPlugin } from "@audebase/cron";
import type { CronRegistry } from "@audebase/cron";

declare module "fastify" {
  interface FastifyInstance {
    cron: CronRegistry;
  }
}

/** Plugin registration options */
export interface CronPluginOptions {
  redisUrl: string;
}

/**
 * cronPlugin — Fastify Cron 定时任务插件
 *
 * 注册后:
 * - fastify.cron → CronRegistry (add/remove/list/start/stop)
 * - 自动创建 BullMQ Queue + Worker
 */
async function cronPlugin(fastify: FastifyInstance, options: CronPluginOptions): Promise<void> {
  await registerCronPlugin(fastify, options);
}

export default fp(cronPlugin, {
  name: "audebase-cron",
  fastify: "5.x",
});
