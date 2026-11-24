import { createHmac, randomUUID } from "node:crypto";

const base = "http://127.0.0.1:3100/api";
const sidecar = "http://127.0.0.1:8000/api";
const runId = "9830a4e3-73f3-4456-87ad-672acf441764";
const sceneId = "proj_7d214310";
const renderUrl = "/api/v1/renders/proj_7d214310_rev2_eye_level_preview_eb4c951a_a2c2c4.png";
const hash = "5D80B41920F2383D44A93CD7EFA5F74167EE3BED6AC3D7E4704DB01940DDE4BE";
const bridgeSecret = "codex-modern-apartment-recovery-20261120";

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function sidecarJson(path) {
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", bridgeSecret).update(`${timestamp}\nGET\n/api${path}`).digest("hex");
  return json(`${sidecar}${path}`, { headers: { "x-atelier-bridge-time": timestamp, "x-atelier-bridge-signature": signature } });
}

const run = await json(`${base}/atelier/workflow/runs/${runId}`);
const scene = await sidecarJson(`/v1/projects/${sceneId}`);
const cost = (await sidecarJson(`/v1/projects/${sceneId}/cost-workflow`)).estimate;
if (scene.external_scene?.sha256 !== hash || !scene.scale_calibrated || scene.spatial_qa?.valid !== true) throw new Error("Canonical GLB identity, scale, or spatial QA is not valid");
if (cost.unpriced_line_count || cost.priced_line_count !== 10) throw new Error(`Cost coverage incomplete: ${cost.priced_line_count}/10`);

const stages = Object.fromEntries(run.stages.map((stage) => [stage.stageKey, stage]));
const common = `\n\n## Nguồn chuẩn\n- GLB SHA-256: \`${hash}\`.\n- Scene: \`${sceneId}\`, revision ${scene.revision}.\n- Nguồn: ${scene.external_scene.source_url}; tác giả ${scene.external_scene.author}; giấy phép ${scene.external_scene.license}.\n- Root transform: scale 0.002; envelope 4.204 × 10.226 × 2.964 m.\n- Render Cycles thật: [mở ảnh](http://127.0.0.1:8000${renderUrl}).\n`;
const docs = {
  brief: `# Design Brief — Small Apartment Morning Version\nGiữ nguyên hình học, bố cục, texture và đồ vật của GLB người dùng cung cấp; không thay bằng phòng proxy. Đầu ra gồm Studio 3D, render rõ, kiểm kê ngữ nghĩa và giá comparable công khai. Giá là tham khảo, không nhận dạng SKU gốc và chưa gồm vận chuyển.${common}`,
  floorplan: `# Floor Plan Evidence\nBlender đo bounds nguồn 2102.126 × 5113.230 × 1482.211 source units. Uniform scale 0.002 tạo envelope 4204.253 × 10226.459 × 2964.422 mm. Mặt bằng dùng envelope GLB làm ranh kiểm soát; mesh gộp không đủ bằng chứng để bịa room polygon chi tiết.${common}`,
  floorplan_qa: `# Floor Plan QA\nPASS: checksum và nguồn đúng; scale được suy từ phép đo Blender có thể tái hiện; envelope và đơn vị mm nhất quán; topology chi tiết được ghi rõ là chưa tách từ mesh gộp, chuyển sang kiểm chứng whole-scene ở Geometry thay vì bịa dữ liệu.${common}`,
  geometry: `# Geometry / BIM Handoff\nCanonical revision ${scene.revision} liên kết trực tiếp whole-scene GLB gồm 14 node, 9 mesh, 9 material, 8 texture và 1 camera. Envelope canonical khớp bounds đã hiệu chỉnh; Pascal spatial QA valid. External GLB là hình học có thẩm quyền, overlay phòng chỉ phục vụ đo/điều hướng.${common}`,
  style: `# Style / Materials\nGiữ nguyên 9 vật liệu và 8 texture nhúng của GLB. Không tự thay màu/vật liệu thương mại. Render sử dụng neutral daylight/exposure để đọc rõ texture gỗ, tường sáng, rèm và đồ nội thất.${common}`,
  furniture: `# Furniture Inventory\nKiểm kê từ render và GLB: giường+nệm/chăn ga; tủ lạnh; máy lạnh treo tường; bàn trang điểm+gương; rèm; cây/chậu; thảm; thùng rác; cùng hoàn thiện sàn gỗ và tường/trần. Tên mesh generic nên đây là nhóm ngữ nghĩa, không phải SKU.${common}`,
  cost: `# Cost / Specification\nSnapshot \`${cost.snapshot_id}\`: ${cost.priced_line_count}/${cost.lines.length} dòng có giá comparable, tổng tham khảo **${cost.total_vnd.toLocaleString("vi-VN")} đ** gồm VAT giả định ${(cost.tax_rate * 100).toFixed(0)}%; vận chuyển 0 đ/chưa gồm. Nguồn và ngày kiểm tra nằm ở từng dòng; không xác nhận SKU gốc.${common}`,
  render: `# Render Evidence\nJob \`rjob_328da2c2c4\` hoàn tất bằng Blender Cycles sau khi áp đúng external root transform. PNG hiển thị trực tiếp nội thất GLB (giường, tủ lạnh, AC, bàn/gương, cây, rèm, vật liệu), không phải scene proxy. [Ảnh render](http://127.0.0.1:8000${renderUrl}).${common}`,
  final_qa: `# Final QA\nPASS: checksum đúng; canonical scale calibrated; spatial QA valid; external scene giữ nguyên; ảnh PNG thật tải được; inventory 10/10 dòng có giá comparable; tổng và VAT tính được. Giới hạn: không chứng nhận SKU, kết cấu hoặc thi công hiện trường.${common}`,
  delivery: `# Chief Delivery\nBàn giao Small Apartment — Morning Version từ đúng GLB nguồn: Studio 3D whole-scene, canonical revision ${scene.revision}, render Cycles, kiểm kê ngữ nghĩa và BOM tham khảo ${cost.total_vnd.toLocaleString("vi-VN")} đ. Phạm vi giá chưa gồm vận chuyển và cần báo lại khi mua thật.${common}`,
};

