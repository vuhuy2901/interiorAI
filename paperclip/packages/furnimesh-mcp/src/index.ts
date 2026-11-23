import dns from "node:dns/promises";
import http from "node:http";
import { isIP } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PAGE_HOSTS = new Set(["furnimesh.com", "www.furnimesh.com"]);
const ASSET_HOST = "storage.googleapis.com";
const ASSET_PREFIX = "/furnimesh-3d/";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 5;
const USER_AGENT = "Paperclip-FurniMesh-MCP/0.1 (+public-library-adapter)";

export type Furniture = {
  model_id: string;
  name: string;
  description: string;
  thumbnail_url: string | null;
  detail_url: string;
  category: string | null;
  available_formats: string[];
  glb_url: string | null;
  technical: Record<string, unknown>;
};

export class FurniMeshSourceError extends Error {}

async function rejectPrivateHost(hostname: string): Promise<void> {
  const addresses = await dns.lookup(hostname, { all: true });
  for (const entry of addresses) {
    const parsed = isIP(entry.address);
    if ((parsed === 4 && /^(10\.|127\.|169\.254\.|192\.168\.)/.test(entry.address)) ||
        (parsed === 6 && (entry.address === "::1" || entry.address.toLowerCase().startsWith("fe80:")))) {
      throw new FurniMeshSourceError("FurniMesh URL resolves to a private or link-local address");
    }
  }
}

export async function validateUrl(raw: string, asset = false): Promise<string> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new FurniMeshSourceError("Invalid URL"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new FurniMeshSourceError("Only credential-free HTTPS URLs are allowed");
  if (asset ? url.hostname !== ASSET_HOST : !PAGE_HOSTS.has(url.hostname)) throw new FurniMeshSourceError("URL is outside the FurniMesh allowlist");
  if (asset && !url.pathname.startsWith(ASSET_PREFIX)) throw new FurniMeshSourceError("Asset URL is outside the public FurniMesh bucket prefix");
  await rejectPrivateHost(url.hostname);
  url.hash = "";
  return url.toString();
}

async function fetchText(rawUrl: string): Promise<{ text: string; url: string }> {
  const url = await validateUrl(rawUrl);
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new FurniMeshSourceError("FurniMesh redirect did not provide a location");
    return fetchText(new URL(location, url).toString());
  }
  if (!response.ok) throw new FurniMeshSourceError(`FurniMesh returned HTTP ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_HTML_BYTES) throw new FurniMeshSourceError("FurniMesh metadata page is too large");
  return { text, url: response.url || url };
}

function absolute(value: string, base: string): string {
  return new URL(value.replaceAll("&amp;", "&"), base).toString();
}

function modelId(url: string): string { return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? url; }

export function parseListing(html: string, base = "https://furnimesh.com/library/"): Furniture[] {
  const output: Furniture[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try { url = new URL(absolute(match[1]!, base)); } catch { continue; }
    const parts = url.pathname.split("/").filter(Boolean);
    if (!PAGE_HOSTS.has(url.hostname) || !url.pathname.startsWith("/library/") || url.pathname.includes("/format/glb/") || parts.length < 4) continue;
    const id = modelId(url.toString());
    if (seen.has(id) || ["sofas", "chairs", "beds", "tables", "format"].includes(id)) continue;
    seen.add(id);
    const name = match[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || id;
    output.push({ model_id: id, name, description: "", thumbnail_url: null, detail_url: url.toString().replace(/\/$/, ""), category: null, available_formats: [], glb_url: null, technical: {} });
  }
  return output;
}

function textFromHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getFurnitureDetails(input: { model_id?: string; detail_url?: string }): Promise<Furniture> {
  const target = input.detail_url ? await validateUrl(input.detail_url) : await validateUrl(`https://furnimesh.com/library/${encodeURIComponent(input.model_id ?? "")}/`);
  const page = await fetchText(target);
  const title = page.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const image = [...page.text.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)]
    .map((match) => match[1]!)
    .find((url) => !url.toLowerCase().includes("logo"));
  const glb = [...page.text.matchAll(/href=["']([^"']+\.glb(?:\?[^"']*)?)["']/gi)].map((m) => absolute(m[1]!, page.url)).find((url) => new URL(url).hostname === ASSET_HOST);
  const extent = page.text.match(/Model extent[\s\S]{0,500}?([0-9.]+\s*[×x]\s*[0-9.]+\s*[×x]\s*[0-9.]+)[\s\S]{0,100}?scene units/i)?.[1] ?? null;
  const polycount = page.text.match(/Polycount[\s\S]{0,120}?([0-9][0-9,]*)/i)?.[1];
  const description = textFromHtml(page.text.match(/About this model[\s\S]*?(?=Key features|Free download)/i)?.[0] ?? "")
    .replace(/^About this model\s*/i, "");
  const visibleCategory = page.text.match(/<dt[^>]*>\s*Category\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i)?.[1];
  const jsonCategory = page.text.match(/"category"\s*:\s*"([^"]+)"/i)?.[1];
  return {
    model_id: modelId(page.url), name: textFromHtml(title ?? modelId(page.url)), description,
    thumbnail_url: image ? absolute(image, page.url) : null, detail_url: page.url,
    category: textFromHtml(visibleCategory ?? jsonCategory ?? "") || null,
    available_formats: ["GLB", "OBJ", "SKP", "BLEND"].filter((format) => new RegExp(`\\b${format}\\b`, "i").test(page.text)),
    glb_url: glb ? await validateUrl(glb, true) : null,
    technical: { scene_extent: extent, dimensions_source: extent ? "scene_units" : null, polycount: polycount ? Number(polycount.replaceAll(",", "")) : null },
  };
}

