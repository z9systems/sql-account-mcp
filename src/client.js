// Small read-only client for the SQL Account REST API. Only GET requests are ever sent.
import { signRequest } from "./sigv4.js";

export const MAX_LIMIT = 50;   // SQL Account returns at most 50 records per GET

export function configFromEnv(env = process.env) {
  const cfg = {
    baseUrl: (env.SQLACC_BASE_URL || "https://api.sql.my").replace(/\/+$/, ""),
    accessKey: env.SQLACC_ACCESS_KEY || "",
    secretKey: env.SQLACC_SECRET_KEY || "",
    region: env.SQLACC_REGION || "ap-southeast-1",
    service: env.SQLACC_SERVICE || "execute-api",
    sessionToken: env.SQLACC_SESSION_TOKEN || "",
    timeoutMs: Number(env.SQLACC_TIMEOUT_MS || 20000),
  };
  return cfg;
}

export function missingConfig(cfg) {
  const miss = [];
  if (!cfg.accessKey) miss.push("SQLACC_ACCESS_KEY");
  if (!cfg.secretKey) miss.push("SQLACC_SECRET_KEY");
  return miss;
}

const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

export class SqlAccountClient {
  constructor(cfg) { this.cfg = cfg; }

  /**
   * GET a resource. path like "/customer" or "/salesinvoice/*" (with detail lines).
   * filters: { field: value } passed as query parameters (SQL Account filters on master table fields).
   */
  async get(path, { filters = {}, offset, limit } = {}) {
    const miss = missingConfig(this.cfg);
    if (miss.length) throw new Error(`Not configured: set ${miss.join(" and ")} (see the README).`);
    const url = new URL(this.cfg.baseUrl + path);
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null || v === "") continue;
      if (!FIELD.test(k)) throw new Error(`Invalid filter field name: ${k}`);
      url.searchParams.set(k.toLowerCase(), String(v));
    }
    if (offset !== undefined) url.searchParams.set("offset", String(Math.max(0, Math.floor(offset))));
    if (limit !== undefined) url.searchParams.set("limit", String(Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))));

    const headers = signRequest({ method: "GET", url, accessKey: this.cfg.accessKey, secretKey: this.cfg.secretKey,
      region: this.cfg.region, service: this.cfg.service, sessionToken: this.cfg.sessionToken || undefined });
    delete headers.host;   // fetch sets it
    headers["Content-Type"] = "application/json";

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.timeoutMs);
    let res;
    try {
      res = await fetch(url, { method: "GET", headers, signal: ctl.signal });
    } catch (e) {
      throw new Error(e.name === "AbortError" ? `SQL Account API did not answer within ${this.cfg.timeoutMs / 1000}s` : `Could not reach the SQL Account API: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 2000) }; }
    if (!res.ok) {
      const msg = (body && (body.message || body.Message || body.error || body.raw)) || res.statusText;
      if (res.status === 403 || res.status === 401) throw new Error(`SQL Account API refused the request (${res.status}): ${msg}. Check the access key, secret key and region.`);
      throw new Error(`SQL Account API error ${res.status}: ${msg}`);
    }
    const rows = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : Array.isArray(body.items) ? body.items : null;
    return { rows: rows || [], raw: rows ? undefined : body, url: url.pathname + url.search };
  }
}
