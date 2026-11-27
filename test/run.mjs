// End-to-end test: starts the mock SQL Account API, runs the MCP server over stdio, calls every tool.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startMock, KEYS, seen } from "./mock-api.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!cond) failures++; };

async function connect(env) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(here, "..", "src", "index.js")], env: { ...process.env, ...env } });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}
const body = (r) => { try { return JSON.parse(r.content[0].text); } catch { return r.content[0].text; } };

const srv = await startMock();
const base = `http://127.0.0.1:${srv.address().port}`;
const c = await connect({ SQLACC_BASE_URL: base, SQLACC_ACCESS_KEY: KEYS.accessKey, SQLACC_SECRET_KEY: KEYS.secretKey });

const tools = (await c.listTools()).tools;
check("11 tools listed", tools.length === 11, tools.map((t) => t.name).join(", "));
check("every tool is marked read-only", tools.every((t) => t.annotations && t.annotations.readOnlyHint === true));

let r = body(await c.callTool({ name: "list_customers", arguments: {} }));
check("list_customers returns 2", r.returned === 2 && r.records[1].companyname === "Tanner & Co.");
r = body(await c.callTool({ name: "get_customer", arguments: { code: "300-P0001" } }));
check("get_customer finds Pinecrest", r.found === true && r.record.creditlimit === 5000);
r = body(await c.callTool({ name: "get_customer", arguments: { code: "NOPE" } }));
check("get_customer not found is reported", r.found === false);
r = body(await c.callTool({ name: "list_stock_items", arguments: { code: "WB-5G" } }));
check("list_stock_items filter by code", r.returned === 1 && r.records[0].balsqty === 1240 && !r.records[0].sdsdocdetail);
r = body(await c.callTool({ name: "get_stock_item", arguments: { code: "CP-LTR" } }));
check("get_stock_item has detail lines (signed /* path)", r.found && r.record.sdsdocdetail.length === 1);
r = body(await c.callTool({ name: "list_sales_invoices", arguments: { customer_code: "300-T0001" } }));
check("list_sales_invoices by customer", r.returned === 1 && r.records[0].docno === "IV-00013");
r = body(await c.callTool({ name: "get_sales_invoice", arguments: { docno: "IV-00012" } }));
check("get_sales_invoice with lines", r.found && r.record.sdsdocdetail.length === 2 && r.record.docamt === 1345);
r = body(await c.callTool({ name: "list_purchase_invoices", arguments: { docdate: "2026-11-18" } }));
check("list_purchase_invoices by date", r.returned === 1);
r = body(await c.callTool({ name: "get_purchase_invoice", arguments: { docno: "PI-00001" } }));
check("get_purchase_invoice", r.found && r.record.companyname === "Brightway Office Supply");
r = body(await c.callTool({ name: "list_customer_payments", arguments: { customer_code: "300-T0001" } }));
check("list_customer_payments", r.returned === 1 && r.records[0].docamt === 2000);
r = body(await c.callTool({ name: "list_agents", arguments: {} }));
check("list_agents", r.returned === 1);
r = body(await c.callTool({ name: "query_records", arguments: { record_type: "journalentry", filters: { docno: "JE-00003" }, with_lines: true } }));
check("query_records journal entry with lines", r.returned === 1 && r.records[0].sdsdocdetail.length === 1);
r = body(await c.callTool({ name: "list_customers", arguments: { offset: 1, limit: 1 } }));
check("paging offset/limit", r.returned === 1 && r.records[0].code === "300-T0001" && r.more_may_exist === true);
r = await c.callTool({ name: "query_records", arguments: { record_type: "customer", filters: { "code;drop": "x" } } });
check("bad filter field name is refused", r.isError === true && /Invalid filter field/.test(r.content[0].text));
r = await c.callTool({ name: "query_records", arguments: { record_type: "salesorder" } });
check("unknown record type is refused", r.isError === true);
check("only GET requests reached the API", seen.length > 0 && seen.every((s) => s.method === "GET"), `${seen.length} requests`);
await c.close();

// wrong secret: the API refuses, and the tool says why
const bad = await connect({ SQLACC_BASE_URL: base, SQLACC_ACCESS_KEY: KEYS.accessKey, SQLACC_SECRET_KEY: "wrong" });
r = await bad.callTool({ name: "list_customers", arguments: {} });
check("wrong secret key gives a clear error", r.isError === true && /refused the request \(403\)/.test(r.content[0].text));
await bad.close();

// no keys at all
const none = await connect({ SQLACC_BASE_URL: base, SQLACC_ACCESS_KEY: "", SQLACC_SECRET_KEY: "" });
r = await none.callTool({ name: "list_customers", arguments: {} });
check("missing keys gives setup hint", r.isError === true && /SQLACC_ACCESS_KEY/.test(r.content[0].text));
await none.close();

srv.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
