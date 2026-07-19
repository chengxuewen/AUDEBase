import type { FastifyInstance } from "fastify";
import type { VersionInfo } from "@audebase/shared-types";
import { parseSemVer } from "@audebase/shared-types";

// ── Pure helpers (no Fastify dependency) ─────────────────────

export function parseApiVersion(version: string) {
  return parseSemVer(version);
}

export function getMajorVersion(semver: ReturnType<typeof parseSemVer>) {
  return semver.major;
}

export function versionPrefix(major: number, resource: string) {
  return `/api/v${major}/${resource}`;
}

// ── Middleware ───────────────────────────────────────────────

export function versionGuard(versionInfo: VersionInfo) {
  const currentMajor = versionInfo.apiVersion.major;
  const deprecated = versionInfo.deprecated ? " (deprecated)" : "";
  const sunset = versionInfo.sunsetDate ? ` (sunset: ${versionInfo.sunsetDate})` : "";

  return (
    request: { headers: Record<string, string | undefined> },
    reply: { status: (code: number) => { send: (body: unknown) => void } },
  ) => {
    const header = request.headers["accept-version"];
    if (!header) return;

    const requestedMajor = Number(header);
    if (Number.isNaN(requestedMajor)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_VERSION_HEADER",
          message: `Invalid Accept-Version header: "${header}". Expected integer.`,
        },
      });
    }

    if (requestedMajor !== currentMajor) {
      return reply.status(406).send({
        error: {
          code: "VERSION_NOT_ACCEPTABLE",
          message: `API version v${requestedMajor} not available. Current version: v${currentMajor}${deprecated}${sunset}.`,
          availableVersions: [`v${currentMajor}`],
        },
      });
    }
  };
}

// ── Route Registration ───────────────────────────────────────

type VersionedRouteRegistrar = (scopedApp: FastifyInstance) => void;

interface RegisterOptions {
  keepFlat?: boolean;
  deprecated?: boolean;
  sunsetDate?: string;
}

export function registerVersionedRoutes(
  app: FastifyInstance,
  resource: string,
  version: string,
  opts: RegisterOptions,
  registrar: VersionedRouteRegistrar,
): FastifyInstance {
  const semver = parseApiVersion(version);
  const major = semver.major;
  const vprefix = versionPrefix(major, resource);
  const keepFlat = opts.keepFlat !== false;

  const versionInfo: VersionInfo = {
    apiVersion: semver,
    deprecated: opts.deprecated,
    sunsetDate: opts.sunsetDate,
  };

  const guard = versionGuard(versionInfo);

  // Versioned routes: register with guard as preHandler
  app.register(
    (scoped, _opts, done) => {
      scoped.addHook("preHandler", (_request, _reply, done) => {
        guard(_request as { headers: Record<string, string | undefined> }, _reply);
        done();
      });
      registrar(scoped);
      done();
    },
    { prefix: vprefix },
  );

  // Flat compat routes (optional)
  if (keepFlat) {
    app.register(registrar, { prefix: `/api/${resource}` });
  }

  return app;
}
