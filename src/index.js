#!/usr/bin/env node
// SQL Account MCP server (read-only). Unofficial; not affiliated with E Stream MSC.
// Talks to the official SQL Account REST API with your API user's access key and secret key.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SqlAccountClient, configFromEnv, MAX_LIMIT } from "./client.js";

const VERSION = "0.1.0";
const client = new SqlAccountClient(configFromEnv());

// Resources that may be read. Only GET is ever used.
const RESOURCES = {
  customer: "Customers (Maintain Customer)",
  agent: "Sales agents",
  stockitem: "Stock items",
  salesinvoice: "Sales invoices",
  purchaseinvoice: "Purchase invoices",
  customerpayment: "Customer payments",
  paymentvoucher: "GL payment vouchers",
  journalentry: "Journal entries",
  stockreceived: "Stock received",
  stocktransfer: "Stock transfers",
  stockadjustment: "Stock adjustments",
};

// drop empty values so answers stay short
function compact(v) {
  if (Array.isArray(v)) return v.map(compact);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === null || x === undefined || x === "") continue;
      if (Array.isArray(x) && x.length === 0) continue;
      o[k] = compact(x);
    }
    return o;
  }
  return v;
}

function ok(obj) {
  return { content: [{ type: "text", text: JSON.stringify(compact(obj), null, 1) }] };
}
function fail(e) {
  return { isError: true, content: [{ type: "text", text: String(e && e.message ? e.message : e) }] };
}

