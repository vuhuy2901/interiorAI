import os from "node:os";
import type { Db } from "@paperclipai/db";
import type {
  TelegramBridgeStatus,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
} from "./types.js";
import {
  addTelegramLog,
  getTelegramConfigSync,
  loadTelegramConfig,
  maskToken,
  recordChatTaskMapping,
  findTaskMappingByMessageOrChat,
  saveTelegramConfig,
  verifyAndPairUser,
} from "./config.js";
import { TelegramBotClient } from "./telegram-client.js";
import { AtelierTelegramTaskManager } from "./task-manager.js";
import { TelegramProjectContextError } from "./project-context.js";
import { formatTelegramCreationStatus, formatTelegramTaskStatus } from "./task-status.js";
import type { IssueAssignmentWakeupDeps } from "../issue-assignment-wakeup.js";

// Keep state for users currently in interactive `/newtask` flow: chatId -> targetAgentId
const pendingTaskAgentSelections = new Map<number, { agentId: string; agentName: string; expiresAt: number }>();

export class AtelierTelegramPoller {
  private db: Db;
  private client: TelegramBotClient;
  private taskManager: AtelierTelegramTaskManager;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private pollingPromise: Promise<void> | null = null;

  private status: "stopped" | "polling" | "connected" | "error" = "stopped";
  private startedAt: string | null = null;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
  private lastErrorAt: string | null = null;
  private botInfo: any = null;
  private progressMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private lastProgressSnapshot: string | null = null;
  private notificationCheckRunning = false;

  constructor(db: Db, heartbeat?: IssueAssignmentWakeupDeps) {
    this.db = db;
    this.taskManager = new AtelierTelegramTaskManager(db, heartbeat);
    const initialConfig = getTelegramConfigSync();
    this.client = new TelegramBotClient(initialConfig.botToken || "");
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    await loadTelegramConfig();
    const config = getTelegramConfigSync();

    if (!config.botEnabled) {
      this.status = "stopped";
      addTelegramLog("info", "Telegram Bot Bridge is disabled in settings. Poller not started.");
      return;
    }

    this.client.updateToken(config.botToken);

    if (!this.client.hasToken()) {
      this.status = "stopped";
      addTelegramLog("info", "Telegram Bot Token is not configured. Poller waiting in idle mode.");
      return;
    }

    // Verify token with getMe
    try {
      this.botInfo = await this.client.getMe();
      this.status = "connected";
      this.startedAt = new Date().toISOString();
      addTelegramLog("info", `Telegram Bot connected: @${this.botInfo.username} (${this.botInfo.first_name})`);
    } catch (err: any) {
      this.status = "error";
      this.lastError = String(err.message || err);
      this.lastErrorAt = new Date().toISOString();
      addTelegramLog("error", "Failed initial Telegram getMe connection check", { error: this.lastError });
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.status = "polling";

    this.pollingPromise = this.runPollingLoop(this.abortController.signal);
    await this.initializeProgressMonitor();
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.status = "stopped";
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.pollingPromise) {
      try {
        await this.pollingPromise;
      } catch {
        // ignore abort errors
      }
      this.pollingPromise = null;
    }
    if (this.progressMonitorTimer) {
      clearInterval(this.progressMonitorTimer);
      this.progressMonitorTimer = null;
    }
    this.lastProgressSnapshot = null;
    addTelegramLog("info", "Telegram Bot Poller stopped cleanly.");
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  public getStatus(): TelegramBridgeStatus {
    const config = getTelegramConfigSync();
    const uptime = this.startedAt ? Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000) : 0;

    return {
      status: this.status,
      botEnabled: config.botEnabled,
      isConfigured: this.client.hasToken(),
      tokenPreview: maskToken(config.botToken),
      botInfo: this.botInfo,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
      startedAt: this.startedAt,
      uptimeSeconds: uptime,
      lastUpdateId: config.lastUpdateId,
      stats: config.stats,
      pairedUserCount: config.userPairings.length,
      whitelistedUserCount: config.allowedUserIds.length,
      configuredChatIds: config.allowedChatIds,
      notificationsEnabled: config.notificationsEnabled,
      inboundMode: config.inboundMode,
      defaultAgentId: config.defaultAgentId,
    };
  }

  private async runPollingLoop(signal: AbortSignal): Promise<void> {
    let backoffDelay = 2000;

    while (this.isRunning && !signal.aborted) {
      const config = getTelegramConfigSync();
      this.lastPollAt = new Date().toISOString();

      try {
        const updates = await this.client.getUpdates(config.lastUpdateId + 1, 15, signal);
        backoffDelay = 2000; // Reset backoff on success

        if (updates && updates.length > 0) {
          for (const update of updates) {
            if (signal.aborted) break;

            // Advance update checkpoint
            if (update.update_id > config.lastUpdateId) {
              config.lastUpdateId = update.update_id;
              await saveTelegramConfig({ lastUpdateId: update.update_id });
            }

            try {
              await this.dispatchUpdate(update);
            } catch (dispatchErr: any) {
              addTelegramLog("error", "Error processing Telegram update", {
                updateId: update.update_id,
                error: String(dispatchErr.message || dispatchErr),
              });
              config.stats.errors++;
              await saveTelegramConfig();
            }
          }
        }
      } catch (pollErr: any) {
        if (signal.aborted) break;

        this.status = "error";
        this.lastError = String(pollErr.message || pollErr);
        this.lastErrorAt = new Date().toISOString();
        addTelegramLog("warn", `Telegram getUpdates poll error: ${this.lastError} (retrying in ${backoffDelay / 1000}s)`);

        config.stats.errors++;
        await saveTelegramConfig();

        // Exponential backoff up to 30s
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        backoffDelay = Math.min(backoffDelay * 1.5, 30000);
      }
    }
  }

  private isAuthorized(fromUser?: { id: number; username?: string }, chatId?: number): boolean {
    if (!fromUser) return false;
    const config = getTelegramConfigSync();

    if (chatId !== undefined && config.allowedChatIds.includes(chatId)) return true;
    if (config.allowedUserIds.includes(fromUser.id)) return true;
    if (fromUser.username && config.allowedUsernames.includes(fromUser.username)) return true;
    if (config.userPairings.some((p) => p.telegramUserId === fromUser.id)) return true;

    return false;
  }

