import { describe, test, expect, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
  parseApiVersion,
  getMajorVersion,
  versionPrefix,
  versionGuard,
  registerVersionedRoutes,
} from "../../api/versioning";
import type { VersionInfo } from "@audebase/shared-types";

describe("parseApiVersion", () => {
  test("parses simple semver", () => {
    const r = parseApiVersion("2.1.0");
    expect(r.major).toBe(2);
    expect(r.minor).toBe(1);
    expect(r.patch).toBe(0);
  });
  test("parses prerelease", () => {
    const r = parseApiVersion("1.0.0-alpha.1");
    expect(r.prerelease).toBe("alpha.1");
  });
  test("rejects invalid version", () => {
    expect(() => parseApiVersion("not-semver")).toThrow("Invalid SemVer");
  });
});

describe("getMajorVersion", () => {
  test("returns major number", () => {
    expect(getMajorVersion({ major: 3, minor: 0, patch: 0 })).toBe(3);
  });
});

describe("versionPrefix", () => {
  test("builds /api/v{major}/{resource}", () => {
    expect(versionPrefix(2, "things")).toBe("/api/v2/things");
  });
});

describe("versionGuard", () => {
  const info: VersionInfo = { apiVersion: { major: 1, minor: 0, patch: 0 } };

  test("allows request without Accept-Version header", () => {
    const guard = versionGuard(info);
    const reply = { status: () => ({ send: () => {} }) };
    const sent = guard({ headers: {} }, reply);
    expect(sent).toBeUndefined();
  });

  test("rejects mismatched major version (406)", () => {
    const guard = versionGuard(info);
    let body: unknown = null;
    const reply = {
      status: (_c: number) => ({
        send: (b: unknown) => {
          body = b;
        },
      }),
    };
    guard({ headers: { "accept-version": "3" } }, reply);
    expect(body).toBeDefined();
  });

  test("rejects invalid version header (400)", () => {
    const guard = versionGuard(info);
    let body: unknown = null;
    const reply = {
      status: (_c: number) => ({
        send: (b: unknown) => {
          body = b;
        },
      }),
    };
    guard({ headers: { "accept-version": "abc" } }, reply);
    expect(body).toBeDefined();
  });
});

describe("registerVersionedRoutes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  test("registers routes under /api/v{major}/{resource} prefix", async () => {
    app = Fastify({ logger: false });
    registerVersionedRoutes(app, "items", "2.0.0", { keepFlat: false }, (scoped) => {
      scoped.get("/", async (_req, reply) => reply.send({ version: "v2" }));
    });

    const res = await app.inject({ method: "GET", url: "/api/v2/items" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ version: "v2" });
  });

  test("coexists: versioned and flat routes both work when keepFlat=true", async () => {
    app = Fastify({ logger: false });
    registerVersionedRoutes(app, "items", "1.0.0", { keepFlat: true }, (scoped) => {
      scoped.get("/", async (_req, reply) => reply.send({ source: "items" }));
    });

    const v1Res = await app.inject({ method: "GET", url: "/api/v1/items" });
    expect(v1Res.statusCode).toBe(200);

    const flatRes = await app.inject({ method: "GET", url: "/api/items" });
    expect(flatRes.statusCode).toBe(200);
  }, 10000);
});
