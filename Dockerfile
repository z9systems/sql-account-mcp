# Runs the SQL Account MCP server over stdio.
# docker run -i --rm -e SQLACC_ACCESS_KEY=... -e SQLACC_SECRET_KEY=... sql-account-mcp
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
ENTRYPOINT ["node", "src/index.js"]
