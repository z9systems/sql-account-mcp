// A stand-in for the SQL Account REST API, for tests. Checks the SigV4 signature of every request
// (with the independent "aws4" library for normal paths), then answers like the real API: { data: [...] }.
import http from "node:http";
import aws4 from "aws4";
import { signRequest } from "../src/sigv4.js";

export const KEYS = { accessKey: "AKIATESTZ9", secretKey: "test-secret-key/123+abc" };

const DATA = {
  customer: [
    { dockey: 1, code: "300-P0001", companyname: "Pinecrest Cafe", area: "EAST", creditterm: "30 Days", creditlimit: 5000, isactive: true },
    { dockey: 2, code: "300-T0001", companyname: "Tanner & Co.", area: "NORTH", creditterm: "30 Days", creditlimit: 20000, isactive: true },
  ],
  agent: [{ dockey: 1, code: "TOM", description: "Tom (water)", isactive: true }],
  stockitem: [
    { dockey: 10, code: "WB-5G", description: "5-gallon water bottle", stockgroup: "WATER", balsqty: 1240, refprice: 6.5, sdsdocdetail: [{ dtlkey: 1, uom: "UNIT", rate: 1, refprice: 6.5 }] },
    { dockey: 11, code: "CP-LTR", description: "Copy paper, case", stockgroup: "PAPER", balsqty: 210, refprice: 42, sdsdocdetail: [{ dtlkey: 2, uom: "CASE", rate: 1, refprice: 42 }] },
  ],
  salesinvoice: [
    { dockey: 100, docno: "IV-00012", docdate: "2026-11-12", code: "300-P0001", companyname: "Pinecrest Cafe", docamt: 1345, updatecount: 1,
      sdsdocdetail: [{ dtlkey: 1, seq: 1, itemcode: "WB-5G", description: "5-gallon water bottle", qty: 200, unitprice: 6.5, amount: 1300 }, { dtlkey: 2, seq: 2, itemcode: "DELIVERY", description: "Delivery", qty: 1, unitprice: 45, amount: 45 }] },
    { dockey: 101, docno: "IV-00013", docdate: "2026-11-20", code: "300-T0001", companyname: "Tanner & Co.", docamt: 4980, updatecount: 1,
      sdsdocdetail: [{ dtlkey: 3, seq: 1, itemcode: "CP-LTR", description: "Copy paper, case", qty: 120, unitprice: 41.5, amount: 4980 }] },
  ],
  purchaseinvoice: [{ dockey: 200, docno: "PI-00001", docdate: "2026-11-18", code: "400-B0001", companyname: "Brightway Office Supply", docamt: 2418.12, sdsdocdetail: [{ dtlkey: 1, itemcode: "CP-LTR", qty: 40, amount: 1680 }] }],
  customerpayment: [{ dockey: 300, docno: "OR-00007", docdate: "2026-11-25", code: "300-T0001", docamt: 2000 }],
  journalentry: [{ dockey: 400, docno: "JE-00003", docdate: "2026-11-27", description: "Accrual", docamt: 500, sdsdocdetail: [{ dtlkey: 1, code: "900-000", dr: 500 }] }],
  paymentvoucher: [], stockreceived: [], stocktransfer: [], stockadjustment: [],
};

export const seen = [];   // every request the mock received

function expectedAuth(req, url) {
  const amzDate = req.headers["x-amz-date"];
  if (url.pathname.endsWith("/*")) {
    // SQL Account rule: "/x/*" is signed as "/x/" (checked with our signer)
    const h = signRequest({ method: req.method, url, accessKey: KEYS.accessKey, secretKey: KEYS.secretKey, region: "ap-southeast-1", service: "execute-api",
      date: new Date(amzDate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")) });
    return h.Authorization;
  }
  const opts = aws4.sign({ host: url.host, path: url.pathname + url.search, method: req.method, service: "execute-api", region: "ap-southeast-1",
    headers: { "X-Amz-Date": amzDate, "X-Amz-Content-Sha256": req.headers["x-amz-content-sha256"] } }, { accessKeyId: KEYS.accessKey, secretAccessKey: KEYS.secretKey });
  return opts.headers.Authorization;
}

export function startMock() {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    seen.push({ method: req.method, path: url.pathname, query: url.search });
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method !== "GET") return send(405, { message: "only GET in the mock" });
    if (!req.headers.authorization || req.headers.authorization !== expectedAuth(req, url)) return send(403, { message: "The request signature we calculated does not match the signature you provided." });
    const m = /^\/([a-z]+)(\/\*)?\/?$/.exec(url.pathname);
    if (!m || !(m[1] in DATA)) return send(404, { message: "Not Found" });
    const details = !!m[2];
    let rows = DATA[m[1]];
    for (const [k, v] of url.searchParams) {
      if (k === "offset" || k === "limit") continue;
      rows = rows.filter((r) => String(r[k]) === v);
    }
    const offset = Number(url.searchParams.get("offset") || 0), limit = Math.min(50, Number(url.searchParams.get("limit") || 50));
    rows = rows.slice(offset, offset + limit).map((r) => { if (details) return r; const { sdsdocdetail, ...h } = r; return h; });
    send(200, { data: rows });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}
