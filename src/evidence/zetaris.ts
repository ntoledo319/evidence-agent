// Zetaris REST SQL connector for the local UI proxy. Configuration comes from
// environment variables only; no secret is hardcoded, logged, or put in a URL.
// Use ZETARIS_API_KEY when the user created one in the GUI, or
// ZETARIS_USERNAME + ZETARIS_PASSWORD for the same UI-proxy login flow the
// official getting-started scripts use.

import crypto from "node:crypto";

export interface ZetarisConfig {
  baseUrl: string;
  orgId: string;
  apiKey?: string;
  username?: string;
  password?: string;
  engineId?: string;
  queryLimit: number;
}

export class ZetarisConfigError extends Error {}
export class ZetarisRequestError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ZetarisRequestError";
    this.status = status;
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ZetarisConfig | null {
  const baseUrl = env.ZETARIS_BASE_URL;
  const orgId = env.ZETARIS_ORG_ID;
  const apiKey = env.ZETARIS_API_KEY;
  const username = env.ZETARIS_USERNAME;
  const password = env.ZETARIS_PASSWORD;
  if (!baseUrl && !apiKey && !orgId && !username && !password) return null;

  const missing = [
    ["ZETARIS_BASE_URL", baseUrl],
    ["ZETARIS_ORG_ID", orgId],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (!apiKey && !(username && password)) missing.push("ZETARIS_API_KEY or ZETARIS_USERNAME+ZETARIS_PASSWORD");
  if (missing.length) throw new ZetarisConfigError(`partial Zetaris configuration; missing: ${missing.join(", ")}`);
  if (!/^https?:\/\/[^/]+$/.test(baseUrl!)) throw new ZetarisConfigError("ZETARIS_BASE_URL must be an HTTP(S) origin without a path");
  if (!/^\d+$/.test(orgId!)) throw new ZetarisConfigError("ZETARIS_ORG_ID must be the numeric organization ID");
  const queryLimit = Number(env.ZETARIS_QUERY_LIMIT ?? "1000");
  if (!Number.isInteger(queryLimit) || queryLimit < 1) throw new ZetarisConfigError("ZETARIS_QUERY_LIMIT must be a positive integer");
  return {
    baseUrl: baseUrl!.replace(/\/$/, ""),
    orgId: orgId!,
    apiKey: apiKey || undefined,
    username: username || undefined,
    password: password || undefined,
    engineId: env.ZETARIS_ENGINE_ID || undefined,
    queryLimit,
  };
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ZetarisProxyResponse {
  headers?: string[];
  data?: unknown[][];
  rows?: Record<string, unknown>[];
}

export function rowsFromResponse(result: ZetarisProxyResponse | null): Record<string, unknown>[] {
  if (!result) return [];
  if (Array.isArray(result.rows)) return result.rows;
  const headers = result.headers ?? [];
  return (result.data ?? []).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, Array.isArray(values) ? values[index] : undefined])),
  );
}

interface LoginResponse {
  idToken?: string;
  token?: string;
  accessToken?: string;
}

export class ZetarisClient {
  constructor(
    private readonly config: ZetarisConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async token(): Promise<string> {
    if (this.config.apiKey) return this.config.apiKey;
    const response = await this.fetchImpl(`${this.config.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() },
      body: JSON.stringify({ username: this.config.username, password: this.config.password }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new ZetarisRequestError(`Zetaris login failed: HTTP ${response.status}`, response.status);
    const body = (await response.json()) as LoginResponse;
    const token = body.idToken || body.token || body.accessToken;
    if (!token) throw new ZetarisRequestError("Zetaris login did not return an access token");
    return token;
  }

  async query(sql: string): Promise<unknown> {
    if (!sql || !sql.trim()) throw new ZetarisConfigError("SQL must not be empty");
    const body = {
      sql,
      limit: this.config.queryLimit,
      ...(this.config.engineId ? { engineId: this.config.engineId } : {}),
    };
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}/api/proxy/sql-editor/sqls/run-query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          "X-Org-ID": this.config.orgId,
          "X-Request-ID": crypto.randomUUID(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (err instanceof ZetarisRequestError) throw err;
      throw new ZetarisRequestError(`cannot reach Zetaris at ${this.config.baseUrl}: ${err instanceof Error ? err.message : err}`);
    }
    if (!response.ok) {
      const detail = response.headers.get("content-type")?.includes("text/html")
        ? "server returned an HTML page; check the API route"
        : (await response.text()).slice(0, 300);
      throw new ZetarisRequestError(`Zetaris query failed: HTTP ${response.status} ${detail}`, response.status);
    }
    return response.json();
  }

  async healthCheck(): Promise<unknown> {
    return this.query("SELECT 1");
  }
}
