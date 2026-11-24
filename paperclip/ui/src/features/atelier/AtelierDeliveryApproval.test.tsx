// @vitest-environment jsdom
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AtelierDeliveryApproval } from "./AtelierDeliveryApproval";

afterEach(() => vi.unstubAllGlobals());
it("shows the delivery evidence and submits exactly the reviewed output", async () => {
  const output = { sceneId: "scene", revision: 7, summary: "Verified delivery", references: [{ uri: "/api/issues/task/documents/delivery" }], decisions: {} };
  const fetcher = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetcher);
  const onAccepted = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<AtelierDeliveryApproval runId="run" output={output} onAccepted={onAccepted} />));
    expect(host.textContent).toContain("Verified delivery");
    expect(host.querySelector("a")?.getAttribute("href")).toBe(output.references[0].uri);
    flushSync(() => host.querySelector("button")!.click());
    await vi.waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ idempotencyKey: "human-accept:run:7", output, approve: true });
  } finally { flushSync(() => root.unmount()); host.remove(); }
});
