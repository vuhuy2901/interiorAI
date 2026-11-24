import { createHmac, randomBytes } from "node:crypto";

// Passed only to the managed child process. Request bodies never confer board authority.
export const atelierBridgeSecret = process.env.ATELIER_BRIDGE_SECRET ||= randomBytes(32).toString("hex");
export async function fetchAtelierSidecar(input: string | URL | Request, init?: RequestInit) {
  const url = String(input);
  const base = process.env.ATELIER_PYTHON_CAD_API_URL || "http://127.0.0.1:8000";
  if (!url.startsWith(`${base}/`)) return globalThis.fetch(input, init);
  const headers = new Headers(init?.headers);
  const timestamp = String(Date.now());
  const method = init?.method ?? "GET";
  const route = new URL(url).pathname;
  headers.set("X-Atelier-Bridge-Time", timestamp);
  headers.set("X-Atelier-Bridge-Signature", createHmac("sha256", atelierBridgeSecret).update(`${timestamp}\n${method}\n${route}`).digest("hex"));
  return globalThis.fetch(input, { ...init, headers });
}
