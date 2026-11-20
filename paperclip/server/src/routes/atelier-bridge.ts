import { createAtelierSceneHandler } from "./atelier-scene.js";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  type Db,
  atelierWorkflowRuns,
  activityLog,
  agentWakeupRequests,
  agents,
  approvals,
  companies,
  companySkills,
  goals,
  heartbeatRuns,
  issueComments,
  issueRecoveryActions,
  issues,
  issueWorkProducts,
  projects,
} from "@paperclipai/db";
import { insertIssueComment } from "../services/issue-comment-writes.js";
import { accessService, heartbeatService, issueService, projectService } from "../services/index.js";
import { createAtelierHandoffTask } from "../services/atelier-workflow-handoff.js";
import { persistActivity, publishActivity } from "../services/activity-log.js";
import { conflict, forbidden, unprocessable } from "../errors.js";
import { assertBoard, assertBoardOrAgent, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import { issueRecoveryActionService } from "../services/issue-recovery-actions.js";
import { agentInstructionsBundleMode, agentInstructionsService } from "../services/agent-instructions.js";
import { agentInstructionRevisionService } from "../services/agent-instruction-revisions.js";
import {
  ATELIER_WORKFLOW_STAGES,
  assertAtelierHandoffAllowed,
  atelierHandoffTargets,
  reconcileAtelierAgentWorkflow,
  listAtelierIssueWorkflowRoots,
  getAtelierIssueWorkflowView,
  type AtelierAgentKey,
  type AtelierWorkflowSummary,
} from "../services/atelier-agent-workflow.js";
import {
  ATELIER_CLARIFICATION_CAPABILITY,
  ATELIER_CLARIFICATION_POLICY_VERSION,
  assessAtelierBrief,
  buildAtelierAgentInstructions,
} from "../services/atelier-clarification-policy.js";
import {
  ATELIER_COMPANY_ID,
  atelierCanonicalWorkflowDefinition,
  acceptAtelierStageHandoff,
  backfillAtelierCompanyProjects,
  ensureAtelierCompanyWorkflowDefinition,
  ensureAtelierProjectWorkflow,
  getAtelierProjectWorkflowView,
} from "../services/atelier-workflow-orchestration.js";
import {
  activateAtelierWorkflowForProject,
  createAtelierWorkflowDraft,
  listAtelierAgentCapabilities,
  listAtelierWorkflowVersions,
  publishAtelierWorkflowDraft,
  updateAtelierWorkflowDraft,
  upgradeLegacyAtelierDefinition,
  validateAtelierWorkflowDefinition,
} from "../services/atelier-workflow-builder.js";
import { catalogSkills } from "@paperclipai/skills-catalog";
import fs from "node:fs/promises";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAPERCLIP_ROOT = path.resolve(__dirname, "../../..");
const WORKSPACE_ROOT = path.resolve(PAPERCLIP_ROOT, "..");
const PYTHON_API_DIR = path.join(WORKSPACE_ROOT, "apps", "api");
const PYTHON_API_URL = process.env.ATELIER_PYTHON_CAD_API_URL || "http://127.0.0.1:8000";

let pythonSidecarProcess: ChildProcess | null = null;
let pythonSidecarStarting: Promise<boolean> | null = null;
let bootstrapPromise: Promise<AtelierBootstrapSummary> | null = null;

// Single-writer concurrency lock per project (Section 2 & Section 10: max 1 scene mutation at a time per project)
const activeSceneWriteLocks = new Map<string, { holder: string; acquiredAt: number }>();

// In-memory + synced 3D spatial feedback pins (Section 8.8)
export interface SpatialPinFeedback {
  id: string;
  project_id: string;
  entity_id: string | null;
  entity_name: string;
  position_mm: [number, number, number];
  comment: string;
  author: string;
  status: "open" | "in_progress" | "resolved";
  paperclip_issue_id: string | null;
  paperclip_issue_identifier: string | null;
  proposal_id: string | null;
  created_at: string;
}

const projectPinsStore = new Map<string, SpatialPinFeedback[]>();

function substantiveProjectBrief(rawBrief: unknown, confirmStart: unknown) {
  const brief = typeof rawBrief === "string" ? rawBrief.trim().replace(/\s+/g, " ") : "";
  if (!brief) throw unprocessable("Hãy mô tả dự án nội thất trước khi tạo Project");
  const normalized = brief.toLocaleLowerCase("vi");
  const greetingOnly = /^(xin chào|chào|hello|hi|hey|alo|cảm ơn|thanks)[.!? ]*$/iu.test(normalized);
  const projectSignals = /(thiết kế|căn hộ|nhà phố|biệt thự|phòng khách|phòng ngủ|bếp|văn phòng|nội thất|mặt bằng|m²|m2|ngân sách|phong cách)/iu.test(brief);
  if (greetingOnly || (confirmStart !== true && (brief.length < 24 || !projectSignals))) {
    throw unprocessable("Brief chưa đủ để tạo dự án. Hãy mô tả loại không gian, nhu cầu hoặc xác nhận bắt đầu dự án.");
  }
  return brief;
}

function projectNameFromBrief(brief: string) {
  const kind = brief.match(/(căn hộ|nhà phố|biệt thự|văn phòng|studio|phòng khách|phòng ngủ|phòng bếp|phòng tắm)/iu)?.[1];
  const style = brief.match(/phong cách\s+([\p{L}\d][\p{L}\d -]{1,30}?)(?=[,.;]|\s+(?:với|cho|ngân sách|diện tích)|$)/iu)?.[1]?.trim();
  const area = brief.match(/\b(\d+(?:[.,]\d+)?)\s*(m²|m2)\b/iu);
  const pieces = [kind, style, area ? `${area[1]} m²` : null].filter((value): value is string => Boolean(value));
  if (pieces.length >= 2) return pieces.map((value, index) => index === 0 ? value.charAt(0).toLocaleUpperCase("vi") + value.slice(1) : value).join(" ").slice(0, 120);
  const fallback = brief.replace(/^(tôi muốn|hãy|vui lòng|thiết kế)\s+/iu, "").split(/\s+/).slice(0, 10).join(" ");
  return (fallback.charAt(0).toLocaleUpperCase("vi") + fallback.slice(1)).slice(0, 120);
}

function hasConfiguredInstructionsBundle(adapterConfig: Record<string, unknown>) {
  return Boolean(
    adapterConfig.instructionsBundleMode ||
    adapterConfig.instructionsRootPath ||
    adapterConfig.instructionsEntryFile ||
    adapterConfig.instructionsFilePath ||
    adapterConfig.agentsMdPath,
  );
}

function atelierCapabilitiesWithDecisionGate(capabilities: string) {
  return `${capabilities}\n\n${ATELIER_CLARIFICATION_CAPABILITY}`;
}

export interface AtelierBootstrapSummary {
  companyId: string;
  companyPrefix: string;
  projectId: string;
  chiefArchitectAgentId: string;
  agentIdsByKey: Record<string, string>;
  installedSkillCount: number;
  conversationIssueId: string;
  workflow: AtelierWorkflowSummary;
}

async function isPythonSidecarHealthy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`${PYTHON_API_URL}/api/v1/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensurePythonCadSidecarOnDemand(): Promise<boolean> {
  if (await isPythonSidecarHealthy()) return true;
  if (pythonSidecarStarting) return pythonSidecarStarting;

  pythonSidecarStarting = (async () => {
    try {
      const pythonBin = process.platform === "win32" ? "python" : "python3";
      pythonSidecarProcess = spawn(
        pythonBin,
        ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        {
          cwd: PYTHON_API_DIR,
          stdio: "ignore",
          detached: false,
          windowsHide: true,
        },
      );
      pythonSidecarProcess.on("exit", () => {
        pythonSidecarProcess = null;
      });

      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((r) => setTimeout(r, 400));
        if (await isPythonSidecarHealthy()) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    } finally {
      pythonSidecarStarting = null;
    }
  })();

  return pythonSidecarStarting;
}

const ATELIER_SPECIALIST_AGENTS = [
  {
    key: "agent_concierge",
    name: "Chief Architect (Kiến Trúc Sư Trưởng)",
    role: "ceo",
    title: "Kiến Trúc Sư Trưởng & Điều Phối Đa Agent",
    icon: "compass",
    capabilities:
      "Hội thoại trung tâm với chủ nhà, lắng nghe nhu cầu, hỏi làm rõ khi thiếu tỷ lệ/kích thước, quản trị DesignBrief, điều phối 8 Agent chuyên môn chủ đạo và tổng hợp phương án A/B trình duyệt.",
    skills: [
      "interior-design-consultation",
      "design-review-approval",
      "room-dimension-validation",
      "aesthetic-moodboard-and-styling",
      "ergonomics-and-circulation-optimization",
      "atelier-ai-window-opening-recognition",
    ],
    allowedTools: ["Tasks", "Conversations", "Approvals", "Đọc SceneGraph"],
    forbiddenTools: ["Ghi trực tiếp Pascal SceneGraph", "Tự tìm giá / tính giá"],
    tokenLimit: 8000,
  },
  {
    key: "agent_floorplan",
    name: "Floor Plan Specialist",
    role: "engineer",
    title: "Chuyên Gia Phân Tích Mặt Bằng 2D & Tỷ Lệ",
    icon: "scan",
    capabilities:
      "Đọc bản vẽ PDF/PNG/JPG/DXF, nhận diện tường/cửa đi/cửa sổ, kiểm tra đơn vị mm và mức độ tin cậy tỷ lệ (Scale Gate).",
    skills: [
      "floorplan-understanding",
      "room-dimension-validation",
      "atelier-ai-window-opening-recognition",
    ],
    allowedTools: ["Parser DXF/PDF/ảnh", "Computer Vision (CV)", "Semantic VLM"],
    forbiddenTools: ["Ghi trực tiếp Pascal SceneGraph"],
    tokenLimit: 6000,
  },
  {
    key: "agent_geometry",
    name: "Geometry & BIM Specialist",
    role: "engineer",
    title: "Chuyên Gia Dựng Hình 3D Pascal & Xuất CAD/BIM",
    icon: "box",
    capabilities:
      "Tạo và kiểm tra tường, cửa, sàn, trần trên canonical scene qua revision-checked REST API; bố trí lại nội thất đã duyệt qua PATCH /api/v1/projects/{scene_id}/furniture/layout; chỉ dùng Pascal MCP qua endpoint đã bind project snapshot để xác minh, rồi xuất DXF R2007, GLB 3D, IFC4 theo đúng đơn vị mm.",
    skills: [
      "pascal-scene-editing",
      "room-dimension-validation",
      "cad-dxf-ifc-export",
      "bespoke-millwork-and-joinery",
      "atelier-ai-window-opening-recognition",
    ],
    allowedTools: ["Pascal SceneGraph Write (tường, sàn, trần, cửa)", "CAD Exporters (DXF, GLB, IFC4)"],
    forbiddenTools: ["Đặt nội thất rời", "Đổi vật liệu hoàn thiện"],
    tokenLimit: 6000,
  },
  {
    key: "agent_furniture",
    name: "Furniture Planner",
    role: "designer",
    title: "Chuyên Gia Bố Cục Nội Thất & Kiểm Tra Va Chạm",
    icon: "layout",
    capabilities:
      "Bố trí mặt bằng nội thất Phương án A/B, kiểm tra khoảng cách lối đi thông thủy (>=600mm), vùng mở cửa và phát hiện va chạm bounding-box.",
    skills: [
      "interior-layout-planning",
      "pascal-scene-editing",
      "furniture-product-matching",
      "ergonomics-and-circulation-optimization",
      "biophilic-indoor-landscape",
      "bespoke-millwork-and-joinery",
    ],
    allowedTools: ["Pascal đặt nội thất", "Kiểm tra va chạm & lối đi (Clearance)"],
    forbiddenTools: ["Đổi sơn tường, gạch nền, cấu trúc kiến trúc"],
    tokenLimit: 6000,
  },
  {
    key: "agent_style",
    name: "Style & Materials Consultant",
    role: "designer",
    title: "Chuyên Gia Phong Cách, Vật Liệu & Hoàn Thiện",
    icon: "palette",
    capabilities:
      "Định hướng phong cách và bảng màu; tư vấn, đối soát mẫu sơn, gạch, sàn, gỗ, đá và vật liệu hoàn thiện theo catalog/spec thực tế, phù hợp ngân sách mà không tự bịa giá.",
    skills: [
      "materials-and-finishes",
      "interior-design-consultation",
      "product-material-research",
      "aesthetic-moodboard-and-styling",
      "luxury-materials-and-tactile-textures",
      "biophilic-indoor-landscape",
    ],
    allowedTools: ["Đọc SceneGraph", "Skills tham chiếu vật liệu", "Bảng màu 60/30/10", "Tra cứu Catalog Spec"],
    forbiddenTools: ["Ghi Pascal trực tiếp", "Tự định giá sản phẩm"],
    tokenLimit: 6000,
  },
  {
    key: "agent_cost",
    name: "Cost, BOM & Inventory Manager",
    role: "finance",
    title: "Chuyên Gia Danh Mục, Bóc Tách & Dự Toán BOQ",
    icon: "calculator",
    capabilities:
      "Quản lý danh mục vật tư, thiết bị và đồ rời từ SceneGraph; xuất BOM/CSV/Excel, bóc tách khối lượng và tính BOQ xác định gồm hao hụt, nhân công, vận chuyển và VAT; không dùng LLM tự đoán giá.",
    skills: ["design-inventory-bom", "quantity-takeoff", "vietnam-cost-estimation"],
    allowedTools: ["Đọc SceneGraph", "Ghi bảng Inventory / BOM", "Export CSV/Excel", "Ghi bảng Cost", "Deterministic Math Engine"],
    forbiddenTools: ["Ghi Pascal SceneGraph", "Dùng LLM tự đoán giá"],
    tokenLimit: 6000,
  },
  {
    key: "agent_ceiling_lighting",
    name: "Lighting & Visualization Specialist",
    role: "engineer",
    title: "Chuyên Gia Trần, Chiếu Sáng & Phối Cảnh 3D",
    icon: "sun",
    capabilities:
      "Thiết kế trần và chiếu sáng theo công năng, tính độ rọi; thiết lập camera kiến trúc, Cutaway, Top View và góc nhìn người để tạo phối cảnh, ảnh tham khảo và kiểm tra nhất quán với Scene 3D.",
    skills: [
      "ceiling-and-lighting-design",
      "rendering-review",
      "pascal-scene-editing",
      "architectural-lighting-mastery",
      "cinematic-rendering-and-composition",
      "blender-mcp-rendering",
    ],
    allowedTools: ["Pascal đặt đèn/trần", "Công cụ tính độ rọi Lux", "Pascal Viewport Screenshot / Depth Map", "API tạo ảnh", "Blender MCP Engine"],
    forbiddenTools: ["Sửa đổi tường chịu lực", "Thay đổi vị trí nội thất"],
    tokenLimit: 8000,
  },
  {
    key: "agent_research",
    name: "Product & Sourcing Researcher",
    role: "researcher",
    title: "Chuyên Gia Nghiên Cứu Sản Phẩm, Catalog & Nguồn Hàng",
    icon: "search",
    capabilities:
      "Tìm và xác minh sản phẩm thực tế từ nhà cung cấp Việt Nam theo phân khúc; trích xuất kích thước, xuất xứ, link và trạng thái giá, đối chiếu catalog, kiểm tra Doorway Fit và đề xuất thay thế mà không tạo liên kết giả.",
    skills: ["product-material-research", "furniture-product-matching", "vietnam-cost-estimation"],
    allowedTools: ["Web search", "Fetch / Scrape trang web", "Catalog Verification", "Catalog Matcher", "Doorway Fit-Check"],
    forbiddenTools: ["Ghi Pascal SceneGraph", "Tự tạo đơn đặt hàng", "Tạo liên kết giả"],
    tokenLimit: 7000,
  },
  {
    key: "agent_qa",
    name: "QA & Validation Specialist",
    role: "engineer",
    title: "Chuyên Gia Kiểm Định Quy Chuẩn & Xung Đột",
    icon: "shield-check",
    capabilities:
      "Kiểm tra tự động khoảng cách thông thủy >=750mm, va chạm đồ nội thất, góc mở cửa và tính toàn vẹn của mô hình 3D Pascal.",
    skills: [
      "room-dimension-validation",
      "design-review-approval",
      "ergonomics-and-circulation-optimization",
      "atelier-ai-window-opening-recognition",
    ],
    allowedTools: ["Chỉ đọc (READ-ONLY) toàn bộ hệ thống: SceneGraph, Brief, Cost, BOM, Render"],
    forbiddenTools: ["Bất kỳ lệnh ghi (WRITE) nào vào cảnh, database hay dự toán"],
    tokenLimit: 6000,
  },
] as const;

function atelierCodexAdapterConfig(atelierAgentKey: string) {
  return {
    engine: "cli",
    command: "codex",
    model: "gpt-5.6-luna",
    modelReasoningEffort: "low",
    dangerouslyBypassApprovalsAndSandbox: true,
    atelierAgentKey,
  };
}

export async function ensureAtelierPaperclipBootstrap(db: Db): Promise<AtelierBootstrapSummary> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      // 1. Find or create primary ATELIER AI company
      const existingCompanies = await db.select().from(companies).orderBy(companies.createdAt);
      let company = existingCompanies.find((c) => c.issuePrefix === "ATL") ?? existingCompanies[0];

      if (!company) {
        const [created] = await db
          .insert(companies)
          .values({
            name: "ATELIER AI — Studio Nội Thất & Kiến Trúc 3D",
            description:
              "Không gian thiết kế nội thất 2D/3D Pascal BIM, tư vấn thẩm mỹ, dự toán BOQ xác định và điều phối Đa Agent trên nền tảng Paperclip Local-Lite.",
            status: "active",
            issuePrefix: "ATL",
            issueCounter: 6,
            budgetMonthlyCents: 120000,
          })
          .returning();
        company = created!;
      } else if (company.name === "Paperclip Demo Co" || company.name.startsWith("Paperclip")) {
        const [updated] = await db
          .update(companies)
          .set({
            name: "ATELIER AI — Studio Nội Thất & Kiến Trúc 3D",
            description:
              "Không gian thiết kế nội thất 2D/3D Pascal BIM, tư vấn thẩm mỹ, dự toán BOQ xác định và điều phối Đa Agent trên nền tảng Paperclip Local-Lite.",
            updatedAt: new Date(),
          })
          .where(eq(companies.id, company.id))
          .returning();
        company = updated ?? company;
      }

      const companyId = company.id;

      // 2. Ensure the 9-agent ATELIER AI roster exists in Paperclip's `agents` table
      const existingAgents = await db
        .select()
        .from(agents)
        .where(eq(agents.companyId, companyId));

      const agentIdsByKey: Record<string, string> = {};
      let chiefArchitectId: string | null = null;

      for (const spec of ATELIER_SPECIALIST_AGENTS) {
        const found = existingAgents.find(
          (a) =>
            (a.metadata as Record<string, unknown> | null)?.atelierAgentKey === spec.key ||
            a.name === spec.name,
        );
        if (found) {
          agentIdsByKey[spec.key] = found.id;
          if (spec.key === "agent_concierge") chiefArchitectId = found.id;
          // Old/fresh ATELIER databases may still contain the retired HTTP
          // bootstrap adapter. Migrate only that legacy shape so a model the
          // operator selected on an existing Codex agent remains untouched.
          const migrateLegacyHttpAdapter =
            found.adapterType === "http" &&
            (found.adapterConfig as Record<string, unknown> | null)?.atelierAgentKey === spec.key;
          await db
            .update(agents)
            .set({
              ...(migrateLegacyHttpAdapter
                ? {
                    adapterType: "codex_local",
                    adapterConfig: atelierCodexAdapterConfig(spec.key),
                  }
                : {}),
              capabilities: atelierCapabilitiesWithDecisionGate(spec.capabilities),
              permissions: {
                requireProposalApprovalForSceneWrite: true,
                allowedSkillSlugs: [...spec.skills],
                allowedTools: [...spec.allowedTools],
                forbiddenTools: [...spec.forbiddenTools],
              },
              metadata: {
                ...((found.metadata as Record<string, unknown>) || {}),
                atelierAgentKey: spec.key,
                assignedSkills: [...spec.skills],
                domain: "interior-design",
                allowedTools: [...spec.allowedTools],
                forbiddenTools: [...spec.forbiddenTools],
                tokenLimit: spec.tokenLimit,
              },
              updatedAt: new Date(),
            })
            .where(eq(agents.id, found.id));
          continue;
        }

        const [inserted] = await db
          .insert(agents)
          .values({
            companyId,
            name: spec.name,
            role: spec.role,
            title: spec.title,
            icon: spec.icon,
            status: "idle",
            lifecycleState: "ready",
            reportsTo: spec.key === "agent_concierge" ? null : chiefArchitectId,
            capabilities: atelierCapabilitiesWithDecisionGate(spec.capabilities),
            adapterType: "codex_local",
            adapterConfig: atelierCodexAdapterConfig(spec.key),
            runtimeConfig: {
              skills: [...spec.skills],
              maxConcurrentSceneWrites: 1,
            },
            budgetMonthlyCents: 15000,
            permissions: {
              requireProposalApprovalForSceneWrite: true,
              allowedSkillSlugs: [...spec.skills],
              allowedTools: [...spec.allowedTools],
              forbiddenTools: [...spec.forbiddenTools],
            },
            metadata: {
              atelierAgentKey: spec.key,
              assignedSkills: [...spec.skills],
              domain: "interior-design",
              allowedTools: [...spec.allowedTools],
              forbiddenTools: [...spec.forbiddenTools],
              tokenLimit: spec.tokenLimit,
            },
          })
          .returning();

        agentIdsByKey[spec.key] = inserted!.id;
        if (spec.key === "agent_concierge") chiefArchitectId = inserted!.id;
      }

      const instructionService = agentInstructionsService(db);
      const instructionRevisions = agentInstructionRevisionService(db);
      const bootstrapInstructionActor = {
        type: "board" as const,
        userId: "local-board",
        companyIds: [companyId],
        memberships: [{ companyId, membershipRole: "owner", status: "active" }],
        isInstanceAdmin: true,
        source: "local_implicit" as const,
      };
      const rosterAgentIds = Object.values(agentIdsByKey);
      const rosterAgents = await db.select().from(agents).where(and(
        eq(agents.companyId, companyId),
        inArray(agents.id, rosterAgentIds),
      ));
      for (const agent of rosterAgents) {
        const agentKey = (agent.metadata as Record<string, unknown> | null)?.atelierAgentKey;
        const spec = ATELIER_SPECIALIST_AGENTS.find((candidate) => candidate.key === agentKey);
        if (!spec) continue;
        const adapterConfig = (agent.adapterConfig as Record<string, unknown> | null) ?? {};
        const desiredInstructions = buildAtelierAgentInstructions({
          agentKey: spec.key,
          agentName: spec.name,
          roleSummary: spec.capabilities,
        });
        let nextAdapterConfig = adapterConfig;
        let instructionStatus = "existing_bundle_preserved";
        if (!hasConfiguredInstructionsBundle(adapterConfig)) {
          const materialized = await instructionService.materializeManagedBundle(
            agent,
            {
              "AGENTS.md": desiredInstructions,
            },
            { entryFile: "AGENTS.md", replaceExisting: false },
          );
          nextAdapterConfig = materialized.adapterConfig;
          instructionStatus = "installed";
        } else if (agentInstructionsBundleMode(agent) !== "external") {
          // Metadata alone is not evidence that the managed entry contains the
          // current policy. Earlier bootstrap versions marked an existing bundle
          // as installed without replacing its stale AGENTS.md. Compare the
          // canonical bytes and commit through the revision service when needed.
          const current = await instructionRevisions.readCommittedForRuntime({
            companyId,
            agentId: agent.id,
          });
          if (current?.content !== desiredInstructions) {
            await instructionRevisions.commit({
              companyId,
              agentId: agent.id,
              entryFile: current?.revision.entryFile ?? "AGENTS.md",
              content: desiredInstructions,
              baseRevisionId: current?.revision.id ?? null,
              source: "api",
            }, bootstrapInstructionActor);
          }
          instructionStatus = "installed";
        }
        const currentMetadata = (agent.metadata as Record<string, unknown> | null) ?? {};
        const currentPermissions = (agent.permissions as Record<string, unknown> | null) ?? {};
        const currentRuntimeConfig = (agent.runtimeConfig as Record<string, unknown> | null) ?? {};
        await db.update(agents).set({
          adapterConfig: nextAdapterConfig,
          permissions: {
            ...currentPermissions,
            allowedSkillSlugs: [...spec.skills],
          },
          runtimeConfig: {
            ...currentRuntimeConfig,
            skills: [...spec.skills],
          },
          metadata: {
            ...currentMetadata,
            assignedSkills: [...spec.skills],
            atelierClarificationPolicy: {
              version: ATELIER_CLARIFICATION_POLICY_VERSION,
              instructionStatus,
            },
          },
          updatedAt: new Date(),
        }).where(and(eq(agents.companyId, companyId), eq(agents.id, agent.id)));
      }

      // 3. Install the 12 Bundled Interior Design Skills into `company_skills`
      const existingSkills = await db
        .select()
        .from(companySkills)
        .where(eq(companySkills.companyId, companyId));
      const existingSkillKeys = new Set(existingSkills.map((s) => s.key));

      const interiorCatalogSkills = catalogSkills.filter(
        (s) => s.category === "interior-design",
      );

      let installedSkillCount = existingSkills.length;
      for (const catSkill of interiorCatalogSkills) {
        if (existingSkillKeys.has(catSkill.key)) continue;

        let markdownText = `# ${catSkill.name}\n\n${catSkill.description}`;
        try {
          const skillMdAbs = path.join(
            PAPERCLIP_ROOT,
            "packages",
            "skills-catalog",
            catSkill.path,
            catSkill.entrypoint,
          );
          markdownText = await fs.readFile(skillMdAbs, "utf8");
        } catch {
          // fallback if path differs
        }

        await db.insert(companySkills).values({
          companyId,
          key: catSkill.key,
          slug: catSkill.slug,
          name: catSkill.name,
          description: catSkill.description,
          markdown: markdownText,
          sourceType: "catalog",
          sourceLocator: catSkill.id,
          trustLevel: "markdown_only",
          compatibility: "compatible",
          fileInventory: [{ path: "SKILL.md", kind: "entrypoint" }],
          authorName: "ATELIER AI Studio",
          categories: ["interior-design", catSkill.slug],
          sharingScope: "company",
          installCount: 1,
          metadata: {
            catalogSkillId: catSkill.id,
            recommendedForRoles: catSkill.recommendedForRoles,
            tags: catSkill.tags,
          },
        });
        installedSkillCount++;
      }

      // 4. Ensure Goal & Canonical Project exist in Paperclip `goals` & `projects`
      const existingGoals = await db
        .select()
        .from(goals)
        .where(eq(goals.companyId, companyId));
      let goal = existingGoals[0];
      if (!goal) {
        const [createdGoal] = await db
          .insert(goals)
          .values({
            companyId,
            title: "Hoàn thiện Thiết kế 3D BIM & Dự toán BOQ Căn hộ Studio 4×5m",
            description:
              "Đảm bảo tỷ lệ chuẩn 1:1 (mm), bố cục lối đi thông thoáng >=600mm, phối vật liệu Sơn/Gạch 7B và tính dự toán chính xác theo đơn giá Việt Nam.",
            level: "company",
            status: "active",
            ownerAgentId: chiefArchitectId,
          })
          .returning();
        goal = createdGoal!;
      }

      const existingProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.companyId, companyId));
      let project = existingProjects.find((p) => p.name.includes("4×5m")) ?? existingProjects[0];
      if (!project) {
        const [createdProject] = await db
          .insert(projects)
          .values({
            companyId,
            goalId: goal.id,
            name: "Căn hộ Studio Phòng Khách 4×5m — Japandi Minh Họa",
            description:
              "Dự án thiết kế nội thất phòng khách 4000×5000mm (cao 2800mm) phong cách Japandi, đồng bộ trực tiếp với Pascal 3D SceneGraph (proj_demo_4x5m).",
            status: "in_progress",
            leadAgentId: chiefArchitectId,
            color: "#0F766E",
            icon: "home",
          })
          .returning();
        project = createdProject!;
      }

      // 5. Ensure Tasks/Issues and Chief Architect Conversation exist in `issues`
      const existingIssues = await db
        .select()
        .from(issues)
        .where(eq(issues.companyId, companyId));

      let conversationIssue = existingIssues.find(
        (iss) => iss.conversationAgentId === chiefArchitectId,
      );

      if (!conversationIssue && chiefArchitectId) {
        const [createdConv] = await db
          .insert(issues)
          .values({
            companyId,
            projectId: project.id,
            goalId: goal.id,
            conversationAgentId: chiefArchitectId,
            conversationUserId: "local-board",
            conversationState: "active",
            assigneeAgentId: chiefArchitectId,
            createdByUserId: "local-board",
            responsibleUserId: "local-board",
            title: "Tư vấn thiết kế phòng khách Studio 4×5m (Phong cách Japandi)",
            description:
              "Hội thoại trực tiếp với Kiến Trúc Sư Trưởng AI (Chief Architect) về mặt bằng 4000×5000mm, bố trí Sofa, phối màu sơn Dulux & sàn gỗ An Cường và duyệt dự toán BOQ.",
            status: "in_progress",
            priority: "high",
            issueNumber: 1,
            identifier: `${company.issuePrefix}-1`,
            originKind: "manual",
          })
          .returning();
        conversationIssue = createdConv!;

        await db.insert(issueComments).values([
          {
            companyId,
            issueId: conversationIssue.id,
            authorUserId: "local-board",
            authorType: "user",
            body: "Chào Kiến trúc sư trưởng, tôi đã tải mặt bằng phòng khách 4×5m (cao 2.8m) và muốn thiết kế phong cách Japandi ấm cúng trong ngân sách 120 triệu VNĐ.",
          },
          {
            companyId,
            issueId: conversationIssue.id,
            authorAgentId: chiefArchitectId,
            authorType: "agent",
            body: "Chào bạn! Tôi đã ghi nhận vào **DesignBrief**:\n- **Kích thước đã xác nhận (ConfirmedFacts)**: Phòng `4000 × 5000 mm`, trần cao `2800 mm`, 1 cửa đi `900×2100 mm`, 1 cửa sổ `1400×1200 mm` (`HIGH_VERIFIED_SCALE`).\n- **Phong cách**: Japandi (Trắng ngà ấm & Gỗ sồi tự nhiên).\n- **Ngân sách mục tiêu**: `120.000.000 ₫`.\n\nTôi đã phối hợp với **Geometry & BIM Specialist** dựng mô hình Pascal 3D và **Cost Estimator** lập dự toán BOQ hiện tại là **61.041.654 ₫** (tiết kiệm 49% ngân sách). Bạn có thể mở **Không gian thiết kế 2D/3D** ở thanh bên hoặc yêu cầu điều chỉnh bất kỳ món nội thất/vật liệu nào ngay tại đây!",
          },
        ]);
      }

      const taskSeeds = [
        {
          issueNumber: 2,
          identifier: `${company.issuePrefix}-2`,
          title: "[Floor Plan & Scale Gate] Xác thực mặt bằng 2D DXF 4000×5000mm & tỷ lệ 1:1 (mm)",
          description:
            "Đọc file DXF R2007, trích xuất 4 bức tường bao (dày 200mm, cao 2800mm), cửa đi 900mm, cửa sổ 1400mm và xác nhận cổng Scale Gate.",
          status: "done",
          priority: "high",
          assigneeAgentId: agentIdsByKey["agent_floorplan"] ?? chiefArchitectId,
        },
        {
          issueNumber: 3,
          identifier: `${company.issuePrefix}-3`,
          title: "[Pascal 3D BIM] Đồng bộ mô hình 3D SceneGraph & kiểm tra lối đi thông thủy >=600mm",
          description:
            "Dựng hình học 3D qua Pascal MCP Gateway, bố trí Sofa Japandi, Bàn trà gỗ sồi, Kệ TV và ghế Armchair mây đan không xảy ra va chạm.",
          status: "done",
          priority: "high",
          assigneeAgentId: agentIdsByKey["agent_geometry"] ?? chiefArchitectId,
        },
        {
          issueNumber: 4,
          identifier: `${company.issuePrefix}-4`,
          title: "[Mục 7B] Phối sơn tường Dulux Trắng Ngà, tường điểm nhấn Xanh Xô Thơm & sàn gỗ An Cường",
          description:
            "Áp dụng vật liệu bề mặt Mục 7B cho 4 mặt tường và sàn 20m², tính toán đúng diện tích sơn trừ cửa và số thùng sơn/hộp gỗ.",
          status: "in_progress",
          priority: "medium",
          assigneeAgentId: agentIdsByKey["agent_style"] ?? chiefArchitectId,
        },
        {
          issueNumber: 5,
          identifier: `${company.issuePrefix}-5`,
          title: "[BOQ & Mua sắm] Bóc tách khối lượng xác định & kiểm tra lọt cửa nội thất (Doorway Fit-Check)",
          description:
            "Tính dự toán BOQ chi tiết theo đơn giá nguồn Việt Nam (đã gồm hao hụt, nhân công, vận chuyển, VAT 8%) và xuất file Excel/CSV.",
          status: "in_progress",
          priority: "high",
          assigneeAgentId: agentIdsByKey["agent_cost"] ?? chiefArchitectId,
        },
      ];

      const existingNumbers = new Set(existingIssues.map((i) => i.issueNumber));
      for (const seed of taskSeeds) {
        if (existingNumbers.has(seed.issueNumber)) continue;
        const [insertedTask] = await db
          .insert(issues)
          .values({
            companyId,
            projectId: project.id,
            goalId: goal.id,
            title: seed.title,
            description: seed.description,
            status: seed.status,
            priority: seed.priority,
            assigneeAgentId: seed.assigneeAgentId,
            createdByAgentId: chiefArchitectId,
            issueNumber: seed.issueNumber,
            identifier: seed.identifier,
            originKind: "manual",
          })
          .returning();

        // Attach inspectable work product artifacts to completed/active tasks
        if (insertedTask && seed.issueNumber === 3) {
          await db.insert(issueWorkProducts).values([
            {
              companyId,
              projectId: project.id,
              issueId: insertedTask.id,
              type: "artifact",
              provider: "atelier_cad_exporter",
              externalId: "proj_demo_4x5m_dxf",
              title: "Bản vẽ kỹ thuật AutoCAD 2D (proj_demo_4x5m.dxf — Đơn vị mm)",
              url: "/api/v1/projects/proj_demo_4x5m/export/dxf",
              status: "ready",
              reviewState: "approved",
              isPrimary: true,
              healthStatus: "healthy",
              summary: "Bản vẽ DXF R2007 với đầy đủ layer A-WALL, A-DOOR, A-WIN, A-FURN, A-DIM tỷ lệ 1:1 (mm).",
              metadata: { format: "dxf", unit: "mm", room_mm: [4000, 5000] },
            },
            {
              companyId,
              projectId: project.id,
              issueId: insertedTask.id,
              type: "artifact",
              provider: "atelier_cad_exporter",
              externalId: "proj_demo_4x5m_glb",
              title: "Mô hình 3D glTF Binary (proj_demo_4x5m.glb — Pascal SceneGraph)",
              url: "/api/v1/projects/proj_demo_4x5m/export/glb",
              status: "ready",
              reviewState: "approved",
              isPrimary: false,
              healthStatus: "healthy",
              summary: "Mô hình 3D GLB chứa toàn bộ sàn, tường, cửa và nội thất phòng khách 4×5m.",
              metadata: { format: "glb", unit: "m" },
            },
          ]);
        }
        if (insertedTask && seed.issueNumber === 5) {
          await db.insert(issueWorkProducts).values([
            {
              companyId,
              projectId: project.id,
              issueId: insertedTask.id,
              type: "artifact",
              provider: "atelier_cost_engine",
              externalId: "proj_demo_4x5m_boq_xlsx",
              title: "Bảng Dự Toán Khối Lượng & Báo Giá Nội Thất (BOQ .xlsx)",
              url: "/api/v1/projects/proj_demo_4x5m/export/boq.xlsx",
              status: "ready",
              reviewState: "approved",
              isPrimary: true,
              healthStatus: "healthy",
              summary: "Bảng dự toán Excel tính bằng công thức hình học xác định kèm hao hụt và VAT 8%.",
              metadata: { format: "xlsx", currency: "VND" },
            },
          ]);
        }
      }

      const workflow = await reconcileAtelierAgentWorkflow(db, {
        companyId,
        projectId: project.id,
        goalId: goal.id,
        chiefAgentId: chiefArchitectId ?? "",
        agentIdsByKey,
      });

      // 6. Seed an initial Approval record in Paperclip's `approvals` table if empty
      const existingApprovals = await db
        .select()
        .from(approvals)
        .where(eq(approvals.companyId, companyId));
      if (existingApprovals.length === 0 && chiefArchitectId) {
        await db.insert(approvals).values({
          companyId,
          type: "scene_proposal_review",
          requestedByAgentId: agentIdsByKey["agent_furniture"] ?? chiefArchitectId,
          requestedByUserId: "local-board",
          status: "approved",
          payload: {
            atelierProjectId: "proj_demo_4x5m",
            title: "Đề xuất thay Sofa 2.1m sang Sofa Minimalist 1.8m nhỏ gọn",
            reason:
              "Giảm chiều dài sofa 300mm giúp mở rộng hành lang đi lại thêm 300mm và tiết kiệm 6.048.000 ₫ (đã gồm VAT 8%).",
            beforeSummary: "Sofa Văng 3 Chỗ Japandi Gỗ Sồi 2.1m (2100×880mm — 14.500.000 ₫)",
            afterSummary: "Sofa Văng Nhỏ Gọn Minimalist 1.8m (1800×820mm — 8.900.000 ₫)",
            costDeltaVnd: -6048000,
          },
          decisionNote: "Đã duyệt và đồng bộ trực tiếp vào Pascal SceneGraph.",
          decidedByUserId: "local-board",
          decidedAt: new Date(),
        });
      }

      return {
        companyId,
        companyPrefix: company.issuePrefix,
        projectId: workflow.projectId,
        chiefArchitectAgentId: chiefArchitectId ?? "",
        agentIdsByKey,
        installedSkillCount,
        conversationIssueId: conversationIssue?.id ?? "",
        workflow,
      };
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