const paging = {
  offset: z.number().int().min(0).optional().describe("Number of records to skip (for paging). Default 0."),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Records to return, 1 to ${MAX_LIMIT}. Default 20.`),
};

async function list(resource, filters, { offset = 0, limit = 20, details = false } = {}) {
  const r = await client.get(`/${resource}${details ? "/*" : ""}`, { filters, offset, limit });
  return {
    resource, filters, offset, returned: r.rows.length,
    more_may_exist: r.rows.length >= limit,
    records: r.rows,
    ...(r.raw ? { response: r.raw } : {}),
  };
}

async function one(resource, filters, notFound) {
  const r = await client.get(`/${resource}/*`, { filters, offset: 0, limit: 5 });
  if (!r.rows.length) return { found: false, message: notFound };
  return { found: true, record: r.rows[0], ...(r.rows.length > 1 ? { other_matches: r.rows.length - 1 } : {}) };
}

const server = new McpServer({ name: "sql-account", version: VERSION }, {
  instructions:
    "Read-only access to a company's SQL Account (SQL Accounting) data through its official REST API. " +
    "Use the list_* tools to browse and the get_* tools for one record with its detail lines. " +
    "Filters are exact matches on SQL Account field names (for example code, docno, docdate in YYYY-MM-DD). " +
    `At most ${MAX_LIMIT} records come back per call; page with offset. Amounts are in the company's currency. ` +
    "Nothing can be created, changed or deleted through this server.",
});

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

server.registerTool("list_customers", {
  title: "List customers",
  description: "List customers from Maintain Customer. Optional exact filters: customer code, company name.",
  inputSchema: {
    code: z.string().optional().describe("Customer code, e.g. 300-A0001"),
    companyname: z.string().optional().describe("Company name, exact"),
    ...paging,
  },
  annotations: RO,
}, async (a) => {
  try { return ok(await list("customer", { code: a.code, companyname: a.companyname }, a)); } catch (e) { return fail(e); }
});

server.registerTool("get_customer", {
  title: "Get a customer",
  description: "Get one customer by customer code, with all fields SQL Account returns (addresses, contacts, terms, credit limit where available).",
  inputSchema: { code: z.string().describe("Customer code, e.g. 300-A0001") },
  annotations: RO,
}, async (a) => {
  try { return ok(await one("customer", { code: a.code }, `No customer with code ${a.code}.`)); } catch (e) { return fail(e); }
});

server.registerTool("list_stock_items", {
  title: "List stock items",
  description: "List stock items. Optional exact filters: item code, description.",
  inputSchema: {
    code: z.string().optional().describe("Stock item code"),
    description: z.string().optional().describe("Item description, exact"),
    ...paging,
  },
  annotations: RO,
}, async (a) => {
  try { return ok(await list("stockitem", { code: a.code, description: a.description }, a)); } catch (e) { return fail(e); }
});

server.registerTool("get_stock_item", {
  title: "Get a stock item",
  description: "Get one stock item by item code, including its detail lines (such as UOM and prices) when SQL Account returns them.",
  inputSchema: { code: z.string().describe("Stock item code") },
  annotations: RO,
}, async (a) => {
  try { return ok(await one("stockitem", { code: a.code }, `No stock item with code ${a.code}.`)); } catch (e) { return fail(e); }
});

server.registerTool("list_sales_invoices", {
  title: "List sales invoices",
  description: "List sales invoices (header only). Optional exact filters: customer code, document number, document date.",
  inputSchema: {
    customer_code: z.string().optional().describe("Customer code"),
    docno: z.string().optional().describe("Invoice number, e.g. IV-00012"),
    docdate: z.string().optional().describe("Document date, YYYY-MM-DD"),
    ...paging,
  },
  annotations: RO,
}, async (a) => {
  try { return ok(await list("salesinvoice", { code: a.customer_code, docno: a.docno, docdate: a.docdate }, a)); } catch (e) { return fail(e); }
});

server.registerTool("get_sales_invoice", {
  title: "Get a sales invoice",
  description: "Get one sales invoice by document number, with its item lines.",
  inputSchema: { docno: z.string().describe("Invoice number, e.g. IV-00012") },
  annotations: RO,
}, async (a) => {
  try { return ok(await one("salesinvoice", { docno: a.docno }, `No sales invoice ${a.docno}.`)); } catch (e) { return fail(e); }
});

server.registerTool("list_purchase_invoices", {
  title: "List purchase invoices",
  description: "List purchase invoices (header only). Optional exact filters: supplier code, document number, document date.",
  inputSchema: {
    supplier_code: z.string().optional().describe("Supplier code"),
    docno: z.string().optional().describe("Purchase invoice number, e.g. PI-00001"),
    docdate: z.string().optional().describe("Document date, YYYY-MM-DD"),
    ...paging,
  },
  annotations: RO,
}, async (a) => {
  try { return ok(await list("purchaseinvoice", { code: a.supplier_code, docno: a.docno, docdate: a.docdate }, a)); } catch (e) { return fail(e); }
});

server.registerTool("get_purchase_invoice", {
  title: "Get a purchase invoice",
  description: "Get one purchase invoice by document number, with its item lines.",
  inputSchema: { docno: z.string().describe("Purchase invoice number, e.g. PI-00001") },
  annotations: RO,
}, async (a) => {
  try { return ok(await one("purchaseinvoice", { docno: a.docno }, `No purchase invoice ${a.docno}.`)); } catch (e) { return fail(e); }
});

server.registerTool("list_customer_payments", {
  title: "List customer payments",
  description: "List payments received from customers. Optional exact filters: customer code, document number, document date.",
  inputSchema: {
    customer_code: z.string().optional().describe("Customer code"),
    docno: z.string().optional().describe("Payment document number"),
    docdate: z.string().optional().describe("Document date, YYYY-MM-DD"),
    ...paging,
  },
  annotations: RO,
}, async (a) => {
  try { return ok(await list("customerpayment", { code: a.customer_code, docno: a.docno, docdate: a.docdate }, a)); } catch (e) { return fail(e); }
});

server.registerTool("list_agents", {
  title: "List sales agents",
  description: "List sales agents.",
  inputSchema: { code: z.string().optional().describe("Agent code"), ...paging },
  annotations: RO,
}, async (a) => {
  try { return ok(await list("agent", { code: a.code }, a)); } catch (e) { return fail(e); }
});

server.registerTool("query_records", {
  title: "Query any supported record type",
  description:
    "Read any supported SQL Account record type with exact-match filters on its fields. " +
    "Use this for record types without their own tool (journal entries, payment vouchers, stock received, transfers, adjustments). " +
    "Record types: " + Object.entries(RESOURCES).map(([k, v]) => `${k} (${v})`).join(", ") + ".",
  inputSchema: {
    record_type: z.enum(Object.keys(RESOURCES)).describe("Which record type to read"),
    filters: z.record(z.string(), z.string()).optional().describe("Exact-match filters on field names, e.g. {\"docno\":\"JE-00003\"} or {\"docdate\":\"2026-11-27\"}"),
    with_lines: z.boolean().optional().describe("Also return detail lines (only when filtering by docno or code). Default false."),
    ...paging,
  },
  annotations: RO,
}, async (a) => {
  try { return ok(await list(a.record_type, a.filters || {}, { offset: a.offset, limit: a.limit, details: !!a.with_lines })); } catch (e) { return fail(e); }
});

const transport = new StdioServerTransport();
await server.connect(transport);
