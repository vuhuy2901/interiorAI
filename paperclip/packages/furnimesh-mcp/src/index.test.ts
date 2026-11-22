import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import dns from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARENT_CATEGORY_SLUGS, UnknownCategoryError, createFurniMeshMcpServer, isHeavy, resolveCategory, searchFurniture } from "./index.js";

const listing = (id: string) => `<a href="/library/sofas/modern/${id}/">Model ${id}</a>`;
const detailPage = (poly: number) => `<h1>Item</h1><a href="https://storage.googleapis.com/furnimesh-3d/x.glb">GLB</a><dt>Polycount</dt><dd>${poly}</dd>`;

function html(text: string, status = 200): Response {
  return { ok: status < 400, status, url: "", headers: new Headers(), text: async () => text } as unknown as Response;
}

let calls: string[];
beforeEach(() => {
  calls = [];
  vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push(`${init?.method ?? "GET"} ${url}`); return handler(String(url), init); }));
}

async function connect() {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "furnimesh-test", version: "0.1.0" });
  const server = createFurniMeshMcpServer();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}
const body = (res: unknown) => JSON.parse(((res as { content: Array<{ text: string }> }).content)[0]!.text);

describe("FurniMesh MCP contract", () => {
  it("advertises the six governed read/preview tools and 12 parent categories", async () => {
    const client = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "list_furniture_categories", "search_furniture", "get_furniture_details", "get_model_glb_url", "preview_furniture", "check_asset_compatibility",
    ]);
    const cats = body(await client.callTool({ name: "list_furniture_categories", arguments: {} }));
    expect(cats.categories).toHaveLength(12);
    await client.close();
  });

  it("AC-03 unknown category errors without calling FurniMesh", async () => {
    mockFetch(() => html("", 200));
    await expect(searchFurniture({ category: "spaceships" })).rejects.toBeInstanceOf(UnknownCategoryError);
    const client = await connect();
    const out = body(await client.callTool({ name: "search_furniture", arguments: { category: "spaceships" } }));
    expect(out).toMatchObject({ ok: false, error: "unknown_category" });
    expect(out.suggestions).toContain("Sofas");
    expect(calls).toHaveLength(0);
    await client.close();
  });

  it("resolves parent names case-insensitively and child slugs directly", () => {
    expect(resolveCategory("SOFAS")).toEqual(["sofa"]);
    expect(resolveCategory("dining-table")).toEqual(["dining-table"]);
    expect(resolveCategory("")).toEqual([]);
    expect(Object.keys(PARENT_CATEGORY_SLUGS)).toHaveLength(12);
  });

  it("AC-01 Sofas and Seating hit child slugs only; 404 child slugs are skipped", async () => {
    mockFetch((url) => {
      if (url.includes("/format/glb/chair/")) return html(listing("a1"));
      if (url.includes("/format/glb/sofa/")) return html(listing("s1"));
      if (url.includes("/format/glb/")) return html("", 404);
      return html(detailPage(1000));
    });
    expect((await searchFurniture({ category: "Sofas" })).map((i) => i.model_id)).toEqual(["s1"]);
    expect((await searchFurniture({ category: "Seating" })).map((i) => i.model_id)).toEqual(["a1"]);
    expect(calls.some((c) => /glb\/(sofas|seating)\//.test(c))).toBe(false);
  });

  it("AC-02 child slug is used as before", async () => {
    mockFetch((url) => (url.includes("/format/glb/sofa/") ? html(listing("s1")) : html(detailPage(10))));
    await searchFurniture({ category: "sofa" });
    expect(calls[0]).toContain("/library/format/glb/sofa/?page=1");
  });

  it("AC-07 heavy flag thresholds", async () => {
    expect(isHeavy(21 * 1024 * 1024, null)).toBe(true);
    expect(isHeavy(null, 150_001)).toBe(true);
    expect(isHeavy(1024, 100)).toBe(false);
    expect(isHeavy(null, null)).toBe(false);

    const run = async (size: number, poly: number) => {
      mockFetch((url, init) => {
        if (init?.method === "HEAD") return { ok: true, status: 200, url, headers: new Headers({ "content-length": String(size), "content-type": "model/gltf-binary" }), text: async () => "" } as unknown as Response;
        return html(detailPage(poly));
      });
      const client = await connect();
      const args = { detail_url: "https://furnimesh.com/library/sofas/modern/a1/" };
      const out = {
        details: body(await client.callTool({ name: "get_furniture_details", arguments: args })),
        compat: body(await client.callTool({ name: "check_asset_compatibility", arguments: args })),
      };
      await client.close();
      return out;
    };
    const big = await run(25 * 1024 * 1024, 100);
    expect(big.details.heavy).toBe(true);
    expect(big.compat.heavy).toBe(true);
    expect((await run(1024, 200000)).compat.heavy).toBe(true);
    const small = await run(1024, 500);
    expect(small.details.heavy).toBe(false);
    expect(small.compat.heavy).toBe(false);
  });
});