  private async dispatchUpdate(update: TelegramUpdate): Promise<void> {
    try {
      await this.dispatchUpdateWithContext(update);
    } catch (error) {
      const message = update.message || update.edited_message;
      if (!(error instanceof TelegramProjectContextError) || !message) throw error;
      addTelegramLog("warn", "Telegram project context rejected", { chatId: message.chat.id, error: error.message });
      await this.client.sendMessage(message.chat.id, error.message, {
        reply_to_message_id: message.message_id, parse_mode: "Markdown",
      });
    }
  }

  private async dispatchUpdateWithContext(update: TelegramUpdate): Promise<void> {
    const config = getTelegramConfigSync();

    if (update.callback_query) {
      if (config.inboundMode === "notifications_only") {
        await this.client.answerCallbackQuery(update.callback_query.id, "Telegram đang ở chế độ chỉ nhận thông báo.");
        return;
      }
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    const message = update.message || update.edited_message;
    if (!message) return;

    config.stats.incomingMessages++;
    await saveTelegramConfig();

    // Web is the authoritative place for creating tasks, comments and
    // approvals while Telegram is configured as a notification channel.
    if (config.inboundMode === "notifications_only") return;
    if (!message.text) return;

    const text = message.text.trim();
    const fromUser = message.from;
    const chatId = message.chat.id;

    // Handle pairing codes (/pair <code> or /start <code>)
    if (text.startsWith("/pair ") || text.startsWith("/start ATL-")) {
      const code = text.replace("/pair", "").replace("/start", "").trim();
      if (fromUser && code) {
        const paired = await verifyAndPairUser(code, fromUser);
        if (paired) {
          await this.client.sendMessage(
            chatId,
            `🎉 **Xác thực và Ghép nối Thành công!**\n\n` +
              `Tài khoản Telegram của bạn (*@${fromUser.username || fromUser.first_name}*) đã được liên kết với hệ thống **ATELIER AI 2.0**.\n\n` +
              `Bây giờ bạn có thể:\n` +
              `• Gõ \`/agents\` để xem danh sách 8 Agent\n` +
              `• Gõ \`/newtask\` để giao việc cho Agent\n` +
              `• Nhắn tin trực tiếp yêu cầu thiết kế để KTS Trưởng điều phối!`,
            { reply_to_message_id: message.message_id }
          );
          return;
        } else {
          await this.client.sendMessage(
            chatId,
            `❌ **Mã ghép nối không hợp lệ hoặc đã hết hạn.**\n\nVui lòng vào web ATELIER AI: **Cài đặt → Telegram** để tạo mã mới.`,
            { reply_to_message_id: message.message_id }
          );
          return;
        }
      }
    }

    // Check authorization for all other commands/messages
    if (!this.isAuthorized(fromUser, chatId)) {
      await this.client.sendMessage(
        chatId,
        `🔒 **ATELIER AI 2.0 — Yêu cầu xác thực tài khoản**\n\n` +
          `Tài khoản Telegram này (*ID: \`${fromUser?.id}\`*) chưa được phân quyền truy cập.\n\n` +
          `👉 **Cách kích hoạt:**\n` +
          `1. Mở trang web ATELIER AI tại máy tính.\n` +
          `2. Vào mục **Cài đặt → Telegram** và bấm *"Tạo mã ghép nối"*.\n` +
          `3. Gửi lệnh: \`/pair <MÃ_6_SỐ>\` tại đây để bắt đầu.`,
        { reply_to_message_id: message.message_id }
      );
      return;
    }

    // If user is inside pending `/newtask` selection
    const pendingSelection = pendingTaskAgentSelections.get(chatId);
    if (pendingSelection && Date.now() < pendingSelection.expiresAt && !text.startsWith("/")) {
      await this.client.sendChatAction(chatId, "typing");

      const created = await this.taskManager.createTaskFromTelegram({
        title: text.length > 60 ? `${text.slice(0, 57)}...` : text,
        description: text,
        targetAgentId: pendingSelection.agentId,
        telegramUserId: fromUser?.id || chatId,
        telegramChatId: chatId,
        telegramUsername: fromUser?.username,
      });
      pendingTaskAgentSelections.delete(chatId);

      config.stats.tasksCreated++;
      await saveTelegramConfig();

      const sent = await this.client.sendMessage(
        chatId,
        `✅ **Đã tạo công việc thành công!**\n\n` +
          `📋 **Mã**: \`${created.identifier}\`\n` +
          `🤖 **Phụ trách**: *${created.assignedAgentName}*\n` +
          `📌 **Tiêu đề**: ${text.slice(0, 100)}\n` +
          `⚡ **Trạng thái**: ${formatTelegramCreationStatus(created.executionStatus)}\n\n` +
          `💡 *Bạn có thể trả lời (Reply) trực tiếp tin nhắn này để bổ sung yêu cầu cho Agent.*`,
        {
          reply_to_message_id: message.message_id,
          reply_markup: {
            inline_keyboard: [
              [
                { text: `🔍 Xem chi tiết ${created.identifier}`, callback_data: `view_task:${created.issueId}` },
                { text: "📋 Danh sách Task", callback_data: "cmd_tasks" },
              ],
            ],
          },
        }
      );

      await recordChatTaskMapping({
        telegramChatId: chatId,
        telegramMessageId: sent.message_id,
        telegramThreadId: message.message_thread_id,
        issueId: created.issueId,
        issueIdentifier: created.identifier,
        taskTitle: text.slice(0, 100),
        assignedAgentName: created.assignedAgentName,
        lastActivityAt: new Date().toISOString(),
      });
      return;
    }

    // Check if this message is a Reply to an existing Task message (Two-Way Sync!)
    if (message.reply_to_message && !text.startsWith("/")) {
      const mapping = findTaskMappingByMessageOrChat(chatId, message.reply_to_message.message_id);
      if (mapping) {
        await this.client.sendChatAction(chatId, "typing");
        await this.taskManager.addCommentToTask({
          issueId: mapping.issueId,
          comment: text,
          telegramUserId: fromUser?.id || chatId,
          telegramUsername: fromUser?.username,
        });

        config.stats.commentsCreated++;
        await saveTelegramConfig();

        await this.client.sendMessage(
          chatId,
          `💬 *Đã chuyển phản hồi của bạn vào công việc \`${mapping.issueIdentifier}\` cho ${mapping.assignedAgentName} xử lý.*`,
          { reply_to_message_id: message.message_id }
        );
        return;
      }
    }

    // Command Handlers
    if (text.startsWith("/")) {
      const [cmdPart, ...argParts] = text.split(/\s+/);
      const cmd = cmdPart.toLowerCase().split("@")[0];
      const args = argParts.join(" ").trim();

      switch (cmd) {
        case "/projects":
          await this.handleProjectsCommand(chatId, message.message_id);
          break;
        case "/project":
          await this.handleProjectCommand(chatId, args, message.message_id);
          break;
        case "/start":
        case "/help":
          await this.handleHelpCommand(chatId, message.message_id);
          break;
        case "/agents":
          await this.handleAgentsCommand(chatId, message.message_id);
          break;
        case "/newtask":
          await this.handleNewTaskCommand(chatId, message.message_id);
          break;
        case "/tasks":
          await this.handleTasksCommand(chatId, message.message_id);
          break;
        case "/task":
          await this.handleTaskDetailCommand(chatId, args, message.message_id);
          break;
        case "/approvals":
          await this.handleApprovalsCommand(chatId, message.message_id);
          break;
        case "/status":
          await this.handleStatusCommand(chatId, message.message_id);
          break;
        case "/progress":
          await this.handleProgressCommand(chatId, message.message_id);
          break;
        case "/report":
          await this.handleReportCommand(chatId, message.message_id);
          break;
        case "/bom":
        case "/inventory":
          await this.handleInventoryBomCommand(chatId, message.message_id);
          break;
        case "/cancel":
          await this.handleCancelCommand(chatId, args, message.message_id, fromUser?.id || chatId);
          break;
        default:
          await this.client.sendMessage(
            chatId,
            `❓ Lệnh không xác định. Gõ \`/help\` để xem danh sách các lệnh được hỗ trợ.`,
            { reply_to_message_id: message.message_id }
          );
      }
      return;
    }

    // Natural Language Agent Request Handler
    await this.handleNaturalLanguageMessage(chatId, text, message.message_id, fromUser);
  }

  private async handleHelpCommand(chatId: number, replyToMessageId: number): Promise<void> {
    const text =
      `Projects: /projects — list native projects; /project <native ID> — select for this chat.\n\n` +
      `🏛️ **ATELIER AI 2.0 — TRUNG TÂM ĐIỀU PHỐI ĐA AGENT**\n\n` +
      `Hệ thống thiết kế nội thất 3D & BIM trên nền tảng Paperclip.\n\n` +
      `📋 **Danh mục lệnh:**\n` +
      `• \`/agents\` — Danh sách 12+ Chuyên gia Agent\n` +
      `• \`/newtask\` — Giao việc mới qua menu\n` +
      `• \`/tasks\` — Công việc của dự án đang chọn\n` +
      `• \`/task <mã>\` — Xem chi tiết công việc (VD: \`/task ATL-1\`)\n` +
      `• \`/approvals\` — Xem và phê duyệt các đề xuất thiết kế/báo giá\n` +
      `• \`/bom\` hoặc \`/inventory\` — Xem bóc tách khối lượng & danh mục vật tư BOM\n` +
      `• \`/status\` — Trạng thái hệ thống Local-Lite (RAM, CPU, Agents)\n` +
      `• \`/progress\` — Tiến độ của dự án đang chọn\n` +
      `• \`/report\` — Báo cáo của dự án đang chọn\n` +
      `• \`/cancel <mã>\` — Hủy công việc (VD: \`/cancel ATL-8\`)\n` +
      `• \`/help\` — Xem lại hướng dẫn này\n\n` +
      `💬 **Giao việc tự nhiên:**\n` +
      `Bạn có thể nhắn tin trực tiếp để giao việc, ví dụ:\n` +
      `👉 *"Giao cho Geometry Agent dựng một căn phòng 4×5m, có một cửa ra vào và hai cửa sổ."*\n` +
      `👉 *"Đổi sàn gạch màu sáng, làm lại trần giật cấp và thêm cây xanh"*`;

    await this.client.sendMessage(chatId, text, {
      reply_to_message_id: replyToMessageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🤖 Chuyên gia Agent", callback_data: "cmd_agents" },
            { text: "➕ Giao việc mới", callback_data: "cmd_newtask" },
          ],
          [
            { text: "📋 Công việc đang làm", callback_data: "cmd_tasks" },
            { text: "📦 Danh mục BOM", callback_data: "cmd_bom" },
          ],
          [
            { text: "⚖️ Phê duyệt đề xuất", callback_data: "cmd_approvals" },
            { text: "📊 Trạng thái hệ thống", callback_data: "cmd_status" },
          ],
        ],
      },
    });
  }

  private async handleProjectsCommand(chatId: number, replyToMessageId: number): Promise<void> {
    const projects = await this.taskManager.listProjects();
    const selection = getTelegramConfigSync().chatProjectSelections.find((entry) => entry.telegramChatId === chatId);
    const lines = projects.map((project) =>
      `${selection?.companyId === project.companyId && selection.nativeProjectId === project.id ? "Selected: " : ""}${project.name.slice(0, 80)}\n/project ${project.id}`);
    if (!lines.length) lines.push("No native projects. Create a native project and link its canonical scene first.");
    for (let offset = 0; offset < lines.length; offset += 20) {
      await this.client.sendMessage(chatId,
        `Native projects for this company (scene binding is validated on selection):\n\n${lines.slice(offset, offset + 20).join("\n\n")}`,
        { reply_to_message_id: replyToMessageId, parse_mode: "Markdown" });
    }
  }

  private async handleProjectCommand(chatId: number, nativeProjectId: string, replyToMessageId: number): Promise<void> {
    if (!nativeProjectId || /\s/.test(nativeProjectId)) {
      await this.client.sendMessage(chatId, "Use /projects then /project <native ID>. The choice applies only to this chat.", { reply_to_message_id: replyToMessageId });
      return;
    }
    const context = await this.taskManager.selectProjectForChat(chatId, nativeProjectId);
    await this.client.sendMessage(chatId,
      `Selected native project: ${context.nativeProjectId}\nCanonical scene: ${context.sceneId}\nObserved revision: ${context.revision}\nNew tasks in this chat use this binding; it is revalidated before creation.`,
      { reply_to_message_id: replyToMessageId, parse_mode: "Markdown" });
  }

  private async handleAgentsCommand(chatId: number, replyToMessageId?: number): Promise<void> {
    const agentsList = await this.taskManager.listAgents();

    let text = `👥 **DANH SÁCH ${agentsList.length} CHUYÊN GIA AGENT ATELIER AI:**\n\n`;
    for (const a of agentsList) {
      let icon = "🤖";
      if (a.key === "agent_chief_architect" || a.key === "agent_concierge") icon = "🏛️";
      else if (a.key === "agent_floorplan") icon = "📐";
      else if (a.key === "agent_geometry") icon = "🧱";
      else if (a.key === "agent_furniture") icon = "🛋️";
      else if (a.key === "agent_style") icon = "🎨";
      else if (a.key === "agent_material") icon = "🪵";
      else if (a.key === "agent_ceiling_lighting") icon = "💡";
      else if (a.key === "agent_research") icon = "🔍";
      else if (a.key === "agent_render") icon = "🖼️";
      else if (a.key === "agent_inventory") icon = "📋";
      else if (a.key === "agent_cost") icon = "📊";
      else if (a.key === "agent_shopping") icon = "🛒";
      else if (a.key === "agent_qa") icon = "🛡️";

      text += `${icon} **${a.name}**\n   *${a.role}* — ${a.description || "Sẵn sàng nhận nhiệm vụ"}\n\n`;
    }

    text += `💡 *Bấm chọn một Agent bên dưới để giao việc nhanh:*`;

    const keyboard = agentsList.map((a) => [
      { text: `👉 Giao việc cho ${a.name}`, callback_data: `pick_agent:${a.id}:${a.name.slice(0, 20)}` },
    ]);

    await this.client.sendMessage(chatId, text, {
      reply_to_message_id: replyToMessageId,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  private async handleNewTaskCommand(chatId: number, replyToMessageId?: number): Promise<void> {
    const agentsList = await this.taskManager.listAgents();
    const keyboard = agentsList.map((a) => [
      { text: `${a.name} (${a.role.slice(0, 24)})`, callback_data: `pick_agent:${a.id}:${a.name.slice(0, 20)}` },
    ]);

    await this.client.sendMessage(chatId, `📝 **TẠO CÔNG VIỆC MỚI**\n\nVui lòng chọn Agent bạn muốn giao nhiệm vụ:`, {
      reply_to_message_id: replyToMessageId,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  private async handleTasksCommand(chatId: number, replyToMessageId?: number): Promise<void> {
    const tasks = await this.taskManager.listActiveTasks(10, chatId);

    if (tasks.length === 0) {
      await this.client.sendMessage(chatId, `✨ Hiện tại không có công việc nào đang xử lý. Gõ \`/newtask\` để bắt đầu!`, {
        reply_to_message_id: replyToMessageId,
      });
      return;
    }

    let text = `📋 **CÁC CÔNG VIỆC CHƯA KẾT THÚC (${tasks.length}):**\n\n`;
    const keyboard: any[] = [];

    for (const t of tasks) {
      const statusEmoji = t.displayStatus === "in_progress" ? "⚡" : t.displayStatus === "blocked" ? "🚧" : t.displayStatus === "in_review" ? "🔍" : "⏳";
      text += `${statusEmoji} **\`${t.identifier}\`**: ${t.title}\n   Phụ trách: *${t.assignedAgentName}* | Trạng thái: ${formatTelegramTaskStatus(t)}\n\n`;
      keyboard.push([{ text: `🔍 Xem ${t.identifier}`, callback_data: `view_task:${t.id}` }]);
    }

    await this.client.sendMessage(chatId, text, {
      reply_to_message_id: replyToMessageId,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  private async handleTaskDetailCommand(chatId: number, identifierOrId: string, replyToMessageId?: number): Promise<void> {
    if (!identifierOrId) {
      await this.client.sendMessage(chatId, `⚠️ Vui lòng nhập mã công việc, ví dụ: \`/task ATL-1\` hoặc \`/task ATL-8\``, {
        reply_to_message_id: replyToMessageId,
      });
      return;
    }

    const data = await this.taskManager.getTaskByIdentifierOrId(identifierOrId);
    if (!data) {
      await this.client.sendMessage(chatId, `❌ Không tìm thấy công việc với mã \`${identifierOrId}\`.`, {
        reply_to_message_id: replyToMessageId,
      });
      return;
    }

    const { issue, comments, assignedAgentName } = data;
    const ident = issue.identifier || `ATL-${issue.issueNumber || issue.id.slice(0, 4)}`;

    let text =
      `📌 **CHI TIẾT CÔNG VIỆC: \`${ident}\`**\n\n` +
      `**Tiêu đề:** ${issue.title}\n` +
      `**Agent phụ trách:** *${assignedAgentName}*\n` +
      `**Trạng thái:** ${formatTelegramTaskStatus(issue)}\n` +
      `**Mức ưu tiên:** \`${issue.priority}\`\n` +
      `**Mô tả:**\n${issue.description || "Không có mô tả chi tiết."}\n\n`;

    if (comments.length > 0) {
      text += `💬 **Bình luận & phản hồi gần nhất (${comments.length}):**\n`;
      for (const c of comments.slice(0, 3)) {
        text += `• ${c.body.slice(0, 120)}\n`;
      }
    }

    const sent = await this.client.sendMessage(chatId, text, {
      reply_to_message_id: replyToMessageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🚫 Hủy công việc`, callback_data: `cancel_task:${ident}` },
            { text: `📋 Danh sách công việc`, callback_data: `cmd_tasks` },
          ],
        ],
      },
    });

    await recordChatTaskMapping({
      telegramChatId: chatId,
      telegramMessageId: sent.message_id,
      issueId: issue.id,
      issueIdentifier: ident,
      taskTitle: issue.title,
      assignedAgentName,
      lastActivityAt: new Date().toISOString(),
    });
  }

  private async handleApprovalsCommand(chatId: number, replyToMessageId?: number): Promise<void> {
    const list = await this.taskManager.listPendingApprovals();

    if (list.length === 0) {
      await this.client.sendMessage(chatId, `✨ **Tuyệt vời!** Hiện tại không có đề xuất thiết kế hoặc báo giá nào đang chờ phê duyệt.`, {
        reply_to_message_id: replyToMessageId,
      });
      return;
    }

    await this.client.sendMessage(chatId, `⚖️ **CÓ ${list.length} YÊU CẦU ĐANG CHỜ PHÊ DUYỆT:**`, {
      reply_to_message_id: replyToMessageId,
    });

    for (const app of list) {
      const payload = app.payload;
      const title = String(payload.title || payload.summary || `Đề xuất ${app.type}`);
      const costDelta = payload.cost_delta_vnd || payload.costImpact || "Chưa có dự toán bổ sung";

      const text =
        `📝 **Đề xuất: ${title}**\n` +
        `👤 **Yêu cầu bởi:** *${app.requestedByAgentName}*\n` +
        `💰 **Tác động ngân sách:** ${costDelta}\n` +
        `⏱ **Thời gian gửi:** ${new Date(app.createdAt).toLocaleString("vi-VN")}\n\n` +
        `Vui lòng chọn hành động phê duyệt:`;

      await this.client.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Phê duyệt (Approve)", callback_data: `appr_ok:${app.id}` },
              { text: "❌ Từ chối (Reject)", callback_data: `appr_no:${app.id}` },
            ],
            [{ text: "✏️ Yêu cầu chỉnh sửa", callback_data: `appr_rev:${app.id}` }],
          ],
        },
      });
    }
  }

  private async handleStatusCommand(chatId: number, replyToMessageId?: number): Promise<void> {
    const memUsage = process.memoryUsage();
    const rssMb = Math.round(memUsage.rss / (1024 * 1024));
    const heapMb = Math.round(memUsage.heapUsed / (1024 * 1024));
    const config = getTelegramConfigSync();

    const progress = await this.taskManager.getProjectProgress();

    const text =
      `🖥️ **TRẠNG THÁI HỆ THỐNG ATELIER AI 2.0 (LOCAL-LITE):**\n\n` +
      `⚡ **Kiến trúc:** Zero-Docker / Embedded-Postgres / Paperclip-First\n` +
      `💾 **Bộ nhớ RAM (Node.js RSS):** \`${rssMb} MB\` (Heap: \`${heapMb} MB\`)\n` +
      `🗄️ **Cơ sở dữ liệu:** Embedded PostgreSQL (Cổng \`54329\`)\n` +
      `🤖 **Telegram Bot:** \`@${this.botInfo?.username || "AtelierBot"}\` (\`polling\`)\n` +
      `📊 **Thống kê hoạt động:**\n` +
      `   • Tin nhắn nhận: \`${config.stats.incomingMessages}\`\n` +
      `   • Công việc đã tạo: \`${config.stats.tasksCreated}\`\n` +
      `   • Phản hồi đã chuyển: \`${config.stats.commentsCreated}\`\n` +
      `   • Đã duyệt: \`${config.stats.approvalsProcessed}\`\n` +
      `   • Tổng công việc công ty: \`${progress.totalTasks}\` (Hoàn thành: \`${progress.percentDone}%\`)\n` +
      `⏱️ **Uptime Bot:** \`${this.getStatus().uptimeSeconds}\` giây`;

    await this.client.sendMessage(chatId, text, { reply_to_message_id: replyToMessageId });
  }

  private async handleProgressCommand(chatId: number, replyToMessageId?: number): Promise<void> {
    const progress = await this.taskManager.getProjectProgress(chatId);
    const filledBars = Math.round((progress.percentDone / 100) * 10);
    const emptyBars = 10 - filledBars;
    const bar = "█".repeat(filledBars) + "░".repeat(emptyBars);

    const text =
      `📈 **TIẾN ĐỘ DỰ ÁN: ${progress.projectName ?? progress.nativeProjectId ?? "ĐANG CHỌN"}**\n\n` +
      `[${bar}] **${progress.percentDone}%**\n\n` +
      `• Tổng số công việc: **${progress.totalTasks}**\n` +
      `• Đã hoàn thành (\`done\`): **${progress.doneTasks}**\n` +
      `• Đang thực hiện (\`in_progress\`): **${progress.inProgressTasks}**\n` +
      `• Đang chờ phản hồi/duyệt (\`in_review\`): **${progress.inReviewTasks}**\n` +
      `• Đang chờ duyệt: **${progress.pendingApprovals}**`;

    await this.client.sendMessage(chatId, text, {
      reply_to_message_id: replyToMessageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📋 Xem công việc", callback_data: "cmd_tasks" },
            { text: "⚖️ Xem yêu cầu duyệt", callback_data: "cmd_approvals" },
          ],
        ],
      },
    });
  }

  private async handleReportCommand(chatId: number, replyToMessageId?: number): Promise<void> {
    await this.handleProgressCommand(chatId, replyToMessageId);
  }

  private async handleInventoryBomCommand(chatId: number, replyToMessageId?: number): Promise<void> {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/v1/projects/proj_demo_4x5m/inventory");
      if (!res.ok) {
        await this.client.sendMessage(chatId, "⚠️ Hiện chưa thể tải bảng danh mục BOM từ hệ thống.", {
          reply_to_message_id: replyToMessageId,
        });
        return;
      }
      const data = (await res.json()) as any;
      const bom = data.inventory_bom;
      if (!bom) {
        await this.client.sendMessage(chatId, "⚠️ Chưa có dữ liệu bóc tách vật tư.", {
          reply_to_message_id: replyToMessageId,
        });
        return;
      }

      let text =
        `📋 **DANH MỤC VẬT TƯ & THIẾT BỊ (DESIGN INVENTORY / BOM)**\n\n` +
        `🏠 **Dự án:** \`${bom.project_id}\` (Phiên bản ${bom.revision})\n` +
        `📦 **Tổng hạng mục:** \`${bom.total_items_count}\` vật tư / thiết bị\n` +
        `💰 **Tổng giá trị định lượng:** **${bom.priced_items_subtotal_vnd.toLocaleString("vi-VN")} VNĐ**\n\n` +
        `📝 **Chi tiết các hạng mục chính:**\n`;

      const previewItems = (bom.all_items || []).slice(0, 8);
      for (const item of previewItems) {
        const priceStr = item.unit_price_vnd ? `${item.unit_price_vnd.toLocaleString("vi-VN")} đ` : "Chưa có giá";
        text += `• **${item.name}** (${item.room})\n   └ ${item.quantity} ${item.unit} | ${item.supplier || "Tiêu chuẩn"} | *${priceStr}*\n`;
      }

      if ((bom.all_items || []).length > 8) {
        text += `\n... và **${(bom.all_items || []).length - 8} hạng mục khác**.\n`;
      }

      await this.client.sendMessage(chatId, text, {
        reply_to_message_id: replyToMessageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📥 Tải tệp CSV (Excel)", url: "http://127.0.0.1:3100/api/v1/projects/proj_demo_4x5m/inventory/export/csv" },
              { text: "⚖️ Xem duyệt", callback_data: "cmd_approvals" },
            ],
          ],
        },
      });
    } catch (err: any) {
      await this.client.sendMessage(chatId, `❌ Lỗi khi tải danh mục BOM: ${err.message}`, {
        reply_to_message_id: replyToMessageId,
      });
    }
  }

  private async handleCancelCommand(
    chatId: number,
    identifier: string,
    replyToMessageId: number,
    telegramUserId: number
  ): Promise<void> {
    if (!identifier) {
      await this.client.sendMessage(chatId, `⚠️ Vui lòng nhập mã công việc cần hủy, ví dụ: \`/cancel ATL-8\``, {
        reply_to_message_id: replyToMessageId,
      });
      return;
    }

    const cancelledIdent = await this.taskManager.cancelTask(identifier, telegramUserId);
    if (!cancelledIdent) {
      await this.client.sendMessage(chatId, `❌ Không tìm thấy công việc \`${identifier}\` để hủy.`, {
        reply_to_message_id: replyToMessageId,
      });
      return;
    }

    await this.client.sendMessage(chatId, `🚫 **Đã hủy công việc \`${cancelledIdent}\` thành công.**`, {
      reply_to_message_id: replyToMessageId,
    });
  }

  private async handleNaturalLanguageMessage(
    chatId: number,
    text: string,
    messageId: number,
    fromUser?: { id: number; username?: string; first_name?: string }
  ): Promise<void> {
    await this.client.sendChatAction(chatId, "typing");

    // 1. Detect target Agent
    const matchedAgent = await this.taskManager.findAgentByQuery(text);
    const chief = await this.taskManager.getChiefArchitect();
    const assignedAgent = matchedAgent || chief;

    // 2. Vague intent check for Chief Architect
    const isVague =
      text.length < 25 &&
      (text.toLowerCase().includes("thiết kế") ||
        text.toLowerCase().includes("làm đẹp") ||
        text.toLowerCase().includes("tư vấn") ||
        text.toLowerCase() === "xin chào" ||
        text.toLowerCase() === "hello");

    if (isVague && assignedAgent?.key === "agent_chief_architect") {
      await this.client.sendMessage(
        chatId,
        `🏛️ **KTS Trưởng (Chief Architect) xin lắng nghe!**\n\n` +
          `Tôi rất sẵn lòng hỗ trợ bạn thiết kế không gian. Để phân công chính xác các Agent chuyên trách (Geometry, Furniture, Style, Cost), bạn vui lòng cho biết:\n` +
          `1️⃣ **Không gian cần thiết kế:** Phòng khách, phòng ngủ hay toàn bộ căn hộ?\n` +
          `2️⃣ **Phong cách yêu thích:** Hiện đại tối giản, Japandi ấm áp, hay Indochine sang trọng?\n` +
          `3️⃣ **Kích thước hoặc yêu cầu đặc biệt:** Ví dụ: phòng 4x5m, cần nhiều ánh sáng tự nhiên...`,
        { reply_to_message_id: messageId }
      );
      return;
    }

    // 3. Actionable task creation
    const config = getTelegramConfigSync();
    const created = await this.taskManager.createTaskFromTelegram({
      title: text.length > 70 ? `${text.slice(0, 67)}...` : text,
      description: text,
      targetAgentId: assignedAgent?.id,
      telegramUserId: fromUser?.id || chatId,
      telegramChatId: chatId,
      telegramUsername: fromUser?.username,
    });

    config.stats.tasksCreated++;
    await saveTelegramConfig();

    const responseMsg =
      `✅ **ĐÃ TIẾP NHẬN VÀ GIAO CÔNG VIỆC THÀNH CÔNG**\n\n` +
      `📋 **Mã công việc:** \`${created.identifier}\`\n` +
      `🤖 **Agent phụ trách:** *${created.assignedAgentName}*\n` +
      `📌 **Nội dung:** ${text.slice(0, 120)}\n` +
      `⚡ **Trạng thái:** ${formatTelegramCreationStatus(created.executionStatus)}\n\n` +
      `💡 *Mẹo: Bạn có thể Reply (Trả lời) trực tiếp tin nhắn này để tiếp tục trao đổi với Agent!*`;

    const sent = await this.client.sendMessage(chatId, responseMsg, {
      reply_to_message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🔍 Chi tiết ${created.identifier}`, callback_data: `view_task:${created.issueId}` },
            { text: `📋 Danh sách Task`, callback_data: `cmd_tasks` },
          ],
        ],
      },
    });

    await recordChatTaskMapping({
      telegramChatId: chatId,
      telegramMessageId: sent.message_id,
      issueId: created.issueId,
      issueIdentifier: created.identifier,
      taskTitle: text.slice(0, 100),
      assignedAgentName: created.assignedAgentName,
      lastActivityAt: new Date().toISOString(),
    });
  }

  private async handleCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
    if (!cb.data) return;
    const data = cb.data;
    const fromUser = cb.from;
    const chatId = cb.message?.chat.id;
    const config = getTelegramConfigSync();

    if (!this.isAuthorized(fromUser, chatId)) {
      await this.client.answerCallbackQuery(cb.id, "Bạn không có quyền thực hiện thao tác này.", true);
      return;
    }

    // Agent picker selection: pick_agent:<agentId>:<agentName>
    if (data.startsWith("pick_agent:")) {
      const parts = data.split(":");
      const agentId = parts[1];
      const agentName = parts[2] || "Agent";

      if (chatId) {
        pendingTaskAgentSelections.set(chatId, {
          agentId,
          agentName,
          expiresAt: Date.now() + 10 * 60 * 1000,
        });
      }

      await this.client.answerCallbackQuery(cb.id, `Đã chọn ${agentName}`);
      if (chatId) {
        await this.client.sendMessage(
          chatId,
          `✍️ Bạn đã chọn **${agentName}**.\n\nHãy nhập nội dung yêu cầu bạn muốn giao cho Agent này ngay bên dưới:`
        );
      }
      return;
    }

    // View task callback: view_task:<issueId>
    if (data.startsWith("view_task:")) {
      const issueId = data.replace("view_task:", "");
      await this.client.answerCallbackQuery(cb.id);
      if (chatId) {
        await this.handleTaskDetailCommand(chatId, issueId);
      }
      return;
    }

    // Command shortcuts via buttons
    if (data === "cmd_tasks" && chatId) {
      await this.client.answerCallbackQuery(cb.id);
      await this.handleTasksCommand(chatId);
      return;
    }
    if (data === "cmd_bom" && chatId) {
      await this.client.answerCallbackQuery(cb.id);
      await this.handleInventoryBomCommand(chatId);
      return;
    }
    if (data === "cmd_agents" && chatId) {
      await this.client.answerCallbackQuery(cb.id);
      await this.handleAgentsCommand(chatId);
      return;
    }
    if (data === "cmd_newtask" && chatId) {
      await this.client.answerCallbackQuery(cb.id);
      await this.handleNewTaskCommand(chatId);
      return;
    }
    if (data === "cmd_approvals" && chatId) {
      await this.client.answerCallbackQuery(cb.id);
      await this.handleApprovalsCommand(chatId);
      return;
    }
    if (data === "cmd_status" && chatId) {
      await this.client.answerCallbackQuery(cb.id);
      await this.handleStatusCommand(chatId);
      return;
    }
    if (data === "cmd_progress" && chatId) {
      await this.client.answerCallbackQuery(cb.id);
      await this.handleProgressCommand(chatId);
      return;
    }

    // Cancel task callback
    if (data.startsWith("cancel_task:") && chatId) {
      const ident = data.replace("cancel_task:", "");
      await this.client.answerCallbackQuery(cb.id, `Đang hủy ${ident}...`);
      await this.handleCancelCommand(chatId, ident, cb.message?.message_id || 0, fromUser.id);
      return;
    }

    // Approval callbacks: appr_ok:<id>, appr_no:<id>, appr_rev:<id>
    if (data.startsWith("appr_ok:") || data.startsWith("appr_no:") || data.startsWith("appr_rev:")) {
      const [action, approvalId] = data.split(":");
      let decision: "approved" | "rejected" | "revision_requested" = "approved";
      let decisionTitle = "✅ ĐÃ PHÊ DUYỆT (APPROVED)";

      if (action === "appr_no") {
        decision = "rejected";
        decisionTitle = "❌ ĐÃ TỪ CHỐI (REJECTED)";
      } else if (action === "appr_rev") {
        decision = "revision_requested";
        decisionTitle = "✏️ ĐÃ YÊU CẦU CHỈNH SỬA (REVISION REQUESTED)";
      }

      const ok = await this.taskManager.decideApproval({
        approvalId,
        decision,
        decisionNote: decisionTitle,
        telegramUserId: fromUser.id,
        telegramUsername: fromUser.username,
      });

      config.stats.approvalsProcessed++;
      await saveTelegramConfig();

      if (ok) {
        await this.client.answerCallbackQuery(cb.id, `Đã ghi nhận: ${decisionTitle}!`, false);
        if (chatId && cb.message) {
          const oldText = cb.message.text || "";
          const newText = `${oldText}\n\n━━━━━━━━━━━━━━━━━━━━\n${decisionTitle} bởi *@${fromUser.username || fromUser.first_name}* lúc ${new Date().toLocaleTimeString("vi-VN")}`;
          await this.client.editMessageText(chatId, cb.message.message_id, newText, {
            reply_markup: { inline_keyboard: [] },
          });
        }
      } else {
        await this.client.answerCallbackQuery(cb.id, "Không tìm thấy yêu cầu phê duyệt hoặc đã được xử lý trước đó.", true);
      }
      return;
    }

    await this.client.answerCallbackQuery(cb.id);
  }

  // Proactive notification broadcast to all paired Telegram users
  public async broadcastNotification(text: string, options?: { inline_keyboard?: any[] }): Promise<number> {
    const config = getTelegramConfigSync();
    if (!config.notificationsEnabled || !this.client.hasToken()) return 0;

    let delivered = 0;
    const targetChatIds = new Set<number>();

    for (const p of config.userPairings) {
      targetChatIds.add(p.telegramUserId);
    }
    for (const id of config.allowedChatIds) {
      targetChatIds.add(id);
    }
    for (const id of config.allowedUserIds) {
      targetChatIds.add(id);
    }

    for (const chatId of targetChatIds) {
      try {
        await this.client.sendMessage(chatId, text, {
          reply_markup: options?.inline_keyboard ? { inline_keyboard: options.inline_keyboard } : undefined,
        });
        delivered++;
      } catch (err: any) {
        addTelegramLog("warn", `Could not deliver broadcast to Telegram chat ${chatId}`, { error: String(err) });
      }
    }

    return delivered;
  }

  private async initializeProgressMonitor(): Promise<void> {
    try {
      const progress = await this.taskManager.getProjectProgress();
      this.lastProgressSnapshot = JSON.stringify(progress);
    } catch (err: any) {
      addTelegramLog("warn", "Could not initialize Telegram progress monitor", { error: String(err) });
    }

    if (this.progressMonitorTimer) clearInterval(this.progressMonitorTimer);
    this.progressMonitorTimer = setInterval(() => {
      if (this.notificationCheckRunning) return;
      this.notificationCheckRunning = true;
      this.checkAndNotifyProgress()
        .catch((err) => {
          addTelegramLog("warn", "Telegram progress monitor check failed", { error: String(err) });
        })
        .finally(() => {
          this.notificationCheckRunning = false;
        });
    }, 15000);
  }

  private extractAgentReply(body: string): { needsInput: boolean; content: string } {
    const questionSection = body.match(
      /(?:^|\n)questions\s*\n([\s\S]*?)(?=\n(?:assumptions|handoff|status)\s*\n|$)/i,
    );
    const inlineQuestions = body.match(
      /(?:^|\n)`?questions`?\s*:\s*([\s\S]*?)(?=\n`?(?:assumptions|handoff|status)`?\s*:|$)/i,
    );
    const needsInput =
      /status:\s*`?needs_input`?/i.test(body) || Boolean(questionSection) || Boolean(inlineQuestions);
    const raw = (questionSection?.[1] || inlineQuestions?.[1] || body).trim();
    const maxLength = 3200;
    return {
      needsInput,
      content: raw.length > maxLength ? `${raw.slice(0, maxLength)}\n…` : raw,
    };
  }

  private async checkAndNotifyMappedTaskUpdates(): Promise<void> {
    const config = getTelegramConfigSync();
    if (!config.notificationsEnabled || !this.client.hasToken()) return;

    for (const mapping of [...config.chatTaskMappings]) {
      const task = await this.taskManager.getTaskByIdentifierOrId(mapping.issueId);
      if (!task) continue;

      const lastActivityAt = Date.parse(mapping.lastActivityAt || "1970-01-01T00:00:00.000Z");
      const latestAgentComment = task.comments
        .filter((comment) => {
          const createdAt = new Date(comment.createdAt).getTime();
          return comment.authorType === "agent" && Boolean(comment.authorAgentId) && createdAt > lastActivityAt;
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

      if (!latestAgentComment) continue;

      const reply = this.extractAgentReply(latestAgentComment.body);
      const heading = reply.needsInput
        ? `❓ **${mapping.assignedAgentName} cần bạn bổ sung cho ${mapping.issueIdentifier}**`
        : `🤖 **${mapping.assignedAgentName} cập nhật ${mapping.issueIdentifier}**`;
      const footer = `Trạng thái hiện tại: ${formatTelegramTaskStatus(task.issue)}.` +
        (reply.needsInput ? "\n💬 Hãy Reply trực tiếp tin nhắn giao việc để gửi câu trả lời lại cho Agent." : "");

      try {
        await this.client.sendMessage(
          mapping.telegramChatId,
          `${heading}\n\n${reply.content}\n\n${footer}`,
          {
            reply_to_message_id: mapping.telegramMessageId,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[
                { text: `🔍 Chi tiết ${mapping.issueIdentifier}`, callback_data: `view_task:${mapping.issueId}` },
              ]],
            },
          },
        );

        await recordChatTaskMapping({
          ...mapping,
          lastActivityAt: new Date(latestAgentComment.createdAt).toISOString(),
        });
        addTelegramLog("info", `Delivered Agent update for ${mapping.issueIdentifier} to Telegram`, {
          issueId: mapping.issueId,
          commentId: latestAgentComment.id,
          telegramChatId: mapping.telegramChatId,
          needsInput: reply.needsInput,
        });
      } catch (err: any) {
        addTelegramLog("warn", `Could not deliver Agent update for ${mapping.issueIdentifier}`, {
          issueId: mapping.issueId,
          telegramChatId: mapping.telegramChatId,
          error: String(err),
        });
      }
    }
  }

  private async checkAndNotifyProgress(): Promise<void> {
    if (!this.isRunning) return;
    const config = getTelegramConfigSync();
    const hasNotificationTargets =
      config.allowedChatIds.length > 0 || config.allowedUserIds.length > 0 || config.userPairings.length > 0;
    if (!config.notificationsEnabled || !hasNotificationTargets) return;

    if (config.inboundMode !== "notifications_only") {
      await this.checkAndNotifyMappedTaskUpdates();
    }

    const progress = await this.taskManager.getProjectProgress();
    const snapshot = JSON.stringify(progress);
    if (this.lastProgressSnapshot === null) {
      this.lastProgressSnapshot = snapshot;
      return;
    }
    if (snapshot === this.lastProgressSnapshot) return;

    const previous = JSON.parse(this.lastProgressSnapshot) as typeof progress;
    this.lastProgressSnapshot = snapshot;

    // Telegram is a completion inbox in notifications-only mode. Do not
    // send a message for every intermediate agent transition.
    const doneIncreased = progress.doneTasks > previous.doneTasks;
    if (!doneIncreased) return;

    const filledBars = Math.round((progress.percentDone / 100) * 10);
    const bar = "█".repeat(filledBars) + "░".repeat(10 - filledBars);
    const heading = "✅ **CÓ TASK VỪA HOÀN THÀNH**";
    await this.broadcastNotification(
      `${heading}\n\n[${bar}] **${progress.percentDone}%**\n` +
        `• Tổng công việc: **${progress.totalTasks}**\n` +
        `• Hoàn thành: **${progress.doneTasks}**\n` +
        `• Đang thực hiện: **${progress.inProgressTasks}**\n` +
        `• Đang chờ phản hồi/duyệt: **${progress.inReviewTasks}**\n` +
        `• Chờ phê duyệt: **${progress.pendingApprovals}**\n\n` +
        `Chi tiết task và giao việc tiếp theo: mở ATELIER AI trên web.`
    );
  }
}