export async function searchFurniture(input: { query?: string; category?: string; style?: string; color?: string; limit?: number; page?: number }): Promise<Furniture[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 12, 50));
  const page = Math.max(1, Math.min(input.page ?? 1, MAX_PAGES));
  const category = (input.category ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const path = category ? `/library/format/glb/${category}/` : "/library/format/glb/";
  const response = await fetchText(`https://furnimesh.com${path}?page=${page}`);
  const terms = [input.query, input.style, input.color].filter(Boolean).map((term) => term!.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).filter(Boolean);
  const shells = parseListing(response.text, response.url)
    .filter((item) => !terms.length || terms.every((term) => item.name.toLowerCase().includes(term)))
    .slice(0, Math.min(limit * 2, 50));
  const enriched: Furniture[] = [];
  for (let index = 0; index < shells.length; index += 4) {
    const batch = shells.slice(index, index + 4);
    enriched.push(...await Promise.all(batch.map(async (item) => {
      try { return await getFurnitureDetails({ detail_url: item.detail_url }); }
      catch { return item; }
    })));
  }
  return enriched
    .filter((item) => !terms.length || terms.every((term) => `${item.name} ${item.description} ${item.category ?? ""}`.toLowerCase().includes(term)))
    .slice(0, limit);
}

async function headAsset(rawUrl: string): Promise<{ response: Response; url: string }> {
  let url = await validateUrl(rawUrl, true);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { method: "HEAD", redirect: "manual", headers: { "user-agent": USER_AGENT, accept: "model/gltf-binary" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new FurniMeshSourceError("GLB redirect did not provide a location");
      url = await validateUrl(new URL(location, url).toString(), true);
      continue;
    }
    return { response, url };
  }
  throw new FurniMeshSourceError("GLB redirect limit exceeded");
}

export function createFurniMeshMcpServer(): McpServer {
  const server = new McpServer({ name: "furnimesh", version: "0.1.0" });
  const modelInput = { model_id: z.string().min(3).max(200).optional(), detail_url: z.string().url().optional() };
  server.tool("list_furniture_categories", "List categories visible in FurniMesh's public GLB library.", {}, async () => {
    const page = await fetchText("https://furnimesh.com/library/format/glb/");
    const categories = [...page.text.matchAll(/href=["'](\/library\/[^"']+\/)["'][^>]*>([^<]+)</gi)]
      .map((m) => ({ category_id: m[1]!.split("/").filter(Boolean).at(-1), category_name: textFromHtml(m[2]!), category_url: absolute(m[1]!, page.url) }))
      .filter((item) => {
        const pathParts = new URL(item.category_url).pathname.split("/").filter(Boolean);
        return pathParts.length === 3 && item.category_id && item.category_name && !item.category_url.includes("/format/");
      });
    return { content: [{ type: "text", text: JSON.stringify({ categories }, null, 2) }] };
  });
  server.tool("search_furniture", "Search public FurniMesh GLB listing pages on demand; no full-catalog sync.", { query: z.string().optional(), category: z.string().optional(), style: z.string().optional(), color: z.string().optional(), limit: z.number().int().min(1).max(50).optional(), page: z.number().int().min(1).max(MAX_PAGES).optional() }, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await searchFurniture(input), null, 2) }] }));
  server.tool("get_furniture_details", "Read one public FurniMesh detail page and its published metadata.", modelInput, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await getFurnitureDetails(input), null, 2) }] }));
  server.tool("get_model_glb_url", "Return a validated public GLB URL for a selected FurniMesh model.", modelInput, async (input) => {
    const details = await getFurnitureDetails(input);
    if (!details.glb_url) throw new FurniMeshSourceError("Selected FurniMesh model has no public GLB");
    return { content: [{ type: "text", text: JSON.stringify({ model_id: details.model_id, glb_url: details.glb_url, source_url: details.detail_url, verified: true }, null, 2) }] };
  });
  server.tool("preview_furniture", "Return the GLB URL and metadata needed by a 3D viewer.", modelInput, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await getFurnitureDetails(input), null, 2) }] }));
  server.tool("check_asset_compatibility", "HEAD-check a selected GLB URL without downloading it; geometry analysis is deferred until selection.", { ...modelInput, max_bytes: z.number().int().positive().max(300 * 1024 * 1024).optional() }, async (input) => {
    const details = await getFurnitureDetails(input);
    if (!details.glb_url) throw new FurniMeshSourceError("Selected FurniMesh model has no public GLB");
    const { response, url } = await headAsset(details.glb_url);
    const size = Number(response.headers.get("content-length") ?? 0) || null;
    const maxBytes = input.max_bytes ?? 300 * 1024 * 1024;
    return { content: [{ type: "text", text: JSON.stringify({ model_id: details.model_id, glb_url: details.glb_url, compatible: response.ok && (!size || size <= maxBytes), content_type: response.headers.get("content-type"), file_size_bytes: size, redirected_url: url, analysis: "remote-header-only; geometry analysis deferred until selected asset is provided" }, null, 2) }] };
  });
  return server;
}

export async function startHttpServer(port = Number(process.env.FURNIMESH_MCP_PORT ?? 3180)): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    if (req.url !== "/mcp" || !["POST", "GET", "DELETE"].includes(req.method ?? "")) { res.statusCode = 404; res.end("Not found"); return; }
    try {
      const body = req.method === "POST" ? await new Promise<string>((resolve, reject) => { let raw = ""; req.on("data", (chunk) => { raw += chunk; if (raw.length > 1024 * 1024) reject(new Error("MCP request too large")); }); req.on("end", () => resolve(raw)); req.on("error", reject); }) : undefined;
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const mcp = createFurniMeshMcpServer();
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
    } catch (error) {
      if (!res.headersSent) res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "MCP request failed" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}
