import { describe, expect, it } from "vitest";
import { buildRenderPayload, isRenderActive, renderStatusText } from "./photorealRender";

describe("photoreal render request", () => {
  it("locks the selected revision, resolution and quality", () => {
    expect(buildRenderPayload({
      revision: 14,
      camera: "corner",
      lighting: "day",
      resolution: "2k",
      quality: "ultra",
    })).toMatchObject({
      camera: "corner",
      expected_revision: 14,
      width_px: 2560,
      height_px: 1440,
      mode: "final",
      samples: 192,
      async_exec: true,
    });
  });

  it("only treats queued and running jobs as active", () => {
    expect(isRenderActive("QUEUED")).toBe(true);
    expect(isRenderActive("RUNNING")).toBe(true);
    expect(isRenderActive("FAILED")).toBe(false);
    expect(renderStatusText("COMPLETED")).toBe("Render hoàn tất");
  });
});

import { aiRenderMissingText, formatElapsed, isAiRenderActive } from "./photorealRender";

describe("ai render (codex) helpers", () => {
  it("lists undecided items and formats elapsed time", () => {
    expect(aiRenderMissingText(["lighting", "floor"])).toBe("Còn chưa chốt: ánh sáng, vật liệu sàn");
    expect(aiRenderMissingText([])).toBe("");
    expect(formatElapsed(145)).toBe("2 phút 25 giây");
    expect(isAiRenderActive("RUNNING")).toBe(true);
    expect(isAiRenderActive("COMPLETED")).toBe(false);
  });
});
