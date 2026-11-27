// AWS Signature Version 4 for the SQL Account REST API (API Gateway, service "execute-api").
// No AWS SDK needed. Follows the signing steps in SQL Account's own examples
// (https://wiki.sql.com.my/wiki/Restful_API), including their note that a path ending in "/*"
// (master + detail lines) is signed as ending in "/".
import { createHash, createHmac } from "node:crypto";

const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (key, s) => createHmac("sha256", key).update(s, "utf8").digest();

// RFC 3986 encoding, as SigV4 requires
export function encodeRfc3986(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function canonicalPath(path) {
  let p = path || "/";
  if (p.endsWith("/*")) p = p.slice(0, -1);       // SQL Account: "/salesinvoice/*" is signed as "/salesinvoice/"
  return p.split("/").map((seg) => encodeRfc3986(decodeURIComponent(seg))).join("/") || "/";
}

export function canonicalQuery(searchParams) {
  const pairs = [];
  for (const [k, v] of searchParams) pairs.push([encodeRfc3986(k), encodeRfc3986(v)]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

export function amzDate(d = new Date()) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");   // 20261127T091400Z
}

/**
 * Returns the headers to send: host, x-amz-date, x-amz-content-sha256, Authorization (and x-amz-security-token if given).
 * @param {{method:string, url:URL, body?:string, accessKey:string, secretKey:string, region:string, service:string, sessionToken?:string, date?:Date}} o
 */
export function signRequest(o) {
  const method = o.method.toUpperCase();
  const body = o.body || "";
  const now = amzDate(o.date);
  const dateStamp = now.slice(0, 8);
  const payloadHash = sha256hex(body);
  const host = o.url.host;

  const headers = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": now };
  if (o.sessionToken) headers["x-amz-security-token"] = o.sessionToken;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [method, canonicalPath(o.url.pathname), canonicalQuery(o.url.searchParams), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${o.region}/${o.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", now, scope, sha256hex(canonicalRequest)].join("\n");

  const kDate = hmac("AWS4" + o.secretKey, dateStamp);
  const kRegion = hmac(kDate, o.region);
  const kService = hmac(kRegion, o.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${o.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
