import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import type { IssueDisplayStatus } from "@paperclipai/shared";
import {
  type Db,
  agents,
  approvals,
  companies,
  companyMemberships,
  goals,
  issueApprovals,
  issueComments,
  issues,
  projects,
} from "@paperclipai/db";
import { addTelegramLog, getTelegramConfigSync, saveTelegramConfig } from "./config.js";
import {
  chooseTelegramProject,
  describeTelegramProjectContext,
  readTelegramProjectContext,
  TelegramProjectContextError,
} from "./project-context.js";
import { issueDisplayStatusSql } from "../issue-display-status.js";
import { issueService } from "../issues.js";
import { logActivity } from "../activity-log.js";
import {
  queueIssueAssignmentWakeup,
  type IssueAssignmentWakeupDeps,
} from "../issue-assignment-wakeup.js";
import {
  ATELIER_TELEGRAM_FINAL_APPROVAL_INSTRUCTIONS,
  buildAtelierTelegramApprovalDecisionPatch,
  createAtelierTelegramApprovalPolicy,
  createAtelierTelegramOriginId,
} from "./approval-gate.js";

export interface AtelierAgentInfo {
  id: string;
  name: string;
  role: string;
  description: string | null;
  status: string;
  key: string;
}

export interface AtelierTaskSummary {
  id: string;
  identifier: string;
  title: string;
  status: string;
  displayStatus: IssueDisplayStatus;
  priority: string;
  assignedAgentName: string;
  assignedAgentId: string | null;
  createdAt: string;
  commentCount: number;
}

export class AtelierTelegramTaskManager {
  private db: Db;
  private heartbeat?: IssueAssignmentWakeupDeps;

  constructor(db: Db, heartbeat?: IssueAssignmentWakeupDeps) {
    this.db = db;
    this.heartbeat = heartbeat;
  }

