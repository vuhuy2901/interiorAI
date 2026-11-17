import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import type { IssueAssignmentWakeupDeps } from "../services/issue-assignment-wakeup.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import { TelegramProjectContextError } from "../services/atelier-telegram/project-context.js";
import {
  getTelegramPoller,
  getTelegramTaskManager,
  loadTelegramConfig,
  saveTelegramConfig,
  getTelegramConfigSync,
  generatePairingCode,
  unpairTelegramUser,
  getTelegramLogs,
  addTelegramLog,
  TelegramBotClient,
  initTelegramBridge,
} from "../services/atelier-telegram/index.js";

export function atelierTelegramRoutes(db: Db, heartbeat?: IssueAssignmentWakeupDeps): Router {
  const router = Router();

  // Initialize service asynchronously
  initTelegramBridge(db, heartbeat).catch((err) => {
    console.warn("[ATELIER Telegram] init error:", err);
  });

  // GET /status
  router.get("/status", async (_req: Request, res: Response) => {
    await loadTelegramConfig();
    const poller = getTelegramPoller();
    if (!poller) {
      return res.status(503).json({ error: "Telegram bridge not initialized yet" });
    }
    return res.json(poller.getStatus());
  });

  // GET /agents (List agents for settings dropdown)
  router.get("/agents", async (_req: Request, res: Response) => {
    const mgr = getTelegramTaskManager();
    if (!mgr) return res.status(503).json({ error: "Task manager not ready" });
    try {
      const agentsList = await mgr.listAgents();
      return res.json(agentsList);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /test-connection
  router.post("/test-connection", async (req: Request, res: Response) => {
    const config = getTelegramConfigSync();
    const tokenToTest = req.body?.botToken?.trim() || config.botToken;

    if (!tokenToTest) {
      return res.status(400).json({ ok: false, error: "Chưa cấu hình Telegram Bot Token" });
    }

    try {
      const client = new TelegramBotClient(tokenToTest);
      const botInfo = await client.getMe();
      addTelegramLog("info", `Telegram getMe verified successfully: @${botInfo.username}`);
      return res.json({
        ok: true,
        botInfo,
        message: `Kết nối thành công tới Bot @${botInfo.username} (${botInfo.first_name})`,
      });
    } catch (err: any) {
      const errorMsg = String(err.message || err);
      addTelegramLog("error", "Telegram test connection failed", { error: errorMsg });
      return res.status(400).json({
        ok: false,
        error: errorMsg,
      });
    }
  });

  // POST /project-selection
  // Board configuration path: no Telegram impersonation, token change, or poller restart.
  router.post("/project-selection", async (req: Request, res: Response) => {
    assertBoard(req);
    await loadTelegramConfig();
    const mgr = getTelegramTaskManager();
    if (!mgr) return res.status(503).json({ error: "Task manager not ready" });
    const { companyId } = await mgr.getCompanyAndProject();
    assertCompanyAccess(req, companyId);
    const { chatId, nativeProjectId } = req.body ?? {};
    if (!Number.isSafeInteger(chatId) || typeof nativeProjectId !== "string" || !nativeProjectId.trim() || nativeProjectId.length > 200) {
      return res.status(400).json({ error: "Provide an integer chatId and nativeProjectId" });
    }
    if (!getTelegramConfigSync().allowedChatIds.includes(chatId)) {
      return res.status(403).json({ error: "Chat is not in allowedChatIds. Configure the authorized chat before selecting its project." });
    }
    try {
      const context = await mgr.selectProjectForChat(chatId, nativeProjectId.trim());
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId, actorType: actor.actorType, actorId: actor.actorId,
        action: "telegram.project_selected", entityType: "project", entityId: context.nativeProjectId,
        details: { telegramChatId: chatId, sceneId: context.sceneId, sceneRevision: context.revision },
      });
      return res.json({ ok: true, chatId, context });
    } catch (error) {
      if (error instanceof TelegramProjectContextError) return res.status(422).json({ error: error.message });
      throw error;
    }
  });

  // POST /config
  router.post("/config", async (req: Request, res: Response) => {
    try {
      const {
        botToken,
        botEnabled,
        defaultAgentId,
        notificationsEnabled,
        notificationLevel,
        inboundMode,
        allowedChatIds,
        allowedUserIds,
        allowedUsernames,
      } = req.body;

      const updates: any = {};
      if (typeof botToken === "string" && botToken.trim().length > 0 && !botToken.includes("•••")) {
        updates.botToken = botToken.trim();
      }
      if (typeof botEnabled === "boolean") updates.botEnabled = botEnabled;
      if (defaultAgentId !== undefined) updates.defaultAgentId = defaultAgentId;
      if (typeof notificationsEnabled === "boolean") updates.notificationsEnabled = notificationsEnabled;
      if (notificationLevel) updates.notificationLevel = notificationLevel;
      if (inboundMode === "interactive" || inboundMode === "notifications_only") updates.inboundMode = inboundMode;
      if (Array.isArray(allowedChatIds)) {
        updates.allowedChatIds = allowedChatIds.map((id: any) => Number(id)).filter((id: number) => Number.isSafeInteger(id));
      }
      if (Array.isArray(allowedUserIds)) {
        updates.allowedUserIds = allowedUserIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id));
      }
      if (Array.isArray(allowedUsernames)) {
        updates.allowedUsernames = allowedUsernames
          .map((u: any) => String(u).replace("@", "").trim())
          .filter((u: string) => u.length > 0);
      }

      await saveTelegramConfig(updates);
      const poller = getTelegramPoller();
      if (poller) {
        await poller.restart();
      }

      addTelegramLog("info", "Updated Telegram Bridge configuration from Settings UI");
      return res.json({
        ok: true,
        status: poller?.getStatus(),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /toggle
  router.post("/toggle", async (req: Request, res: Response) => {
    const poller = getTelegramPoller();
    if (!poller) return res.status(503).json({ error: "Poller not ready" });

    const enable = req.body?.enable;
    if (enable === true) {
      await saveTelegramConfig({ botEnabled: true });
      await poller.start();
    } else if (enable === false) {
      await saveTelegramConfig({ botEnabled: false });
      await poller.stop();
    } else {
      // Toggle
      const current = getTelegramConfigSync().botEnabled;
      await saveTelegramConfig({ botEnabled: !current });
      if (!current) await poller.start();
      else await poller.stop();
    }

    return res.json({ ok: true, status: poller.getStatus() });
  });

  // POST /restart
  router.post("/restart", async (_req: Request, res: Response) => {
    const poller = getTelegramPoller();
    if (!poller) return res.status(503).json({ error: "Poller not ready" });

    await poller.restart();
    return res.json({ ok: true, status: poller.getStatus() });
  });

  // POST /pairing-code (Generate 6-digit pairing code)
  router.post("/pairing-code", async (req: Request, res: Response) => {
    const userId = req.body?.userId || "local-board";
    const pairing = await generatePairingCode(userId, 15);
    return res.json({
      ok: true,
      pairingCode: pairing.code,
      expiresAt: new Date(pairing.expiresAt).toISOString(),
      expiresInMinutes: 15,
      instruction: `Mở ứng dụng Telegram, tìm Bot và gửi lệnh: /pair ${pairing.code}`,
    });
  });

  // GET /pairings (List paired users)
  router.get("/pairings", async (_req: Request, res: Response) => {
    await loadTelegramConfig();
    const config = getTelegramConfigSync();
    return res.json({
      pairings: config.userPairings,
      allowedChatIds: config.allowedChatIds,
      allowedUserIds: config.allowedUserIds,
      allowedUsernames: config.allowedUsernames,
    });
  });

  // POST /test-chat (Verify Bot Token and send a real message to one Chat ID)
  router.post("/test-chat", async (req: Request, res: Response) => {
    const config = getTelegramConfigSync();
    const tokenToTest = req.body?.botToken?.trim() || config.botToken;
    const chatId = Number(req.body?.chatId ?? config.allowedChatIds[0]);

    if (!tokenToTest) {
      return res.status(400).json({ ok: false, error: "Chưa cấu hình Telegram Bot Token" });
    }
    if (!Number.isSafeInteger(chatId)) {
      return res.status(400).json({ ok: false, error: "Chat ID phải là một số nguyên hợp lệ" });
    }

    try {
      const client = new TelegramBotClient(tokenToTest);
      const botInfo = await client.getMe();
      await client.sendMessage(
        chatId,
        `✅ **ATELIER AI đã kết nối thành công**\n\nBot: @${botInfo.username}\nChat ID: \`${chatId}\`\nBạn có thể gửi \`/help\`, \`/progress\` hoặc nhập yêu cầu giao việc trực tiếp tại đây.`
      );
      addTelegramLog("info", `Sent Telegram connection test to chat ${chatId}`);
      return res.json({ ok: true, chatId, botInfo, message: `Đã gửi tin nhắn thử tới Chat ID ${chatId}` });
    } catch (err: any) {
      const errorMsg = String(err.message || err);
      addTelegramLog("error", `Telegram chat test failed for ${chatId}`, { error: errorMsg });
      return res.status(400).json({ ok: false, error: errorMsg });
    }
  });

  // DELETE /pairings/:userId
  router.delete("/pairings/:userId", async (req: Request, res: Response) => {
    const uid = parseInt(String(req.params.userId), 10);
    if (isNaN(uid)) return res.status(400).json({ error: "Invalid userId" });

    const ok = await unpairTelegramUser(uid);
    return res.json({ ok, unlinkedUserId: uid });
  });

  // GET /logs
  router.get("/logs", async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    return res.json({ logs: getTelegramLogs(limit) });
  });

  // POST /broadcast-test
  router.post("/broadcast-test", async (req: Request, res: Response) => {
    const poller = getTelegramPoller();
    if (!poller) return res.status(503).json({ error: "Poller not ready" });

    const text = req.body?.message || "🔔 **ATELIER AI 2.0**: Tin nhắn kiểm tra kết nối từ bảng điều khiển web thành công!";
    const count = await poller.broadcastNotification(text);

    return res.json({
      ok: true,
      deliveredToChats: count,
      message: `Đã phát thông báo tới ${count} tài khoản Telegram đã ghép nối.`,
    });
  });

  // POST /simulate-message (For verification & automated testing without real network call)
  router.post("/simulate-message", async (req: Request, res: Response) => {
    const { fromUserId, username, text, replyToMessageId, chatId } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const mgr = getTelegramTaskManager();
    if (!mgr) return res.status(503).json({ error: "Manager not ready" });

    try {
      const uid = fromUserId || 999888777;
      const uname = username || "atelier_architect";
      const telegramChatId = chatId ?? uid;

      // 1. Natural language / Command simulation
      const t = text.trim();
      if (t === "/projects") {
        return res.json({ ok: true, type: "projects", projects: await mgr.listProjects() });
      } else if (/^\/project(?:\s|$)/.test(t)) {
        return res.status(400).json({ error: "Use POST /api/atelier/telegram/project-selection with board authorization to configure a chat." });
      } else if (t.startsWith("/agents")) {
        const ag = await mgr.listAgents();
        return res.json({ ok: true, type: "agents", agents: ag });
      } else if (t.startsWith("/tasks")) {
        const tk = await mgr.listActiveTasks(10, telegramChatId);
        return res.json({ ok: true, type: "tasks", tasks: tk });
      } else if (t.startsWith("/approvals")) {
        const ap = await mgr.listPendingApprovals();
        return res.json({ ok: true, type: "approvals", approvals: ap });
      } else if (t.startsWith("/progress")) {
        const pg = await mgr.getProjectProgress(telegramChatId);
        return res.json({ ok: true, type: "progress", progress: pg });
      } else if (replyToMessageId) {
        // Comment simulation
        const taskData = await mgr.getTaskByIdentifierOrId("ATL-1");
        if (taskData) {
          await mgr.addCommentToTask({
            issueId: taskData.issue.id,
            comment: t,
            telegramUserId: uid,
            telegramUsername: uname,
          });
          return res.json({ ok: true, type: "comment_added", issueId: taskData.issue.id });
        }
      }

      // Default: create task
      const matchedAgent = await mgr.findAgentByQuery(t);
      const chief = await mgr.getChiefArchitect();
      const targetAgent = matchedAgent || chief;

      const created = await mgr.createTaskFromTelegram({
        title: t.slice(0, 60),
        description: t,
        targetAgentId: targetAgent?.id,
        telegramUserId: uid,
        telegramChatId,
        telegramUsername: uname,
      });

      return res.json({
        ok: true,
        type: "task_created",
        issueId: created.issueId,
        identifier: created.identifier,
        assignedAgentName: created.assignedAgentName,
        executionStatus: created.executionStatus,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}