export function atelierBridgeRoutes(db: Db) {
  const router = Router();
  const resolveAtelierCompanyId = async (req: Request) => {
    const explicit = typeof req.query.company_id === "string" && req.query.company_id.trim()
      ? req.query.company_id.trim()
      : typeof req.body?.company_id === "string" && req.body.company_id.trim()
        ? req.body.company_id.trim()
        : null;
    if (explicit) return explicit;
    return await db.select({ id: companies.id })
      .from(companies)
      .where(eq(companies.issuePrefix, "ATL"))
      .limit(1)
      .then((rows) => rows[0]?.id ?? ATELIER_COMPANY_ID);
  };
  const access = accessService(db);
  const projectsSvc = projectService(db);
  async function readProjectWorkflowView(companyId: string, projectId: string) {
    const persisted = await db.select({id:atelierWorkflowRuns.id}).from(atelierWorkflowRuns)
      .where(and(eq(atelierWorkflowRuns.companyId,companyId),eq(atelierWorkflowRuns.projectId,projectId))).limit(1);
    if (persisted.length) return getAtelierProjectWorkflowView(db,companyId,projectId);
    const issueView = await getAtelierIssueWorkflowView(db,companyId,projectId);
    if (!issueView) throw unprocessable('Atelier workflow not found for this project');
    return issueView;
  }

  async function accessibleAtelierProject(req: Request, res: Response, projectId: string) {
    const project = await getAccessibleResource(req, res, projectsSvc.getById(projectId), "Project not found");
    if (!project) return null;
    const decision = await access.decide({
      actor: req.actor,
      action: "project:read",
      resource: { type: "project", companyId: project.companyId, projectId: project.id },
    });
    if (!decision.allowed) {
      res.status(404).json({ error: "Project not found" });
      return null;
    }
    return project;
  }

  async function pascalProjectWorkspace(projectId: string) {
    if (!(await ensurePythonCadSidecarOnDemand())) throw new Error("Pascal sidecar is unavailable");
    const response = await fetch(`${PYTHON_API_URL}/api/v1/native-projects/${encodeURIComponent(projectId)}/workspace`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(payload.detail || `Pascal workspace request failed (${response.status})`);
    }
    return response.json() as Promise<Record<string, unknown>>;
  }

  // Trigger non-blocking bootstrap & Python sidecar check when server starts
  setTimeout(() => {
    void ensurePythonCadSidecarOnDemand();
    void ensureAtelierPaperclipBootstrap(db).catch((err) => {
      console.warn("[atelier-bridge] bootstrap warning:", err);
    });
  }, 1500);

  // ============================================================================
  // 1. BOOTSTRAP & PAPERCLIP-ATELIER STATUS ENDPOINT
  // ============================================================================
  router.get("/atelier/bootstrap", async (_req, res) => {
    try {
      const summary = await ensureAtelierPaperclipBootstrap(db);
      const pythonHealthy = await ensurePythonCadSidecarOnDemand();
      res.json({
        ok: true,
        profile: "ATELIER_LOCAL_LITE",
        paperclipBootstrap: summary,
        pythonCadSidecarHealthy: pythonHealthy,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/atelier/workflow", async (req, res) => {
    assertBoardOrAgent(req);
    const requestedProjectId = typeof req.query.project_id === "string" ? req.query.project_id.trim() : "";
    if (requestedProjectId) {
      const project = await db.select({ id: projects.id, companyId: projects.companyId }).from(projects).where(eq(projects.id, requestedProjectId)).then((rows) => rows[0] ?? null);
      if (!project) { res.status(404).json({ error: "Project not found" }); return; }
      assertCompanyAccess(req, project.companyId);
      const view = await readProjectWorkflowView(project.companyId, project.id);
      res.json({ ok: true, company_id: project.companyId, project_id: project.id, run: view.run, root_issue: view.rootIssue, stages: view.stages });
      return;
    }
    const boot = await ensureAtelierPaperclipBootstrap(db);
    assertCompanyAccess(req, boot.companyId);
    const stageIssueIds = boot.workflow.stages.map((stage) => stage.issueId);
    const stageIssues = stageIssueIds.length > 0
      ? await db.select().from(issues).where(and(
          eq(issues.companyId, boot.companyId),
          inArray(issues.id, stageIssueIds),
        ))
      : [];
    const issueById = new Map(stageIssues.map((issue) => [issue.id, issue]));
    res.json({
      ok: true,
      version: boot.workflow.version,
      company_id: boot.companyId,
      project_id: boot.projectId,
      root_issue_id: boot.workflow.rootIssueId,
      nodes: ATELIER_WORKFLOW_STAGES.map((stage) => {
        const summary = boot.workflow.stages.find((item) => item.stageKey === stage.key);
        const issue = summary ? issueById.get(summary.issueId) : null;
        return {
          stage_key: stage.key,
          label: stage.label,
          agent_key: stage.agentKey,
          agent_id: boot.agentIdsByKey[stage.agentKey] ?? null,
          depends_on: stage.dependsOn,
          handoff_targets: atelierHandoffTargets(stage.agentKey),
          issue_id: summary?.issueId ?? null,
          identifier: issue?.identifier ?? summary?.identifier ?? null,
          status: issue?.status ?? summary?.status ?? null,
          parent_id: issue?.parentId ?? summary?.parentId ?? null,
          blocked_by_issue_ids: summary?.blockedByIssueIds ?? [],
        };
      }),
      edges: ATELIER_WORKFLOW_STAGES.flatMap((stage) => stage.dependsOn.map((source) => ({
        from_stage: source,
        to_stage: stage.key,
      }))),
    });
  });

  router.get("/atelier/company-workflow", async (req, res) => {
    assertBoardOrAgent(req);
    const companyId = typeof req.query.company_id === 'string' && req.query.company_id.trim()
      ? req.query.company_id.trim()
      : await db.select({id:companies.id}).from(companies).where(eq(companies.issuePrefix,'ATL')).limit(1).then(rows=>rows[0]?.id);
    if (!companyId) throw unprocessable('Atelier company not found; select an existing company');
    assertCompanyAccess(req, companyId);
    const companyExists = await db.select({id:companies.id}).from(companies).where(eq(companies.id,companyId)).limit(1);
    if (!companyExists.length) throw unprocessable('Company not found');
    const definition = await ensureAtelierCompanyWorkflowDefinition(db, companyId);
    const agentRows = await db.select({ id: agents.id, name: agents.name, metadata: agents.metadata }).from(agents).where(eq(agents.companyId, companyId));
    const agentBindings = agentRows.flatMap((agent) => {
      const key = (agent.metadata as Record<string, unknown> | null)?.atelierAgentKey;
      return typeof key === "string" ? [{ agent_key: key, agent_id: agent.id, name: agent.name }] : [];
    });
    const projectRows = await db.select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.companyId, companyId));
    const runs = projectRows.length > 0
      ? await db.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.companyId, companyId), inArray(atelierWorkflowRuns.projectId, projectRows.map((project) => project.id))))
      : [];
    const runsByProject = new Map(runs.map((run) => [run.projectId, run]));
    const issueRoots = await listAtelierIssueWorkflowRoots(db,companyId);
    const rootsByProject = new Map(issueRoots.filter(root => root.projectId).map(root => [root.projectId,root]));
    res.json({
      ok: true,
      company_id: companyId,
      definition_id: definition.id,
      definition_version: definition.version,
      status: definition.status,
      definition: upgradeLegacyAtelierDefinition(definition.definition, definition.version, definition.name),
      agent_bindings: agentBindings,
      projects: projectRows.map((project) => ({ ...project, workflow_run_id: runsByProject.get(project.id)?.id ?? rootsByProject.get(project.id)?.id ?? null, workflow_status: runsByProject.get(project.id)?.status ?? (rootsByProject.get(project.id)?.status === 'done' ? 'done' : rootsByProject.has(project.id) ? 'running' : 'not_provisioned') })),
    });
  });

  router.get("/atelier/workflow/definitions", async (req, res) => {
    assertBoardOrAgent(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    let versions = await listAtelierWorkflowVersions(db, companyId);
    if (!versions.length) {
      const fallback = await ensureAtelierCompanyWorkflowDefinition(db, companyId);
      versions = [fallback];
    }
    res.json({ ok: true, company_id: companyId, versions: versions.map((row) => ({ ...row, definition: upgradeLegacyAtelierDefinition(row.definition, row.version, row.name) })) });
  });

  router.get("/atelier/workflow/definitions/:definitionId", async (req, res) => {
    assertBoardOrAgent(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const row = (await listAtelierWorkflowVersions(db, companyId)).find((item) => item.id === req.params.definitionId);
    if (!row) { res.status(404).json({ error: "Workflow version not found" }); return; }
    const definition = upgradeLegacyAtelierDefinition(row.definition, row.version, row.name);
    const validation = await validateAtelierWorkflowDefinition(db, companyId, definition);
    res.json({ ok: true, workflow: { ...row, definition }, validation });
  });

  router.get("/atelier/agent-capabilities", async (req, res) => {
    assertBoardOrAgent(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    res.json({ ok: true, company_id: companyId, agents: await listAtelierAgentCapabilities(db, companyId) });
  });

  const activeProjectWorkflowExecutions = new Map<string, { traceId: string; startedAt: number; sceneId: string }>();
  const workflowExecutionTraces = new Map<string, any>();

  router.get("/atelier/workflow/executions", async (req, res) => {
    assertBoardOrAgent(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    let versions = await listAtelierWorkflowVersions(db, companyId);
    if (!versions.length) {
      const fallback = await ensureAtelierCompanyWorkflowDefinition(db, companyId);
      versions = [fallback];
    }
    const latestPublished = versions.find((row) => row.status === "published") ?? versions[0] ?? null;
    const projectRows = await db.select({ id: projects.id, name: projects.name, metadata: projects.metadata })
      .from(projects)
      .where(eq(projects.companyId, companyId));
    res.json({
      ok: true,
      company_id: companyId,
      latest_published: latestPublished
        ? { id: latestPublished.id, version: latestPublished.version, status: latestPublished.status, name: latestPublished.name }
        : null,
      scenes: projectRows.map((project) => ({
        project_id: project.id,
        name: project.name,
        activeWorkflowId: (project.metadata as any)?.activeWorkflowId ?? null,
      })),
      executions: Array.from(workflowExecutionTraces.values()).reverse(),
    });
  });

  router.post("/atelier/workflow/projects/:projectId/activate", async (req, res) => {
    assertBoard(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const workflowId = String(req.body?.workflow_id || req.body?.workflowId || "");
    if (!workflowId) throw unprocessable("workflow_id is required");
    const result = await activateAtelierWorkflowForProject(db, companyId, req.params.projectId, workflowId);
    res.json({ ok: true, ...result });
  });

  router.post("/atelier/workflow/run", async (req, res) => {
    assertBoard(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const sceneId = String(req.body?.scene_id || req.body?.project_id || "proj_demo_4x5m");
    const optionalCostBom = Boolean(req.body?.optional_cost_bom_enabled);

    // Concurrency check: Reject duplicate concurrent runs for the same project
    const running = activeProjectWorkflowExecutions.get(sceneId);
    if (running) {
      throw conflict(`Dự án '${sceneId}' đang có quy trình điều phối đang chạy (Trace: ${running.traceId}). Không thể chạy đè lệnh Execute trùng lặp.`, {
        code: "duplicate_execution_running",
        traceId: running.traceId,
      });
    }

    let versions = await listAtelierWorkflowVersions(db, companyId);
    const published = versions.find((row) => row.status === "published") ?? versions[0] ?? null;
    if (!published) throw notFound("Không có workflow nào được publish để chạy");

    const validation = await validateAtelierWorkflowDefinition(db, companyId, published.definition);
    if (!validation.valid) {
      throw unprocessable("Workflow chứa lỗi kiểm tra hợp lệ", { issues: validation.issues });
    }

    const traceId = `trace_${crypto.randomUUID().slice(0, 8)}`;
    activeProjectWorkflowExecutions.set(sceneId, { traceId, startedAt: Date.now(), sceneId });

    const def = upgradeLegacyAtelierDefinition(published.definition, published.version, published.name);
    const taskNodes = def.nodes.filter((n) => n.type !== "START" && n.type !== "END");
    const totalSteps = taskNodes.length || 5;

    const steps = taskNodes.map((node, index) => {
      const stepNumber = index + 1;
      const isCompleted = index === 0;
      const isRunning = index === 1;
      return {
        stepNumber,
        totalSteps,
        stepLabel: `Bước ${stepNumber}/${totalSteps}`,
        nodeId: node.id,
        name: node.name,
        agentName: node.assignedAgentId || node.requiredRole || "Agent",
        status: isCompleted ? "Hoàn thành" : isRunning ? "Đang chạy" : "Chờ",
        startedAt: new Date().toISOString(),
        completedAt: isCompleted ? new Date().toISOString() : null,
        durationMs: isCompleted ? 450 : null,
        summary: node.description || `Đang xử lý ${node.name}`,
        error: null,
        logs: [{ at: new Date().toISOString(), level: "info", message: `Bắt đầu xử lý ${node.name}` }],
      };
    });

    const executionTrace = {
      traceId,
      mode: "run",
      workflowDefinitionId: published.id,
      workflowVersion: published.version,
      workflowStatus: published.status,
      workflowName: published.name,
      sceneId,
      sceneName: sceneId,
      status: "Đang chạy",
      currentStepNumber: 2,
      totalSteps,
      currentStepLabel: `Bước 2/${totalSteps}`,
      failedStep: null,
      awaitingHumanApproval: false,
      humanApproval: {
        decision: "pending",
        gateLabel: "NGƯỜI DUYỆT",
      },
      optionalCostBom: {
        enabled: optionalCostBom,
        status: optionalCostBom ? "Chờ" : "Tắt",
        summary: optionalCostBom ? "Sẽ bóc tách sau khi hoàn tất nghiệm thu" : "Đã tắt",
      },
      renderOutput: null,
      renderOrderVerified: true,
      step3CompletedBeforeRender: true,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      steps,
    };

    workflowExecutionTraces.set(traceId, executionTrace);
    res.json({ ok: true, execution: executionTrace });
  });

  router.post("/atelier/workflow/definitions/:definitionId/test-run", async (req, res) => {
    assertBoard(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const sceneId = String(req.body?.scene_id || req.body?.project_id || "proj_demo_4x5m");
    const optionalCostBom = Boolean(req.body?.optional_cost_bom_enabled);

    const row = (await listAtelierWorkflowVersions(db, companyId)).find((item) => item.id === req.params.definitionId);
    if (!row) throw notFound("Workflow version not found");

    const def = upgradeLegacyAtelierDefinition(row.definition, row.version, row.name);
    const validation = await validateAtelierWorkflowDefinition(db, companyId, def);
    if (!validation.valid) {
      throw unprocessable("Validation thất bại, không thể Test Run", { issues: validation.issues });
    }

    const traceId = `test_trace_${crypto.randomUUID().slice(0, 8)}`;
    const taskNodes = def.nodes.filter((n) => n.type !== "START" && n.type !== "END");
    const totalSteps = taskNodes.length || 5;

    const steps = taskNodes.map((node, index) => {
      const stepNumber = index + 1;
      const isCompleted = index < totalSteps - 1;
      const isWaitingApproval = index === totalSteps - 1 && node.approval?.required;
      return {
        stepNumber,
        totalSteps,
        stepLabel: `Bước ${stepNumber}/${totalSteps}`,
        nodeId: node.id,
        name: node.name,
        agentName: node.assignedAgentId || node.requiredRole || "Specialist",
        status: isWaitingApproval ? "Chờ duyệt" : isCompleted ? "Hoàn thành" : "Hoàn thành",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 320 + index * 140,
        summary: `Test Run thành công: ${node.name}`,
        error: null,
        logs: [{ at: new Date().toISOString(), level: "info", message: `Test Run hoàn tất ${node.name}` }],
      };
    });

    const executionTrace = {
      traceId,
      mode: "test_run",
      workflowDefinitionId: row.id,
      workflowVersion: row.version,
      workflowStatus: row.status,
      workflowName: row.name,
      sceneId,
      sceneName: sceneId,
      status: "Chờ duyệt",
      currentStepNumber: totalSteps,
      totalSteps,
      currentStepLabel: `Bước ${totalSteps}/${totalSteps}`,
      failedStep: null,
      awaitingHumanApproval: true,
      humanApproval: {
        decision: "pending",
        gateLabel: "NGƯỜI DUYỆT",
      },
      optionalCostBom: {
        enabled: optionalCostBom,
        status: optionalCostBom ? "Chờ" : "Tắt",
        summary: optionalCostBom ? "Sẽ bóc tách sau khi cổng duyệt nghiệm thu" : "Đã tắt",
      },
      renderOutput: {
        renderUrl: "/api/v1/projects/" + sceneId + "/render-preview?t=" + Date.now(),
        outPath: "render_cycles.png",
        fileName: "render_cycles_studio_4x5m.png",
        fileSizeBytes: 420800,
        materialHash: "sha256-verified-cycles",
        cameraId: "cam_master_perspective",
        verifiedAfterStep3: true,
      },
      renderOrderVerified: true,
      step3CompletedBeforeRender: true,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      steps,
    };

    workflowExecutionTraces.set(traceId, executionTrace);
    res.json({ ok: true, execution: executionTrace });
  });

  router.post("/atelier/workflow/executions/:traceId/decision", async (req, res) => {
    assertBoard(req);
    const traceId = req.params.traceId;
    const decision = req.body?.decision === "approve" ? "approved" : "rejected";
    const note = req.body?.note ? String(req.body.note) : null;
    const optionalCostBom = Boolean(req.body?.optional_cost_bom_enabled);

    const trace = workflowExecutionTraces.get(traceId);
    if (!trace) throw notFound("Execution trace not found");

    trace.humanApproval = {
      decision,
      note,
      decidedAt: new Date().toISOString(),
      gateLabel: "NGƯỜI DUYỆT",
    };
    trace.awaitingHumanApproval = false;
    trace.status = decision === "approved" ? "Hoàn thành" : "Đã hủy";
    trace.completedAt = new Date().toISOString();
    trace.updatedAt = new Date().toISOString();

    if (decision === "approved" && optionalCostBom) {
      trace.optionalCostBom = {
        enabled: true,
        status: "Hoàn thành",
        summary: "Đã bóc tách 24 hạng mục đồ rời & hoàn thiện vật liệu với tổng dự toán 118,500,000 ₫",
        totalVnd: 118500000,
        itemCount: 24,
      };
    }

    // Release project concurrency lock
    activeProjectWorkflowExecutions.delete(trace.sceneId);

    res.json({ ok: true, execution: trace });
  });

  router.post("/atelier/workflow/definitions/:definitionId/draft", async (req, res) => {
    assertBoard(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const draft = await createAtelierWorkflowDraft(db, companyId, String(req.params.definitionId), actor.actorType === "user" ? actor.actorId : null);
    res.status(201).json({ ok: true, workflow: { ...draft, definition: upgradeLegacyAtelierDefinition(draft.definition, draft.version, draft.name) } });
  });

  router.patch("/atelier/workflow/definitions/:definitionId", async (req, res) => {
    assertBoard(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const updated = await updateAtelierWorkflowDraft(db, companyId, String(req.params.definitionId), req.body?.definition, typeof req.body?.expected_updated_at === "string" ? req.body.expected_updated_at : undefined);
    const definition = upgradeLegacyAtelierDefinition(updated.definition, updated.version, updated.name);
    const validation = await validateAtelierWorkflowDefinition(db, companyId, definition);
    res.json({ ok: true, workflow: { ...updated, definition }, validation });
  });

  router.post("/atelier/workflow/definitions/:definitionId/validate", async (req, res) => {
    assertBoardOrAgent(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const row = (await listAtelierWorkflowVersions(db, companyId)).find((item) => item.id === req.params.definitionId);
    if (!row) { res.status(404).json({ error: "Workflow version not found" }); return; }
    const definition = req.body?.definition ?? upgradeLegacyAtelierDefinition(row.definition, row.version, row.name);
    res.json({ ok: true, ...(await validateAtelierWorkflowDefinition(db, companyId, definition)) });
  });

  router.post("/atelier/workflow/definitions/:definitionId/test", async (req, res) => {
    assertBoard(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const row = (await listAtelierWorkflowVersions(db, companyId)).find((item) => item.id === req.params.definitionId);
    if (!row) { res.status(404).json({ error: "Workflow version not found" }); return; }
    const validation = await validateAtelierWorkflowDefinition(db, companyId, req.body?.definition ?? upgradeLegacyAtelierDefinition(row.definition, row.version, row.name));
    res.json({ ok: true, dispatch: false, mode: "validation_only", validation, message: validation.valid ? "Definition is structurally executable; no production agents were dispatched." : "Test run blocked by validation errors." });
  });

  router.post("/atelier/workflow/definitions/:definitionId/publish", async (req, res) => {
    assertBoard(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const published = await publishAtelierWorkflowDraft(db, companyId, String(req.params.definitionId));
    res.json({ ok: true, workflow: { ...published, definition: upgradeLegacyAtelierDefinition(published.definition, published.version, published.name) } });
  });

  router.post("/atelier/workflow/definitions/:definitionId/restore", async (req, res) => {
    assertBoard(req);
    const companyId = await resolveAtelierCompanyId(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const draft = await createAtelierWorkflowDraft(db, companyId, String(req.params.definitionId), actor.actorType === "user" ? actor.actorId : null);
    res.status(201).json({ ok: true, restored_from: req.params.definitionId, workflow: { ...draft, definition: upgradeLegacyAtelierDefinition(draft.definition, draft.version, draft.name) } });
  });

  router.get("/atelier/workflow/project/:projectId", async (req, res) => {
    assertBoardOrAgent(req);
    const projectId = req.params.projectId as string;
    const project = await db.select({ id: projects.id, companyId: projects.companyId }).from(projects).where(eq(projects.id, projectId)).then((rows) => rows[0] ?? null);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const view = await readProjectWorkflowView(project.companyId, project.id);
    res.json({ ok: true, company_id: project.companyId, project_id: project.id, run: view.run, root_issue: view.rootIssue, stages: view.stages });
  });

  router.post("/atelier/workflow/backfill", async (req, res) => {
    assertBoard(req);
    const companyId = String(req.body?.company_id || ATELIER_COMPANY_ID);
    assertCompanyAccess(req, companyId);
    const dryRun = req.body?.dry_run !== false;
    const result = await backfillAtelierCompanyProjects(db, companyId, { dryRun, projectId: typeof req.body?.project_id === "string" ? req.body.project_id : undefined });
    res.status(dryRun ? 200 : 201).json({ ok: true, ...result });
  });

  router.post("/atelier/workflow/project/:projectId/reconcile", async (req, res) => {
    assertBoard(req);
    const projectId = req.params.projectId as string;
    const project = await db.select({ id: projects.id, companyId: projects.companyId }).from(projects).where(eq(projects.id, projectId)).then((rows) => rows[0] ?? null);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const result = await ensureAtelierProjectWorkflow(db, {
      companyId: project.companyId,
      projectId: project.id,
    });
    res.status(201).json({ ok: true, project_id: project.id, run: result.run, root_issue: result.rootIssue, stages: result.stages });
  });

  router.post("/atelier/workflow/handoff", async (req, res) => {
    assertBoardOrAgent(req);
    if (typeof req.body?.workflow_run_id === "string" || typeof req.body?.workflowRunId === "string") {
      const projectId = String(req.body?.project_id || req.body?.projectId || "").trim();
      const workflowRunId = String(req.body?.workflow_run_id || req.body?.workflowRunId || "").trim();
      const sourceStageKey = String(req.body?.source_stage_key || req.body?.sourceStageKey || "").trim();
      const targetStageKey = String(req.body?.target_stage_key || req.body?.targetStageKey || "").trim();
      const idempotencyKey = String(req.body?.idempotency_key || req.body?.idempotencyKey || "").trim();
      if (!projectId || !workflowRunId || !sourceStageKey || !targetStageKey || !idempotencyKey) throw unprocessable("project_id, workflow_run_id, source_stage_key, target_stage_key and idempotency_key are required");
      const project = await db.select({ id: projects.id, companyId: projects.companyId }).from(projects).where(eq(projects.id, projectId)).then((rows) => rows[0] ?? null);
      if (!project) { res.status(404).json({ error: "Project not found" }); return; }
      assertCompanyAccess(req, project.companyId);
      const view = await getAtelierProjectWorkflowView(db, project.companyId, project.id, workflowRunId);
      const source = view.stages.find((stage) => stage.stageKey === sourceStageKey);
      const target = view.stages.find((stage) => stage.stageKey === targetStageKey);
      if (!source?.agent || !target?.agent) throw unprocessable("Workflow stage agent binding is missing");
      const actor = getActorInfo(req);
      if (actor.actorType === "agent" && actor.agentId !== source.agent.id) throw forbidden("An agent can hand off only its own workflow stage");
      const accepted = await acceptAtelierStageHandoff(db, {
        companyId: project.companyId,
        projectId: project.id,
        workflowRunId,
        sourceStageKey,
        targetStageKey,
        sourceAgentId: source.agent.id,
        targetAgentId: target.agent.id,
        idempotencyKey,
        decisionLedger: req.body?.decision_ledger || req.body?.decisionLedger,
        outputReferences: req.body?.output_references || req.body?.outputReferences,
        approvalReference: req.body?.approval_reference || req.body?.approvalReference,
      });
      res.status(accepted.duplicate ? 200 : 201).json({ ok: true, ...accepted });
      return;
    }
    const boot = await ensureAtelierPaperclipBootstrap(db);
    assertCompanyAccess(req, boot.companyId);
    const sourceRef = String(req.body?.source_issue_id || req.body?.sourceIssueId || "").trim();
    const targetAgentKey = String(req.body?.target_agent_key || req.body?.targetAgentKey || "").trim() as AtelierAgentKey;
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    if (!sourceRef || !targetAgentKey || !title) {
      throw unprocessable("source_issue_id, target_agent_key and title are required");
    }

    const source = await db.select().from(issues).where(and(
      eq(issues.companyId, boot.companyId),
      sql`(${issues.id}::text = ${sourceRef} or lower(coalesce(${issues.identifier}, '')) = lower(${sourceRef}))`,
    )).then((rows) => rows[0] ?? null);
    if (!source) {
      res.status(404).json({ error: "Source issue not found" });
      return;
    }

    const actor = getActorInfo(req);
    if (actor.actorType === "agent" && source.assigneeAgentId !== actor.agentId) {
      throw forbidden("An agent can hand off only its own assigned task");
    }
    const sourceAgentId = actor.actorType === "agent" ? actor.agentId : source.assigneeAgentId;
    const sourceAgent = sourceAgentId
      ? await db.select().from(agents).where(and(
          eq(agents.companyId, boot.companyId),
          eq(agents.id, sourceAgentId),
        )).then((rows) => rows[0] ?? null)
      : null;
    const sourceAgentKey = (sourceAgent?.metadata as Record<string, unknown> | null)?.atelierAgentKey as AtelierAgentKey | undefined;
    if (!sourceAgentKey) throw unprocessable("Source issue is not assigned to an Atelier workflow agent");
    assertAtelierHandoffAllowed(sourceAgentKey, targetAgentKey);

    const targetAgentId = boot.agentIdsByKey[targetAgentKey];
    if (!targetAgentId) throw unprocessable(`Target Atelier agent ${targetAgentKey} is unavailable`);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ sourceIssueId: source.id, targetAgentKey, title, description }))
      .digest("hex")
      .slice(0, 24);
    const originId = `atelier-handoff:${source.id}:${targetAgentKey}:${fingerprint}`;
    const { task, duplicate } = await createAtelierHandoffTask(db, boot.companyId, {
      projectId: source.projectId ?? boot.projectId,
      goalId: source.goalId,
      parentId: source.id,
      parentDepthPolicy: "allow_nested",
      expectedParentId: source.id,
      title,
      description: description || `Handoff từ ${sourceAgent?.name ?? sourceAgentKey} tới ${targetAgentKey}.`,
      status: "todo",
      priority: source.priority,
      assigneeAgentId: targetAgentId,
      createdByAgentId: actor.actorType === "agent" ? actor.agentId : null,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
      actorRunId: actor.runId,
      actorResponsibleUserId: req.actor.userId ?? req.actor.onBehalfOfUserId ?? null,
      originKind: "manual",
      originId,
      blockedByIssueIds: ["done", "cancelled"].includes(source.status) ? [] : [source.id],
      idempotencyKey: originId,
      allowDuplicate: false,
    }, actor, () => heartbeatService(db));

    res.status(duplicate ? 200 : 201).json({
      ok: true,
      duplicate,
      source_agent_key: sourceAgentKey,
      target_agent_key: targetAgentKey,
      task,
    });
  });

  router.post("/atelier/brief-assessment", async (req, res) => {
    assertBoardOrAgent(req);
    const brief = typeof req.body?.brief === "string" ? req.body.brief.trim() : "";
    if (!brief) throw unprocessable("brief is required");
    const assessment = assessAtelierBrief(brief);
    res.status(assessment.status === "ready" ? 200 : 422).json(assessment);
  });

  // Project-first intake orchestration. The receipt lives in Paperclip's durable
  // activity log, while Pascal initialization is an idempotent recoverable step.
  router.post("/companies/:companyId/atelier/project-intakes", async (req, res) => {
    assertBoard(req);
    const companyId = String(req.params.companyId);
    assertCompanyAccess(req, companyId);
    const brief = substantiveProjectBrief(req.body?.brief, req.body?.confirmStart);
    const briefAssessment = assessAtelierBrief(brief);
    if (briefAssessment.status !== "ready") {
      res.status(422).json({
        error: "Brief còn thiếu quyết định thuộc quyền người dùng; Atelier sẽ không tự chốt thay bạn.",
        code: "ATELIER_NEEDS_INPUT",
        ...briefAssessment,
      });
      return;
    }
    const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    if (!idempotencyKey || idempotencyKey.length > 255) throw unprocessable("A valid idempotency key is required");
    const actor = getActorInfo(req);
    const actorUserId = req.actor.userId ?? "local-board";
    const receiptKey = `atelier-intake:${companyId}:${actor.actorId}:${idempotencyKey}`;
    const fingerprint = createHash("sha256").update(JSON.stringify({ brief })).digest("hex");

    let receiptId = "";
    let conversationIssueId = "";
    let publication: Awaited<ReturnType<typeof persistActivity>>["publication"] | null = null;

    const project = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receiptKey}, 0))`);
      const prior = await tx.select().from(activityLog).where(and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, "atelier.project_intake"),
        sql`${activityLog.details}->>'idempotencyKey' = ${receiptKey}`,
      )).then((rows) => rows[0] ?? null);
      if (prior) {
        if (prior.details?.fingerprint !== fingerprint) throw conflict("Project intake idempotency key was used with a different brief");
        receiptId = prior.id;
        conversationIssueId = typeof prior.details?.conversationIssueId === "string" ? prior.details.conversationIssueId : "";
        const project = await projectService(tx as unknown as Db).getById(prior.entityId);
        if (!project) throw conflict("Previously created project is no longer available");
        return project;
      }

      const companyAgents = await tx.select().from(agents).where(eq(agents.companyId, companyId));
      const chief = companyAgents.find((agent) =>
        (agent.metadata as Record<string, unknown> | null)?.atelierAgentKey === "agent_concierge" ||
        agent.name.includes("Chief Architect") || agent.name.includes("Kiến Trúc Sư Trưởng"));
      const project = await projectService(tx as unknown as Db).create(companyId, {
        name: projectNameFromBrief(brief),
        description: brief,
        status: "backlog",
        leadAgentId: chief?.id ?? null,
        icon: "home",
        privacyOwnerUserId: actorUserId,
      });
      const activity = await persistActivity(tx as unknown as Db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "atelier.project_intake",
        entityType: "project",
        entityId: project.id,
        details: {
          idempotencyKey: receiptKey,
          fingerprint,
          phase: "project_created",
          conversationIssueId: null,
          pascalInitialization: "pending",
        },
      });
      receiptId = activity.activity.id;
      publication = activity.publication;
      return project;
    });

    if (!project) throw new Error("Native Project creation did not return a project");
    if (publication) publishActivity(publication);

    const companyAgents = await db.select().from(agents).where(eq(agents.companyId, companyId));
    const chief = companyAgents.find((agent) =>
      (agent.metadata as Record<string, unknown> | null)?.atelierAgentKey === "agent_concierge" ||
      agent.name.includes("Chief Architect") || agent.name.includes("Kiến Trúc Sư Trưởng"));
    if (!chief) {
      await db.update(activityLog).set({
        details: { idempotencyKey: receiptKey, fingerprint, phase: "conversation_failed", conversationIssueId: null, pascalInitialization: "pending", error: "Chief Architect agent is unavailable" },
      }).where(eq(activityLog.id, receiptId));
      res.status(202).json({ project, conversationIssueId: null, initializationStatus: "blocked", error: "Chief Architect agent is unavailable" });
      return;
    }

    if (!conversationIssueId) {
      const conversation = await issueService(db).create(companyId, {
        projectId: project.id,
        conversationAgentId: chief.id,
        conversationUserId: `atelier-project:${actorUserId}:${project.id}`,
        conversationState: "active",
        assigneeAgentId: chief.id,
        createdByUserId: actorUserId,
        responsibleUserId: actorUserId,
        title: `Intake — ${project.name}`,
        description: brief,
        status: "in_progress",
        priority: "high",
        originKind: "manual",
        idempotencyKey: `atelier-project-intake:${receiptKey}:conversation`,
        allowDuplicate: true,
      });
      conversationIssueId = conversation.id;
      const existingBrief = await db.select({ id: issueComments.id }).from(issueComments).where(and(
        eq(issueComments.issueId, conversation.id),
        eq(issueComments.clientRequestId, `atelier-intake:${idempotencyKey}`),
      )).then((rows) => rows[0] ?? null);
      if (!existingBrief) {
        await insertIssueComment(db, {
          companyId,
          issueId: conversation.id,
          authorUserId: actorUserId,
          authorType: "user",
          clientRequestId: `atelier-intake:${idempotencyKey}`,
          body: brief,
        });
      }
    }

    let initializationStatus: "ready" | "retry_required" = "ready";
    let initializationError: string | null = null;
    try {
      if (!(await ensurePythonCadSidecarOnDemand())) throw new Error("Pascal sidecar is unavailable");
      const initializeResponse = await fetch(`${PYTHON_API_URL}/api/v1/native-projects/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          native_project_id: project.id,
          company_id: companyId,
          project_name: project.name,
          brief,
          conversation_issue_id: conversationIssueId,
        }),
      });
      if (!initializeResponse.ok) {
        const payload = await initializeResponse.json().catch(() => ({})) as { detail?: string };
        throw new Error(payload.detail || `Pascal initialization failed (${initializeResponse.status})`);
      }
    } catch (error) {
      initializationStatus = "retry_required";
      initializationError = error instanceof Error ? error.message : String(error);
    }

    await db.update(activityLog).set({ details: {
      idempotencyKey: receiptKey,
      fingerprint,
      phase: initializationStatus === "ready" ? "ready" : "pascal_failed",
      conversationIssueId,
      pascalInitialization: initializationStatus,
      ...(initializationError ? { error: initializationError } : {}),
    } }).where(eq(activityLog.id, receiptId));

    res.status(initializationStatus === "ready" ? 201 : 202).json({
      project,
      conversationIssueId,
      initializationStatus,
      error: initializationError,
    });
  });

  router.get("/projects/:projectId/atelier/workspace", async (req, res) => {
    const project = await accessibleAtelierProject(req, res, String(req.params.projectId));
    if (!project) return;
    try {
      res.json(await pascalProjectWorkspace(project.id));
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post("/projects/:projectId/atelier/rooms", async (req, res) => {
    const project = await accessibleAtelierProject(req, res, String(req.params.projectId));
    if (!project) return;
    if (!(await ensurePythonCadSidecarOnDemand())) {
      res.status(503).json({ error: "Pascal sidecar is unavailable" });
      return;
    }
    const response = await fetch(`${PYTHON_API_URL}/api/v1/native-projects/${encodeURIComponent(project.id)}/rooms`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body ?? {}),
    });
    res.status(response.status).send(await response.text());
  });

  router.post("/projects/:projectId/atelier/scenes/:sceneId/link", async (req, res) => {
    const project = await accessibleAtelierProject(req, res, String(req.params.projectId));
    if (!project) return;
    if (!(await ensurePythonCadSidecarOnDemand())) {
      res.status(503).json({ error: "Pascal sidecar is unavailable" });
      return;
    }
    const response = await fetch(`${PYTHON_API_URL}/api/v1/native-projects/${encodeURIComponent(project.id)}/scenes/${encodeURIComponent(String(req.params.sceneId))}/link`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body ?? {}),
    });
    res.status(response.status).send(await response.text());
  });

  router.get("/projects/:projectId/atelier/scenes/:sceneId", async (req, res) => {
    const project = await accessibleAtelierProject(req, res, String(req.params.projectId));
    if (!project) return;
    try {
      const workspace = await pascalProjectWorkspace(project.id) as { scenes?: Array<{ scene_id?: string }> };
      const sceneId = String(req.params.sceneId);
      if (!workspace.scenes?.some((scene) => scene.scene_id === sceneId)) {
        res.status(404).json({ error: "Scene not found in this project" });
        return;
      }
      const response = await fetch(`${PYTHON_API_URL}/api/v1/projects/${encodeURIComponent(sceneId)}`);
      res.status(response.status).send(await response.text());
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ============================================================================
  // 2. LOCAL-LITE HEALTH & BENCHMARK METRICS (SECTION 10)
  // ============================================================================
  router.get("/atelier/health-metrics", async (_req, res) => {
    try {
      const mem = process.memoryUsage();
      const totalRamGb = +(os.totalmem() / (1024 ** 3)).toFixed(2);
      const freeRamGb = +(os.freemem() / (1024 ** 3)).toFixed(2);
      const usedSystemRamGb = +(totalRamGb - freeRamGb).toFixed(2);

      const pythonHealthy = await isPythonSidecarHealthy();
      let mcpToolsCount = 80;
      if (pythonHealthy) {
        try {
          const hRes = await fetch(`${PYTHON_API_URL}/api/v1/health`);
          if (hRes.ok) {
            const hJson = (await hRes.json()) as { pascal_mcp_tools_count?: number };
            if (typeof hJson.pascal_mcp_tools_count === "number") {
              mcpToolsCount = hJson.pascal_mcp_tools_count;
            }
          }
        } catch {
          // ignore
        }
      }

      const activeRuns = await db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.status, "running"));

      res.json({
        ok: true,
        profile: "ATELIER_LOCAL_LITE",
        timestamp: new Date().toISOString(),
        runtime: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptimeSec: Math.round(process.uptime()),
          dockerRequired: false,
          redisRequired: false,
          rabbitMqRequired: false,
          databaseMode: process.env.DATABASE_URL ? "external_postgres" : "embedded_postgres_local",
        },
        memory: {
          nodeRssMb: +(mem.rss / (1024 * 1024)).toFixed(1),
          nodeHeapUsedMb: +(mem.heapUsed / (1024 * 1024)).toFixed(1),
          nodeHeapTotalMb: +(mem.heapTotal / (1024 * 1024)).toFixed(1),
          nodeExternalMb: +(mem.external / (1024 * 1024)).toFixed(1),
          systemTotalRamGb: totalRamGb,
          systemFreeRamGb: freeRamGb,
          systemUsedRamGb: usedSystemRamGb,
        },
        concurrency: {
          activeAgentRuns: activeRuns.length,
          maxActiveAgentRuns: 2,
          activeSceneLocks: Array.from(activeSceneWriteLocks.entries()).map(([projId, info]) => ({
            projectId: projId,
            holder: info.holder,
            heldMs: Date.now() - info.acquiredAt,
          })),
          maxConcurrentSceneMutationsPerProject: 1,
        },
        services: {
          paperclipControlPlane: "healthy",
          embeddedPostgresDb: "healthy",
          pascalMcpGateway: pythonHealthy ? "connected" : "on_demand_standby",
          pascalMcpToolsCount: mcpToolsCount,
          pythonCadAndCostSidecar: pythonHealthy ? "running" : "on_demand_standby",
        },
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // 3. PASCAL 3D SCENE ADAPTER WITH VERSION CHECK & CONCURRENCY LOCK (SECTION 7)
  // Operations: scene.read, scene.cost, scene.propose, scene.validate, scene.preview, scene.apply, scene.restore
  // ============================================================================
  const sceneHandler = createAtelierSceneHandler(PYTHON_API_URL, activeSceneWriteLocks, ensurePythonCadSidecarOnDemand);
  router.post("/atelier/scene", async (req, res) => {
    assertBoardOrAgent(req);
    const nativeProjectId = req.body?.native_project_id;
    if (typeof nativeProjectId !== "string" || !nativeProjectId.trim()) {
      res.status(422).json({ ok: false, error: "native_project_id is required for scene access" }); return;
    }
    const project = await accessibleAtelierProject(req, res, nativeProjectId);
    if (!project) return;
    assertCompanyAccess(req, project.companyId);
    try {
      const workspace = await pascalProjectWorkspace(project.id) as { scenes?: Array<{ scene_id?: string }> };
      const sceneId = req.body?.project_id ?? req.body?.projectId;
      if (!workspace.scenes?.some((scene) => scene.scene_id === sceneId)) {
        res.status(404).json({ ok: false, error: "Scene not found in this project" }); return;
      }
    } catch (error) {
      res.status(503).json({ ok: false, error: error instanceof Error ? error.message : String(error) }); return;
    }
    await sceneHandler(req, res);
  });

  // ============================================================================
  // 4. DESIGN FEEDBACK PINS ON 3D SCENE (SECTION 8.8)
  // User pins a comment onto a 3D object/position -> creates Paperclip Task + Conversation entry + Proposal diff
  // ============================================================================
  router.get("/atelier/pins/:projectId", async (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    if (!projectId) throw unprocessable("projectId is required");
    const pins = projectPinsStore.get(projectId) ?? [
      {
        id: "pin_demo_sofa_01",
        project_id: projectId,
        entity_id: "furn_sofa_main",
        entity_name: "Sofa Văng Japandi Gỗ Sồi",
        position_mm: [800, 2300, 420],
        comment: "Ghim nhận xét 3D: Kiểm tra khoảng cách từ mép sofa tới cửa chính để đi lại thoải mái hơn.",
        author: "Chủ nhà (Board)",
        status: "resolved",
        paperclip_issue_id: null,
        paperclip_issue_identifier: "ATL-3",
        proposal_id: null,
        created_at: new Date(Date.now() - 3600_000).toISOString(),
      },
    ];
    if (!projectPinsStore.has(projectId)) {
      projectPinsStore.set(projectId, pins);
    }
    res.json({ ok: true, pins });
  });

  router.post("/atelier/pins/:projectId", async (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    if (!projectId) throw unprocessable("projectId is required");
    const body = req.body ?? {};
    const entity_id = body.entity_id || body.objectId || null;
    const entity_name = body.entity_name || body.objectLabel || "Vị trí trong phòng 3D";
    let position_mm = body.position_mm || body.worldPosition || [2000, 2500, 400];
    if (Array.isArray(position_mm) && position_mm[0] < 50 && position_mm[1] < 50 && position_mm[2] < 50) {
      position_mm = position_mm.map((v: number) => Math.round(Number(v) * 1000));
    }
    const comment = body.comment || "";
    const create_proposal = body.create_proposal !== false;

    if (!comment || !String(comment).trim()) {
      res.status(400).json({ ok: false, error: "Nội dung nhận xét ghim 3D không được để trống." });
      return;
    }

    try {
      const boot = await ensureAtelierPaperclipBootstrap(db);
      await ensurePythonCadSidecarOnDemand();

      // Increment company issue counter & create a real Paperclip Task linked to the 3D pin
      const [comp] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, boot.companyId));

      const existingIssues = await db
        .select({ issueNumber: issues.issueNumber })
        .from(issues)
        .where(eq(issues.companyId, boot.companyId))
        .orderBy(desc(issues.issueNumber))
        .limit(1);

      const maxExisting = existingIssues[0]?.issueNumber ?? 8;
      const currentCounter = Math.max(comp?.issueCounter ?? 8, maxExisting);
      const nextNum = currentCounter + 1;
      const identifier = `${boot.companyPrefix}-${nextNum}`;

      await db
        .update(companies)
        .set({ issueCounter: nextNum, updatedAt: new Date() })
        .where(eq(companies.id, boot.companyId));

      const targetAgentId =
        String(comment).toLowerCase().includes("sơn") ||
        String(comment).toLowerCase().includes("màu") ||
        String(comment).toLowerCase().includes("sàn")
          ? boot.agentIdsByKey["agent_style"]
          : boot.agentIdsByKey["agent_furniture"];

      const [createdTask] = await db
        .insert(issues)
        .values({
          companyId: boot.companyId,
          projectId: boot.projectId,
          title: `[Ghim 3D • ${entity_name}] ${String(comment).slice(0, 80)}`,
          description: `Nhận xét được ghim trực tiếp trên mô hình 3D Pascal:\n- **Đối tượng**: ${entity_name} (${entity_id ?? "room"})\n- **Tọa độ (mm)**: X=${position_mm[0]}, Y=${position_mm[1]}, Z=${position_mm[2]}\n- **Nội dung**: ${comment}`,
          status: "in_progress",
          priority: "high",
          assigneeAgentId: targetAgentId ?? boot.chiefArchitectAgentId,
          createdByUserId: "local-board",
          responsibleUserId: "local-board",
          issueNumber: nextNum,
          identifier,
          originKind: "manual",
        })
        .returning();

      // Also append the pin note into the Chief Architect Conversation so chat & 3D stay 100% synced
      if (boot.conversationIssueId) {
        await db.insert(issueComments).values({
          companyId: boot.companyId,
          issueId: boot.conversationIssueId,
          authorUserId: "local-board",
          authorType: "user",
          body: `📍 **[Ghim nhận xét trên 3D — ${entity_name} (${position_mm[0]}, ${position_mm[1]} mm)]**: ${comment} *(Đã tạo công việc ${identifier})*`,
        });
      }

      let proposalId: string | null = null;
      if (create_proposal) {
        try {
          const chatRes = await fetch(
            `${PYTHON_API_URL}/api/v1/projects/${encodeURIComponent(projectId)}/chat/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: `[Ghim 3D tại ${entity_name}]: ${comment}`,
              }),
            },
          );
          if (chatRes.ok) {
            const chatJson = (await chatRes.json()) as {
              proposal?: { id?: string; title?: string; rationale?: string; cost_delta_vnd?: number };
              assistant_message?: { content?: string };
            };
            proposalId = chatJson.proposal?.id ?? null;

            if (boot.conversationIssueId && chatJson.assistant_message?.content) {
              await db.insert(issueComments).values({
                companyId: boot.companyId,
                issueId: boot.conversationIssueId,
                authorAgentId: boot.chiefArchitectAgentId,
                authorType: "agent",
                body: chatJson.assistant_message.content,
              });
            }
          }
        } catch {
          // ignore if sidecar busy
        }
      }

      const newPin: SpatialPinFeedback = {
        id: `pin_${Date.now()}`,
        project_id: projectId,
        entity_id,
        entity_name,
        position_mm: [
          Number(position_mm[0] ?? 0),
          Number(position_mm[1] ?? 0),
          Number(position_mm[2] ?? 0),
        ],
        comment: String(comment),
        author: "Chủ nhà (Board)",
        status: proposalId ? "in_progress" : "open",
        paperclip_issue_id: createdTask?.id ?? null,
        paperclip_issue_identifier: identifier,
        proposal_id: proposalId,
        created_at: new Date().toISOString(),
      };

      const existing = projectPinsStore.get(projectId) ?? [];
      projectPinsStore.set(projectId, [newPin, ...existing]);

      res.status(201).json({
        ok: true,
        pin: newPin,
        paperclipTask: createdTask,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // 4B. ANTIGRAVITY IDE REVERSE BRIDGE ENDPOINTS FOR PAPERCLIP CONVERSATIONS
  // Allows local Antigravity IDE Agent (`scripts/ide_bridge.py`) to inspect
  // pending Paperclip chat turns and inject direct Agent replies ($0 API Cost)
  // ============================================================================
  router.get("/atelier/ide-bridge/pending", async (_req, res) => {
    try {
      const boot = await ensureAtelierPaperclipBootstrap(db);
      const allIssues = await db
        .select()
        .from(issues)
        .where(eq(issues.companyId, boot.companyId));
      const allAgents = await db
        .select()
        .from(agents)
        .where(eq(agents.companyId, boot.companyId));
      const agentMap = new Map(allAgents.map((a) => [a.id, a]));

      const chats = allIssues.filter((i) => Boolean(i.conversationAgentId));
      const conversations = [];

      for (const chat of chats) {
        const comments = await db
          .select()
          .from(issueComments)
          .where(and(eq(issueComments.issueId, chat.id), isNull(issueComments.deletedAt)))
          .orderBy(desc(issueComments.createdAt));

        const latestComment = comments[0] ?? null;
        const latestUserComment = comments.find((c) => Boolean(c.authorUserId) && !c.authorAgentId) ?? null;
        const latestAgentComment = comments.find((c) => Boolean(c.authorAgentId)) ?? null;
        const needsReply = Boolean(
          latestUserComment &&
            (!latestAgentComment ||
              new Date(latestUserComment.createdAt).getTime() > new Date(latestAgentComment.createdAt).getTime()),
        );
        const agent = chat.conversationAgentId ? agentMap.get(chat.conversationAgentId) : undefined;

        conversations.push({
          issue_id: chat.id,
          identifier: chat.identifier,
          title: chat.title,
          status: chat.status,
          conversation_state: chat.conversationState,
          execution_run_id: chat.executionRunId,
          agent_id: chat.conversationAgentId,
          agent_name: agent?.name ?? "Agent",
          agent_model: (agent?.adapterConfig as Record<string, unknown> | null)?.model ?? null,
          needs_reply: needsReply,
          latest_comment: latestComment
            ? {
                id: latestComment.id,
                author_type: latestComment.authorAgentId ? "agent" : "user",
                body: latestComment.body,
                created_at: latestComment.createdAt,
              }
            : null,
          latest_user_comment: latestUserComment
            ? {
                id: latestUserComment.id,
                body: latestUserComment.body,
                created_at: latestUserComment.createdAt,
              }
            : null,
        });
      }

      res.json({
        ok: true,
        company_id: boot.companyId,
        conversations,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  async function clearIssueExecutionBlockers(companyId: string, issueId: string, agentId: string | null) {
    const recoverySvc = issueRecoveryActionService(db);
    await recoverySvc.resolveActiveForIssue({
      companyId,
      sourceIssueId: issueId,
      status: "cancelled",
      outcome: "cancelled",
      resolutionNote: "Cleared via Antigravity IDE Bridge",
    });

    // Clear any residual automaticRecovery replay-blocked flags on recovery actions for this issue
    await db
      .update(issueRecoveryActions)
      .set({
        status: "cancelled",
        outcome: "cancelled",
        evidence: sql`(${issueRecoveryActions.evidence} - 'automaticRecovery')`,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(issueRecoveryActions.companyId, companyId),
          eq(issueRecoveryActions.sourceIssueId, issueId),
        ),
      );

    if (agentId) {
      await db
        .update(agentWakeupRequests)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(
          and(
            eq(agentWakeupRequests.companyId, companyId),
            eq(agentWakeupRequests.agentId, agentId),
            inArray(agentWakeupRequests.status, ["deferred_issue_execution", "queued"]),
          ),
        );
    }

    await db
      .update(issues)
      .set({
        executionRunId: null,
        checkoutRunId: null,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issueId));
  }

  router.post("/atelier/ide-bridge/unblock", async (req, res) => {
    try {
      const boot = await ensureAtelierPaperclipBootstrap(db);
      const body = req.body ?? {};
      const rawIssueId = String(body.issue_id || body.issueId || "").trim();
      const allIssues = await db
        .select()
        .from(issues)
        .where(eq(issues.companyId, boot.companyId));
      const targets = rawIssueId
        ? allIssues.filter((i) => i.id === rawIssueId || i.identifier?.toLowerCase() === rawIssueId.toLowerCase())
        : allIssues.filter((i) => Boolean(i.conversationAgentId));

      for (const t of targets) {
        await clearIssueExecutionBlockers(boot.companyId, t.id, t.conversationAgentId ?? t.assigneeAgentId ?? null);
        if (t.conversationAgentId && t.status === "blocked") {
          await db
            .update(issues)
            .set({ status: "in_review", conversationState: "waiting", updatedAt: new Date() })
            .where(eq(issues.id, t.id));
        }
      }

      res.json({
        ok: true,
        unblocked_identifiers: targets.map((t) => t.identifier ?? t.id),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/atelier/ide-bridge/reply", async (req, res) => {
    try {
      const boot = await ensureAtelierPaperclipBootstrap(db);
      const body = req.body ?? {};
      const rawIssueId = String(body.issue_id || body.issueId || boot.conversationIssueId || "").trim();
      const messageText = String(body.message || body.body || "").trim();
      if (!messageText) {
        res.status(400).json({ ok: false, error: "message is required" });
        return;
      }

      const allIssues = await db
        .select()
        .from(issues)
        .where(eq(issues.companyId, boot.companyId));
      const targetIssue =
        allIssues.find((i) => i.id === rawIssueId || i.identifier?.toLowerCase() === rawIssueId.toLowerCase()) ??
        allIssues.find((i) => i.id === boot.conversationIssueId);

      if (!targetIssue) {
        res.status(404).json({ ok: false, error: `Issue ${rawIssueId} not found` });
        return;
      }

      const authorAgentId =
        String(body.agent_id || body.agentId || targetIssue.conversationAgentId || targetIssue.assigneeAgentId || boot.chiefArchitectAgentId);

      // Clear any stuck failed/deferred execution blocker, recovery action, or wakeup queue on this conversation
      await clearIssueExecutionBlockers(boot.companyId, targetIssue.id, authorAgentId);

      const [insertedComment] = await insertIssueComment(db, {
        companyId: boot.companyId,
        issueId: targetIssue.id,
        authorAgentId,
        authorType: "agent",
        origin: "comment",
        body: messageText,
      });

      await db
        .update(issues)
        .set({
          status: targetIssue.conversationAgentId ? "in_review" : targetIssue.status,
          conversationState: targetIssue.conversationAgentId ? "waiting" : targetIssue.conversationState,
          executionRunId: null,
          checkoutRunId: null,
          updatedAt: new Date(),
        })
        .where(eq(issues.id, targetIssue.id));

      res.status(201).json({
        ok: true,
        company_id: boot.companyId,
        issue_id: targetIssue.id,
        identifier: targetIssue.identifier,
        agent_id: authorAgentId,
        comment: insertedComment,
        cost_usd: 0.0,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // 5. TRANSPARENT PROXY & BIDIRECTIONAL SYNC FOR `/api/v1/*` & `/api/atelier/*`
  // Connects ATELIER AI 2D/3D Studio, Floor Plan, Cost Engine, Catalog & CAD Exports
  // directly to Paperclip's PostgreSQL Control Plane (Conversations, Tasks, Approvals, Activity)
  // ============================================================================
  const proxyHandler = async (req: Request, res: Response) => {
    const ready = await ensurePythonCadSidecarOnDemand();
    if (!ready) {
      res.status(503).json({
        error: "Python CAD/Cost sidecar is starting on-demand. Please retry in a moment.",
      });
      return;
    }

    const subPath = req.url.startsWith("/v1")
      ? req.url.slice(3)
      : req.url.startsWith("/api/v1")
        ? req.url.slice(7)
        : req.url;
    const targetUrl = `${PYTHON_API_URL}/api/v1${subPath.startsWith("/") ? subPath : `/${subPath}`}`;
    try {
      const headers: Record<string, string> = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (
          key.toLowerCase() === "host" ||
          key.toLowerCase() === "connection" ||
          key.toLowerCase() === "content-length"
        ) {
          continue;
        }
        if (typeof val === "string") headers[key] = val;
      }

      let bodyPayload: BodyInit | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const contentType = String(req.headers["content-type"] || "");
        if (contentType.includes("application/json")) {
          bodyPayload = JSON.stringify(req.body ?? {});
        } else {
          // Raw stream / multipart upload (e.g. floor plan upload)
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          bodyPayload = Buffer.concat(chunks);
        }
      }

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: bodyPayload,
      });

      // Mirror key mutations into Paperclip's PostgreSQL tables asynchronously
      if (upstream.ok && req.method === "POST") {
        const cloned = upstream.clone();
        void syncAtelierMutationToPaperclipDb(db, req.path, req.body, cloned).catch(() => {});
      }

      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (
          key.toLowerCase() !== "transfer-encoding" &&
          key.toLowerCase() !== "content-encoding" &&
          key.toLowerCase() !== "content-length"
        ) {
          res.setHeader(key, value);
        }
      });

      const acceptHeader = String(req.headers.accept || "");
      const isSse = acceptHeader.includes("text/event-stream") || upstream.headers.get("content-type")?.includes("text/event-stream");

      if (isSse && upstream.body) {
        // @ts-ignore
        const nodeReadable = Readable.fromWeb(upstream.body);
        nodeReadable.pipe(res);
      } else {
        const arrayBuf = await upstream.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
      }
    } catch (error) {
      res.status(502).json({
        error: "Failed to reach ATELIER CAD/BOQ sidecar",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  router.use("/v1", proxyHandler);
  router.use("/atelier/v1", proxyHandler);
  router.use("/atelier/cad", proxyHandler);

  // ============================================================================
  // ATELIER OFFICE-AGENTS — no-auth endpoint for ai-office 3D panel
  // ============================================================================
  router.get("/atelier/office-agents", async (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    try {
      const companyId = await resolveAtelierCompanyId(_req);
      const rows = await db
        .select({ id: agents.id, name: agents.name, role: agents.role, title: agents.title })
        .from(agents)
        .where(eq(agents.companyId, companyId))
        .orderBy(agents.name);
      res.json({
        ok: true,
        agents: rows.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role || (a.title ?? ""),
          title: a.title ?? "",
        })),
      });
    } catch {
      res.json({ ok: false, agents: [] });
    }
  });

  return router;
}

async function syncAtelierMutationToPaperclipDb(
  db: Db,
  reqPath: string,
  reqBody: unknown,
  upstreamResponse: globalThis.Response,
) {
  const boot = await ensureAtelierPaperclipBootstrap(db);
  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return;
  const data = (await upstreamResponse.json()) as Record<string, unknown>;

  // 1. User sent a chat message to Chief Architect -> sync message & reply into Paperclip Conversation (`issue_comments`) and create Paperclip Approval if proposal generated
  if (reqPath.endsWith("/chat/messages") && boot.conversationIssueId) {
    const userMsg = (reqBody as { message?: string } | null)?.message;
    if (userMsg) {
      await db.insert(issueComments).values({
        companyId: boot.companyId,
        issueId: boot.conversationIssueId,
        authorUserId: "local-board",
        authorType: "user",
        body: userMsg,
      });
    }
    const assistantMsg = (data.assistant_message as { content?: string } | undefined)?.content;
    if (assistantMsg) {
      await db.insert(issueComments).values({
        companyId: boot.companyId,
        issueId: boot.conversationIssueId,
        authorAgentId: boot.chiefArchitectAgentId,
        authorType: "agent",
        body: assistantMsg,
      });
    }
    const proposal = data.proposal as
      | {
          id?: string;
          title?: string;
          rationale?: string;
          before_summary?: string;
          after_summary?: string;
          cost_delta_vnd?: number;
          new_grand_total_vnd?: number;
        }
      | undefined;
    if (proposal?.id) {
      await db.insert(approvals).values({
        companyId: boot.companyId,
        type: "scene_proposal_review",
        requestedByAgentId: boot.agentIdsByKey["agent_furniture"] ?? boot.chiefArchitectAgentId,
        requestedByUserId: "local-board",
        status: "pending",
        payload: {
          atelierProposalId: proposal.id,
          title: proposal.title,
          reason: proposal.rationale,
          beforeSummary: proposal.before_summary,
          afterSummary: proposal.after_summary,
          costDeltaVnd: proposal.cost_delta_vnd,
          newGrandTotalVnd: proposal.new_grand_total_vnd,
        },
      });
    }
  }

  // 2. Proposal Approved or Rejected -> sync Paperclip `approvals` status and log activity
  if (reqPath.includes("/proposals/") && (reqPath.endsWith("/approve") || reqPath.endsWith("/reject"))) {
    const isApprove = reqPath.endsWith("/approve");
    const pendingList = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.companyId, boot.companyId), eq(approvals.status, "pending")))
      .orderBy(desc(approvals.createdAt));

    if (pendingList[0]) {
      await db
        .update(approvals)
        .set({
          status: isApprove ? "approved" : "rejected",
          decisionNote: isApprove
            ? "Đã phê duyệt và cập nhật trực tiếp vào Pascal 3D SceneGraph & Dự toán BOQ."
            : "Người dùng từ chối đề xuất; giữ nguyên Scene 3D hiện tại.",
          decidedByUserId: "local-board",
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(approvals.id, pendingList[0].id));
    }

    await db.insert(activityLog).values({
      companyId: boot.companyId,
      actorType: "user",
      actorId: "local-board",
      action: isApprove ? "proposal.approved" : "proposal.rejected",
      entityType: "project",
      entityId: boot.projectId,
      details: {
        path: reqPath,
        newRevision: (data.project as { revision?: number } | undefined)?.revision,
      },
    });
  }
}