  /**
   * Paperclip heartbeat runs must be sponsored by a real user that has an
   * active membership in the target company. A Telegram user/chat id is an
   * external identity, so persisting `telegram:<id>` as responsibleUserId
   * makes the adapter fail during setup. Prefer an explicit pairing, then the
   * local trusted board user, then any active board member.
   */
  private async resolveTelegramActorUserId(
    companyId: string,
    telegramUserId: number,
  ): Promise<string | null> {
    const pairing = getTelegramConfigSync().userPairings.find(
      (entry) => entry.telegramUserId === telegramUserId,
    );
    const preferredIds = [pairing?.paperclipUserId, "local-board"].filter(
      (value): value is string => Boolean(value?.trim()),
    );

    for (const principalId of [...new Set(preferredIds)]) {
      const [membership] = await this.db
        .select({ principalId: companyMemberships.principalId })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.companyId, companyId),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, principalId),
            eq(companyMemberships.status, "active"),
          ),
        )
        .limit(1);
      if (membership) return membership.principalId;
    }

    const [fallback] = await this.db
      .select({ principalId: companyMemberships.principalId })
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.status, "active"),
        ),
      )
      .limit(1);
    return fallback?.principalId ?? null;
  }

  /** Compatibility for company-only readers. Task creation must use resolveProjectContext. */
  public async getCompanyAndProject(): Promise<{ companyId: string; projectId: string; companyPrefix: string }> {
    const [comp] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.issuePrefix, "ATL"))
      .limit(1);

    if (!comp) {
      // Legacy single-company installs remain supported; ambiguity must not select a tenant.
      const companyRows = await this.db.select().from(companies).limit(2);
      if (companyRows.length > 1) throw new TelegramProjectContextError("Telegram company is ambiguous: configure the ATL company before selecting a project.");
      const [firstComp] = companyRows;
      if (!firstComp) throw new Error("No company found in database");
      return {
        companyId: firstComp.id,
        projectId: "",
        companyPrefix: firstComp.issuePrefix || "ATL",
      };
    }

    return {
      companyId: comp.id,
      projectId: "",
      companyPrefix: comp.issuePrefix || "ATL",
    };
  }

  public async listProjects() {
    const { companyId } = await this.getCompanyAndProject();
    return this.db.select({ id: projects.id, name: projects.name, companyId: projects.companyId })
      .from(projects).where(eq(projects.companyId, companyId));
  }

  public async resolveProjectContext(telegramChatId: number, nativeProjectId?: string) {
    if (!Number.isSafeInteger(telegramChatId)) {
      throw new TelegramProjectContextError("A valid Telegram chat ID is required to select project context.");
    }
    const { companyId, companyPrefix } = await this.getCompanyAndProject();
    const selection = nativeProjectId !== undefined
      ? { telegramChatId, companyId, nativeProjectId }
      : getTelegramConfigSync().chatProjectSelections.find((entry) => entry.telegramChatId === telegramChatId);
    const project = chooseTelegramProject(companyId, await this.listProjects(), selection);
    const context = await readTelegramProjectContext(project);
    return { ...context, companyPrefix };
  }

  public async selectProjectForChat(telegramChatId: number, nativeProjectId: string) {
    const context = await this.resolveProjectContext(telegramChatId, nativeProjectId);
    const config = getTelegramConfigSync();
    try {
      await saveTelegramConfig({
        chatProjectSelections: [
          ...config.chatProjectSelections.filter((entry) => entry.telegramChatId !== telegramChatId),
          { telegramChatId, companyId: context.companyId, nativeProjectId: context.nativeProjectId },
        ],
      }, true);
    } catch {
      throw new TelegramProjectContextError("Could not persist Telegram project selection. Check configuration storage and retry /project.");
    }
    addTelegramLog("info", "Selected Telegram chat project", {
      telegramChatId, companyId: context.companyId, nativeProjectId: context.nativeProjectId, sceneId: context.sceneId,
    });
    return context;
  }

  public async listAgents(): Promise<AtelierAgentInfo[]> {
    const { companyId } = await this.getCompanyAndProject();
    const rows = await this.db
      .select()
      .from(agents)
      .where(eq(agents.companyId, companyId));

    return rows.map((a) => {
      let key = (a.metadata as Record<string, unknown> | null)?.atelierAgentKey as string | undefined;
      if (!key) {
        const nameLower = a.name.toLowerCase();
        if (nameLower.includes("chief") || nameLower.includes("kts") || nameLower.includes("kiến trúc")) key = "agent_chief_architect";
        else if (nameLower.includes("floor") || nameLower.includes("mặt bằng")) key = "agent_floorplan";
        else if (nameLower.includes("geometry") || nameLower.includes("hình học") || nameLower.includes("bim")) key = "agent_geometry";
        else if (nameLower.includes("furniture") || nameLower.includes("nội thất")) key = "agent_furniture";
        else if (nameLower.includes("ceiling") || nameLower.includes("trần") || nameLower.includes("chiếu sáng") || nameLower.includes("visualization") || nameLower.includes("rendering")) key = "agent_render";
        else if (nameLower.includes("material") || nameLower.includes("vật liệu")) key = "agent_material";
        else if (nameLower.includes("research") || nameLower.includes("nghiên cứu") || nameLower.includes("khảo sát")) key = "agent_research";
        else if (nameLower.includes("inventory") || nameLower.includes("bom") || nameLower.includes("danh mục")) key = "agent_inventory";
        else if (nameLower.includes("render") || nameLower.includes("phối cảnh")) key = "agent_render";
        else if (nameLower.includes("cost") || nameLower.includes("dự toán") || nameLower.includes("boq")) key = "agent_cost";
        else if (nameLower.includes("shopping") || nameLower.includes("mua sắm") || nameLower.includes("vật tư")) key = "agent_shopping";
        else if (nameLower.includes("qa") || nameLower.includes("kiểm định") || nameLower.includes("quy chuẩn")) key = "agent_qa";
        else if (nameLower.includes("style") || nameLower.includes("phong cách")) key = "agent_style";
        else key = "agent_general";
      }

      return {
        id: a.id,
        name: a.name,
        role: a.role || "Chuyên gia Thiết kế",
        description: a.title,
        status: a.status,
        key,
      };
    });
  }

  public async findAgentByQuery(query: string): Promise<AtelierAgentInfo | null> {
    const agentsList = await this.listAgents();
    const q = query.toLowerCase();

    // Direct matches
    for (const a of agentsList) {
      if (q.includes(a.name.toLowerCase()) || q.includes(a.key.replace("agent_", ""))) {
        return a;
      }
    }

    // Action intent takes precedence over incidental nouns. A furniture-layout
    // request often mentions that lighting/ceiling must stay unchanged; those
    // negative constraints must not route the task to Lighting.
    const furnitureLayoutIntent = /(bố trí|sắp xếp|di chuyển|đặt lại|đặt sát|tối ưu diện tích|layout|rearrange)/iu.test(q)
      && /(nội thất|giường|tab đầu giường|tủ|kệ|bàn|ghế|thảm|két sắt|furniture)/iu.test(q);
    if (furnitureLayoutIntent) {
      return agentsList.find((a) => a.key === "agent_furniture") || null;
    }
    const lightingExplicitlyOutOfScope = /(?:trần|đèn|chiếu sáng|ánh sáng|ceiling|lighting).{0,80}(?:ngoài phạm vi|giữ nguyên|không thay đổi|không đổi)|(?:ngoài phạm vi|giữ nguyên|không thay đổi|không đổi).{0,80}(?:trần|đèn|chiếu sáng|ánh sáng|ceiling|lighting)/iu.test(q);

    // Keyword heuristics
    if (!lightingExplicitlyOutOfScope && (q.includes("trần") || q.includes("đèn") || q.includes("chiếu sáng") || q.includes("downlight") || q.includes("ceiling") || q.includes("lighting"))) {
      return agentsList.find((a) => a.key === "agent_render") || null;
    }
    if (q.includes("vật liệu") || q.includes("gạch") || q.includes("an cường") || q.includes("eurotile") || q.includes("đồng tâm") || q.includes("material")) {
      return agentsList.find((a) => a.key === "agent_material") || agentsList.find((a) => a.key === "agent_style") || null;
    }
    if (q.includes("khảo sát") || q.includes("tìm sản phẩm") || q.includes("sản phẩm thực tế") || q.includes("research") || q.includes("tra cứu giá")) {
      return agentsList.find((a) => a.key === "agent_research") || agentsList.find((a) => a.key === "agent_shopping") || null;
    }
    if (q.includes("bom") || q.includes("inventory") || q.includes("danh mục vật tư") || q.includes("bóc tách khối lượng")) {
      return agentsList.find((a) => a.key === "agent_inventory") || agentsList.find((a) => a.key === "agent_cost") || null;
    }
    if (q.includes("qa") || q.includes("kiểm định") || q.includes("quy chuẩn") || q.includes("thông thủy") || q.includes("va chạm") || q.includes("xung đột")) {
      return agentsList.find((a) => a.key === "agent_qa") || null;
    }
    if (q.includes("geometry") || q.includes("dựng phòng") || q.includes("căn phòng") || q.includes("tường") || q.includes("cửa sổ") || q.includes("bim")) {
      return agentsList.find((a) => a.key === "agent_geometry") || null;
    }
    if (q.includes("bản vẽ") || q.includes("mặt bằng") || q.includes("dxf") || q.includes("floorplan")) {
      return agentsList.find((a) => a.key === "agent_floorplan") || null;
    }
    if (q.includes("sofa") || q.includes("bàn") || q.includes("ghế") || q.includes("tủ") || q.includes("giường") || q.includes("nội thất") || q.includes("furniture")) {
      return agentsList.find((a) => a.key === "agent_furniture") || null;
    }
    if (q.includes("phong cách") || q.includes("sơn") || q.includes("gỗ") || q.includes("style") || q.includes("japandi")) {
      return agentsList.find((a) => a.key === "agent_style") || null;
    }
    if (q.includes("render") || q.includes("phối cảnh") || q.includes("ánh sáng") || q.includes("hình ảnh")) {
      return agentsList.find((a) => a.key === "agent_render") || null;
    }
    if (q.includes("dự toán") || q.includes("giá") || q.includes("chi phí") || q.includes("báo giá") || q.includes("boq") || q.includes("cost")) {
      return agentsList.find((a) => a.key === "agent_cost") || null;
    }
    if (q.includes("mua sắm") || q.includes("tìm nguồn") || q.includes("shopee") || q.includes("nhà cung cấp") || q.includes("shopping")) {
      return agentsList.find((a) => a.key === "agent_shopping") || null;
    }
    if (q.includes("chief") || q.includes("kiến trúc sư") || q.includes("kts") || q.includes("tổng thể") || q.includes("tư vấn")) {
      return agentsList.find((a) => a.key === "agent_chief_architect") || agentsList.find((a) => a.key === "agent_concierge") || null;
    }

    return null;
  }

  public async getChiefArchitect(): Promise<AtelierAgentInfo | null> {
    const list = await this.listAgents();
    return list.find((a) => a.key === "agent_chief_architect") || list[0] || null;
  }

  public async listActiveTasks(limit = 10, telegramChatId?: number): Promise<AtelierTaskSummary[]> {
    const { companyId } = await this.getCompanyAndProject();
    const nativeProjectId = telegramChatId === undefined
      ? null
      : (await this.resolveProjectContext(telegramChatId)).nativeProjectId;
    const rows = await this.db
      .select({
        id: issues.id,
        identifier: issues.identifier,
        title: issues.title,
        status: issues.status,
        displayStatus: issueDisplayStatusSql(),
        priority: issues.priority,
        createdAt: issues.createdAt,
        assigneeAgentId: issues.assigneeAgentId,
      })
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        ...(nativeProjectId ? [eq(issues.projectId, nativeProjectId)] : []),
        inArray(issues.status, ["backlog", "todo", "in_progress", "in_review", "blocked"]),
      ))
      .orderBy(desc(issues.issueNumber))
      .limit(limit);

    const agentMap = new Map((await this.listAgents()).map((a) => [a.id, a.name]));

    return rows.map((r) => ({
      id: r.id,
      identifier: r.identifier || `ATL-${r.id.slice(0, 4)}`,
      title: r.title,
      status: r.status,
      displayStatus: r.displayStatus,
      priority: r.priority,
      assignedAgentName: (r.assigneeAgentId ? agentMap.get(r.assigneeAgentId) : null) || "Chưa phân công",
      assignedAgentId: r.assigneeAgentId,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      commentCount: 0,
    }));
  }

  public async getTaskByIdentifierOrId(identifierOrId: string): Promise<{
    issue: typeof issues.$inferSelect & { displayStatus: IssueDisplayStatus };
    comments: (typeof issueComments.$inferSelect)[];
    assignedAgentName: string;
  } | null> {
    const clean = identifierOrId.trim().toUpperCase();
    // Select exactly one identity form. Never reinterpret a missing UUID or
    // full identifier as an issue number based on its trailing digits.
    let identity;
    if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(clean)) {
      identity = eq(issues.id, clean.toLowerCase());
    } else if (/^[1-9]\d*$/.test(clean)) {
      const issueNumber = Number(clean);
      if (!Number.isSafeInteger(issueNumber) || issueNumber > 2_147_483_647) return null;
      identity = eq(issues.issueNumber, issueNumber);
    } else if (/^[A-Z][A-Z0-9]*-[1-9]\d*$/.test(clean)) {
      identity = eq(issues.identifier, clean);
    } else {
      return null;
    }

    const { companyId } = await this.getCompanyAndProject();
    const [found] = await this.db
      .select({ ...getTableColumns(issues), displayStatus: issueDisplayStatusSql() })
      .from(issues)
      .where(and(eq(issues.companyId, companyId), identity))
      .limit(1);

    if (!found) return null;

    const commentsList = await this.db
      .select()
      .from(issueComments)
      .where(and(eq(issueComments.companyId, companyId), eq(issueComments.issueId, found.id)))
      .orderBy(desc(issueComments.createdAt))
      .limit(10);

    const agentList = await this.listAgents();
    const assignedAgentName = found.assigneeAgentId
      ? agentList.find((a) => a.id === found.assigneeAgentId)?.name || "Agent"
      : "Chưa phân công";

    return {
      issue: found,
      comments: commentsList,
      assignedAgentName,
    };
  }

  public async createTaskFromTelegram(params: {
    title: string;
    description: string;
    targetAgentId?: string | null;
    telegramUserId: number;
    telegramChatId: number;
    telegramUsername?: string;
  }): Promise<{ issueId: string; identifier: string; assignedAgentName: string; executionStatus: "queued" | "running" | "unconfirmed" }> {
    // Resolve before any DB write or agent wake; stale/offline context fails closed.
    const context = await this.resolveProjectContext(params.telegramChatId);
    const { companyId, nativeProjectId: projectId } = context;
    const actorUserId = await this.resolveTelegramActorUserId(companyId, params.telegramUserId);
    const allAgents = await this.listAgents();

    const chief = allAgents.find((a) => a.key === "agent_chief_architect") || allAgents[0];
    const targetAgentId = params.targetAgentId || chief?.id;
    const targetAgent = allAgents.find((a) => a.id === targetAgentId);
    if (targetAgentId && !targetAgent) throw new Error("Target agent is unavailable in this company");

    const created = await issueService(this.db).create(companyId, {
      projectId,
      title: params.title.slice(0, 120),
      description: `${describeTelegramProjectContext(context)}\n\n## Telegram request\n${params.description}\n\n${ATELIER_TELEGRAM_FINAL_APPROVAL_INSTRUCTIONS}`,
      status: "todo",
      priority: "high",
      assigneeAgentId: targetAgentId,
      createdByUserId: actorUserId,
      responsibleUserId: actorUserId,
      originKind: "chat_channel",
      originId: createAtelierTelegramOriginId(params.telegramChatId),
      executionPolicy: actorUserId
        ? createAtelierTelegramApprovalPolicy(actorUserId)
        : null,
    });
    const identifier = created.identifier!;
    await logActivity(this.db, {
      companyId, actorType: actorUserId ? "user" : "system", actorId: actorUserId ?? "telegram",
      action: "issue.created", entityType: "issue", entityId: created.id,
      details: { title: created.title, identifier, source: "telegram", telegramChatId: params.telegramChatId, projectId, sceneId: context.sceneId },
    });

    // Insert user's Telegram message as the starting issue comment
    const [createdComment] = await this.db
      .insert(issueComments)
      .values({
        companyId,
        issueId: created.id,
        authorUserId: actorUserId,
        authorType: actorUserId ? "user" : "system",
        body: `📩 **Yêu cầu khởi tạo qua Telegram** (Người gửi: @${params.telegramUsername || params.telegramUserId}):\n\n${params.description}`,
      })
      .returning({ id: issueComments.id });

    let executionStatus: "queued" | "running" | "unconfirmed" = "unconfirmed";
    if (this.heartbeat && created.assigneeAgentId) {
      const wakeResult = await queueIssueAssignmentWakeup({
        heartbeat: this.heartbeat,
        issue: created,
        reason: "issue_assigned",
        mutation: "telegram.create",
        contextSource: "telegram.task.create",
        requestedByActorType: actorUserId ? "user" : "system",
        requestedByActorId: actorUserId,
        taskKey: created.identifier,
        wakeCommentId: createdComment?.id ?? null,
      });
      if (wakeResult && typeof wakeResult === "object" && "status" in wakeResult
        && (wakeResult.status === "queued" || wakeResult.status === "running")) {
        executionStatus = wakeResult.status;
      }
    }

    addTelegramLog("info", `Created Task ${identifier} via Telegram`, {
      identifier,
      targetAgent: targetAgent?.name,
      telegramUserId: params.telegramUserId,
    });

    return {
      issueId: created.id,
      identifier,
      assignedAgentName: targetAgent?.name || "Agent",
      executionStatus,
    };
  }

  public async addCommentToTask(params: {
    issueId: string;
    comment: string;
    telegramUserId: number;
    telegramUsername?: string;
  }): Promise<void> {
    // Replies keep the original task identity even after this chat selects another project.
    const taskData = await this.getTaskByIdentifierOrId(params.issueId);
    if (!taskData) throw new Error("Task not found in the Telegram company");
    const companyId = taskData.issue.companyId;
    const actorUserId = await this.resolveTelegramActorUserId(companyId, params.telegramUserId);

    const [createdComment] = await this.db
      .insert(issueComments)
      .values({
        companyId,
        issueId: taskData.issue.id,
        authorUserId: actorUserId,
        authorType: actorUserId ? "user" : "system",
        body: `💬 **Phản hồi qua Telegram** (@${params.telegramUsername || params.telegramUserId}):\n\n${params.comment}`,
      })
      .returning({ id: issueComments.id });

    if (this.heartbeat) {
      if (taskData.issue.assigneeAgentId) {
        await queueIssueAssignmentWakeup({
          heartbeat: this.heartbeat,
          issue: taskData.issue,
          reason: "issue_commented",
          mutation: "telegram.comment",
          contextSource: "telegram.task.comment",
          requestedByActorType: actorUserId ? "user" : "system",
          requestedByActorId: actorUserId,
          taskKey: taskData.issue.identifier,
          wakeCommentId: createdComment?.id ?? null,
        });
      }
    }

    addTelegramLog("info", `Appended Telegram comment to task ${params.issueId}`, {
      telegramUserId: params.telegramUserId,
    });
  }

  public async listPendingApprovals(): Promise<
    Array<{
      id: string;
      type: string;
      requestedByAgentName: string;
      payload: Record<string, unknown>;
      createdAt: string;
    }>
  > {
    const { companyId } = await this.getCompanyAndProject();
    const rows = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
      .orderBy(desc(approvals.createdAt))
      .limit(10);

    const agentList = await this.listAgents();
    const agentMap = new Map(agentList.map((a) => [a.id, a.name]));

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      requestedByAgentName: (r.requestedByAgentId ? agentMap.get(r.requestedByAgentId) : null) || "Agent",
      payload: (r.payload as Record<string, unknown>) || {},
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  public async decideApproval(params: {
    approvalId: string;
    decision: "approved" | "rejected" | "revision_requested";
    decisionNote: string;
    telegramUserId: number;
    telegramUsername?: string;
  }): Promise<boolean> {
    const [existing] = await this.db
      .select()
      .from(approvals)
      .where(eq(approvals.id, params.approvalId))
      .limit(1);

    if (!existing) return false;

    const actorUserId = await this.resolveTelegramActorUserId(
      existing.companyId,
      params.telegramUserId,
    );

    const note = `${params.decisionNote} (bởi Telegram @${params.telegramUsername || params.telegramUserId})`;

    await this.db
      .update(approvals)
      .set({
        status: params.decision,
        decisionNote: note,
        decidedByUserId: actorUserId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(approvals.id, params.approvalId));

    const linkedIssues = await this.db
      .select({ issue: issues })
      .from(issueApprovals)
      .innerJoin(issues, and(
        eq(issues.id, issueApprovals.issueId),
        eq(issues.companyId, issueApprovals.companyId),
      ))
      .where(and(
        eq(issueApprovals.companyId, existing.companyId),
        eq(issueApprovals.approvalId, existing.id),
      ));
    for (const { issue } of linkedIssues) {
      const patch = buildAtelierTelegramApprovalDecisionPatch({
        issue,
        approvalId: existing.id,
        decision: params.decision,
        decisionNote: note,
      });
      if (!patch) continue;
      const updated = await issueService(this.db).update(issue.id, {
        companyGuard: issue.companyId,
        ...patch,
        actorUserId,
      });
      if (
        updated &&
        updated.status === "in_progress" &&
        updated.assigneeAgentId &&
        this.heartbeat
      ) {
        await queueIssueAssignmentWakeup({
          heartbeat: this.heartbeat,
          issue: updated,
          reason: "issue_assigned",
          mutation: "telegram.approval_revision",
          contextSource: "telegram.approval.decision",
          requestedByActorType: actorUserId ? "user" : "system",
          requestedByActorId: actorUserId,
          taskKey: updated.identifier,
        });
      }
    }

    addTelegramLog("info", `Approval ${params.approvalId} decided as ${params.decision}`, {
      decision: params.decision,
      telegramUserId: params.telegramUserId,
    });

    return true;
  }

  public async cancelTask(issueIdOrIdentifier: string, telegramUserId: number): Promise<string | null> {
    const taskData = await this.getTaskByIdentifierOrId(issueIdOrIdentifier);
    if (!taskData) return null;

    const { issue } = taskData;
    const actorUserId = await this.resolveTelegramActorUserId(
      issue.companyId,
      telegramUserId,
    );
    await this.db
      .update(issues)
      .set({
        status: "canceled",
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issue.id));

    await this.db.insert(issueComments).values({
      companyId: issue.companyId,
      issueId: issue.id,
      authorUserId: actorUserId,
      authorType: actorUserId ? "user" : "system",
      body: `🚫 **Công việc đã bị hủy** bởi người dùng qua Telegram.`,
    });

    return issue.identifier || issue.id;
  }

  public async getProjectProgress(telegramChatId?: number): Promise<{
    nativeProjectId: string | null;
    projectName: string | null;
    totalTasks: number;
    doneTasks: number;
    inProgressTasks: number;
    inReviewTasks: number;
    pendingApprovals: number;
    percentDone: number;
  }> {
    const { companyId } = await this.getCompanyAndProject();
    const context = telegramChatId === undefined ? null : await this.resolveProjectContext(telegramChatId);
    const selectedProject = context
      ? (await this.listProjects()).find((project) => project.id === context.nativeProjectId) ?? null
      : null;

    const allIssues = await this.db
      .select({ status: issues.status, displayStatus: issueDisplayStatusSql() })
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        ...(context ? [eq(issues.projectId, context.nativeProjectId)] : []),
      ));

    // Cancelled work is audit history, not unfinished project scope. Counting it
    // in the denominator permanently depresses progress after duplicate cleanup.
    const countedIssues = allIssues.filter((issue) => issue.status !== "cancelled");
    const totalTasks = countedIssues.length;
    const doneTasks = countedIssues.filter((i) => i.status === "done").length;
    const inProgressTasks = countedIssues.filter((i) => i.displayStatus === "in_progress").length;
    const inReviewTasks = countedIssues.filter((i) => i.displayStatus === "in_review").length;

    const pendingApprovalsList = await this.db
      .select({ id: approvals.id, payload: approvals.payload })
      .from(approvals)
      .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")));

    const percentDone = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const projectApprovals = context
      ? pendingApprovalsList.filter((approval) => {
          const projectId = approval.payload?.projectId ?? approval.payload?.project_id ?? approval.payload?.nativeProjectId;
          return projectId === context.nativeProjectId;
        })
      : pendingApprovalsList;

    return {
      nativeProjectId: context?.nativeProjectId ?? null,
      projectName: selectedProject?.name ?? null,
      totalTasks,
      doneTasks,
      inProgressTasks,
      inReviewTasks,
      pendingApprovals: projectApprovals.length,
      percentDone,
    };
  }
}
