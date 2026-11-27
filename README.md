# SQL Account MCP

Ask Claude, ChatGPT or any MCP client about your **SQL Account** (SQL Accounting) data in plain words:

> "How much has Tanner & Co. been invoiced this month?"
> "What's on invoice IV-00012?"
> "How many WB-5G bottles do we have?"
> "Show the payments we received on 25 November."

This is a **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server. It uses the official SQL Account REST API with your own API keys. It can look things up; it cannot create, change or delete anything.

Unofficial. Not made or endorsed by E Stream MSC. "SQL Account" is their trademark.

## Tools

| Tool | What it does |
|---|---|
| `list_customers` / `get_customer` | Customers from Maintain Customer, by code or company name |
| `list_stock_items` / `get_stock_item` | Stock items, with UOM and price lines |
| `list_sales_invoices` / `get_sales_invoice` | Sales invoices by customer, number or date, with item lines |
| `list_purchase_invoices` / `get_purchase_invoice` | Purchase invoices by supplier, number or date, with item lines |
| `list_customer_payments` | Payments received from customers |
| `list_agents` | Sales agents |
| `query_records` | Any of: customer, agent, stockitem, salesinvoice, purchaseinvoice, customerpayment, paymentvoucher, journalentry, stockreceived, stocktransfer, stockadjustment, with exact-match filters |

Filters are exact matches on SQL Account field names (`code`, `docno`, `docdate` as `YYYY-MM-DD`, and other header fields). The API returns at most 50 records per call; the tools page with `offset`.

## What you need

1. SQL Account **5.2025.1038.875 or newer**, with the **SQL Account API Service** set up (SQL Account's own guide: [setup](https://docs.sql.com.my/sqlacc/integration/sql-account-api/setup-configuration), [on-premise](https://docs.sql.com.my/sqlacc/integration/sql-account-api/on-premise-setup)). E Stream charges a setup fee for the API.
2. An **API user** with an access key and secret key: in SQL Account, *Tools > Maintain User*, create a user such as `APIUser`, then *More > API Secret Key > Generate*. The secret key is shown once. Give this user only the rights it needs.
3. Node.js 18.17 or newer.

## Set up

Add this to your MCP client. For **Claude Desktop**, edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sql-account": {
      "command": "npx",
      "args": ["-y", "github:z9systems/sql-account-mcp"],
      "env": {
        "SQLACC_ACCESS_KEY": "your access key",
        "SQLACC_SECRET_KEY": "your secret key"
      }
    }
  }
}
```

**Claude Code:**

```
claude mcp add sql-account -e SQLACC_ACCESS_KEY=... -e SQLACC_SECRET_KEY=... -- npx -y github:z9systems/sql-account-mcp
```

Cursor, Windsurf and other clients use the same command, arguments and environment variables.

**Docker:**

```
docker build -t sql-account-mcp https://github.com/z9systems/sql-account-mcp.git
docker run -i --rm -e SQLACC_ACCESS_KEY=... -e SQLACC_SECRET_KEY=... sql-account-mcp
```

### Settings

| Variable | Default | |
|---|---|---|
| `SQLACC_ACCESS_KEY` | | required |
| `SQLACC_SECRET_KEY` | | required |
| `SQLACC_BASE_URL` | `https://api.sql.my` | change only if SQL Account gives you another address |
| `SQLACC_REGION` | `ap-southeast-1` | |
| `SQLACC_SERVICE` | `execute-api` | |
| `SQLACC_SESSION_TOKEN` | | only for temporary credentials |
| `SQLACC_TIMEOUT_MS` | `20000` | |

## Safety

- Only HTTP GET requests are sent. There are no tools that write.
- Requests are signed with AWS Signature Version 4, as SQL Account's API requires. Your keys stay on your computer and are sent only to the SQL Account API.
- Filter field names are checked before a request is made.
- Use a dedicated API user. Once it has a secret key it can no longer sign in to SQL Account itself.

## Test

```
npm install
npm test
```

The test starts a stand-in for the SQL Account API that checks every request's signature (with the independent `aws4` library), runs the MCP server over stdio and calls every tool.

Status: tested against that stand-in. If anything differs on your SQL Account version, please open an issue with the error message (never your keys).

## Want it set up for you?

[Z9 Systems](https://z9systems.com) connects AI to SQL Account, AutoCount, Xero, HubSpot and other systems: stock questions on WhatsApp, purchase orders turned into sales orders, payment reminders, and more, with a person approving every key step.

## Licence

MIT
