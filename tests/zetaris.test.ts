import assert from "node:assert/strict";
import test from "node:test";
import { configFromEnv, rowsFromResponse, ZetarisClient, ZetarisConfigError } from "../src/evidence/zetaris.ts";

test("configFromEnv returns null only when fully unconfigured", () => {
  assert.equal(configFromEnv({}), null);
  assert.throws(
    () => configFromEnv({ ZETARIS_BASE_URL: "http://localhost:3000" }),
    ZetarisConfigError,
  );
});

test("rowsFromResponse supports the local headers/data shape", () => {
  assert.deepEqual(
    rowsFromResponse({ headers: ["id", "value"], data: [["a", 1], ["b", 2]] }),
    [{ id: "a", value: 1 }, { id: "b", value: 2 }],
  );
});

test("ZetarisClient can use username/password login before querying", async () => {
  const calls: { url: string; auth?: string; body?: unknown }[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") ?? undefined, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url).endsWith("/api/auth/login")) {
      return Response.json({ idToken: "token-123" });
    }
    return Response.json({ headers: ["1"], data: [["1"]], total: 1 });
  };
  const client = new ZetarisClient(
    { baseUrl: "http://localhost:3000", orgId: "1", username: "admin@example.com", password: "secret", queryLimit: 10 },
    fakeFetch,
  );
  const result = await client.healthCheck();
  assert.deepEqual(result, { headers: ["1"], data: [["1"]], total: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].auth, "Bearer token-123");
  assert.deepEqual(calls[1].body, { sql: "SELECT 1", limit: 10 });
});