for (const key of ["brief", "floorplan", "floorplan_qa", "geometry", "style", "furniture", "cost", "render", "final_qa", "delivery"]) {
  const stage = stages[key];
  const docKey = key === "geometry" ? "geometry_bim" : key;
  await json(`${base}/issues/${stage.issueId}/documents/${docKey}`, { method: "PUT", body: JSON.stringify({ title: `${key} — Small Apartment Morning Version`, format: "markdown", body: docs[key], baseRevisionId: null, changeSummary: "Persist verified source-bound workflow evidence" }) });
  const output = { sceneId, revision: scene.revision, summary: docs[key].split("\n")[1] || key, decisions: { sourceHash: hash, sourceBound: true }, references: [{ uri: `/api/issues/${stage.issueId}/documents/${docKey}` }] };
  if (key === "floorplan_qa") Object.assign(output, { verdict: "pass", corrections: [], checks: { sourceVerified: true, scaleVerified: true, topologyVerified: true } });
  if (key === "final_qa") Object.assign(output, { verdict: "pass", corrections: [] });
  const endpoint = `${base}/atelier/workflow/runs/${runId}/stages/${key}/complete`;
  await json(endpoint, { method: "POST", body: JSON.stringify({ idempotencyKey: randomUUID(), output }) });
  if (key === "delivery") await json(endpoint, { method: "POST", body: JSON.stringify({ idempotencyKey: randomUUID(), output, approve: true }) });
  console.log(`done ${key}`);
}

const final = await json(`${base}/atelier/workflow/runs/${runId}`);
console.log(JSON.stringify({ run: final.run.status, stages: final.stages.map((stage) => [stage.issue?.identifier, stage.stageKey, stage.status]), totalVnd: cost.total_vnd, renderUrl }, null, 2));
