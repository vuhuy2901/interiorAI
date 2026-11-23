import { startHttpServer } from "./index.js";

const server = await startHttpServer();
process.stderr.write(`FurniMesh MCP Streamable HTTP listening on http://127.0.0.1:${(server.address() as { port: number }).port}/mcp\n`);
