import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequest = vi.hoisted(() => vi.fn());
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("./_core/env", () => ({ ENV: { forgeApiUrl: "https://forge.example", forgeApiKey: "test-key" } }));

import { registerStorageProxy } from "./_core/storageProxy";

describe("storage proxy authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue(null);
  });

  it("rejects unauthenticated production requests before presigning an object", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalMode = process.env.LOCAL_MODE;
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mysql://test.invalid/qareeb";
    delete process.env.LOCAL_MODE;
    const app = { get: vi.fn() };
    const response = { status: vi.fn().mockReturnThis(), send: vi.fn(), set: vi.fn(), redirect: vi.fn() };
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      registerStorageProxy(app as never);
      const handler = app.get.mock.calls[0]?.[1] as (request: unknown, response: typeof response) => Promise<void>;
      await handler({ params: { 0: "qareeb/room/file.png" } }, response);
      expect(authenticateRequest).toHaveBeenCalledOnce();
      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.send).toHaveBeenCalledWith("Authentication required");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousLocalMode === undefined) delete process.env.LOCAL_MODE; else process.env.LOCAL_MODE = previousLocalMode;
    }
  });
});
