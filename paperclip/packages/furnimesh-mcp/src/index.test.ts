import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createFurniMeshMcpServer } from "./index.js";

describe("FurniMesh MCP contract", () => {
  it("advertises the six governed read/preview tools", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "furnimesh-contract-test", version: "0.1.0" });
    const server = createFurniMeshMcpServer();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "list_furniture_categories",
      "search_furniture",
      "get_furniture_details",
      "get_model_glb_url",
      "preview_furniture",
      "check_asset_compatibility",
    ]);

    await client.close();
    await server.close();
  });
});
