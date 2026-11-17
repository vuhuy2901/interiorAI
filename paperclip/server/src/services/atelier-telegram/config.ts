import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import type {
  TelegramBridgeConfig,
  TelegramLogEntry,
  TelegramPairingCode,
  TelegramUserPairing,
  TelegramChatTaskMapping,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE_PATH = path.resolve(__dirname, "../../../../data/atelier-telegram-config.json");

const MAX_LOGS = 200;
const memoryLogs: TelegramLogEntry[] = [];

const DEFAULT_CONFIG: TelegramBridgeConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || process.env.ATELIER_TELEGRAM_BOT_TOKEN || "",
  botEnabled: true,
  defaultAgentId: null,
  notificationsEnabled: true,
  notificationLevel: "all",
  inboundMode: "notifications_only",
  allowedChatIds: [],
  allowedUserIds: [],
  allowedUsernames: [],
  userPairings: [],
  pairingCodes: [],
  chatTaskMappings: [],
  chatProjectSelections: [],
  lastUpdateId: 0,
  stats: {
    incomingMessages: 0,
    tasksCreated: 0,
    commentsCreated: 0,
    approvalsProcessed: 0,
    errors: 0,
  },
};

let currentConfig: TelegramBridgeConfig = { ...DEFAULT_CONFIG };
let isLoaded = false;
let configWriteQueue: Promise<void> = Promise.resolve();

export function addTelegramLog(level: "info" | "warn" | "error", message: string, details?: Record<string, unknown> | null): void {
  const entry: TelegramLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    message,
    details: details ? JSON.parse(JSON.stringify(details)) : null,
  };
  memoryLogs.unshift(entry);
  if (memoryLogs.length > MAX_LOGS) {
    memoryLogs.pop();
  }
}

export function getTelegramLogs(limit = 50): TelegramLogEntry[] {
  return memoryLogs.slice(0, limit);
}

export async function loadTelegramConfig(): Promise<TelegramBridgeConfig> {
  if (isLoaded) return currentConfig;

  try {
    const raw = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TelegramBridgeConfig>;
    currentConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      stats: {
        ...DEFAULT_CONFIG.stats,
        ...(parsed.stats || {}),
      },
      allowedChatIds: parsed.allowedChatIds || [],
      allowedUserIds: parsed.allowedUserIds || [],
      allowedUsernames: parsed.allowedUsernames || [],
      userPairings: parsed.userPairings || [],
      pairingCodes: parsed.pairingCodes || [],
      chatTaskMappings: parsed.chatTaskMappings || [],
      chatProjectSelections: parsed.chatProjectSelections || [],
    };
    // Also support environment variable fallback if not set in config
    if (!currentConfig.botToken && (process.env.TELEGRAM_BOT_TOKEN || process.env.ATELIER_TELEGRAM_BOT_TOKEN)) {
      currentConfig.botToken = (process.env.TELEGRAM_BOT_TOKEN || process.env.ATELIER_TELEGRAM_BOT_TOKEN) as string;
    }
    isLoaded = true;
    addTelegramLog("info", "Loaded Telegram configuration from disk");
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      addTelegramLog("warn", "Could not parse Telegram config, using defaults", { error: String(err) });
    }
    currentConfig = { ...DEFAULT_CONFIG };
    isLoaded = true;
  }
  return currentConfig;
}

export async function saveTelegramConfig(updates?: Partial<TelegramBridgeConfig>, requirePersistence = false): Promise<TelegramBridgeConfig> {
  const previousConfig = currentConfig;
  if (updates) {
    currentConfig = {
      ...currentConfig,
      ...updates,
      stats: {
        ...currentConfig.stats,
        ...(updates.stats || {}),
      },
    };
  }

  const updatedConfig = currentConfig;
  const snapshot = JSON.stringify(updatedConfig, null, 2);
  // Polling checkpoints and chat commands share this file. Serialize atomic
  // replacements so a concurrent stats save cannot truncate a persisted choice.
  const write = configWriteQueue.then(async () => {
    await fs.mkdir(path.dirname(CONFIG_FILE_PATH), { recursive: true });
    await fs.writeFile(`${CONFIG_FILE_PATH}.tmp`, snapshot, "utf-8");
    await fs.rename(`${CONFIG_FILE_PATH}.tmp`, CONFIG_FILE_PATH);
  });
  configWriteQueue = write.catch(() => {});
  try {
    await write;
  } catch (err: any) {
    addTelegramLog("error", "Failed to save Telegram config to disk", { error: String(err) });
    if (requirePersistence) {
      if (currentConfig === updatedConfig) currentConfig = previousConfig;
      throw new Error("Could not persist Telegram project selection. Check configuration storage and retry /project.");
    }
  }

  return currentConfig;
}

export function getTelegramConfigSync(): TelegramBridgeConfig {
  return currentConfig;
}

export function maskToken(token: string): string | null {
  if (!token || token.trim().length === 0) return null;
  const parts = token.split(":");
  if (parts.length === 2) {
    const prefix = parts[0];
    return `${prefix}:••••••••••••••••••••••`;
  }
  return token.length > 8 ? `${token.slice(0, 4)}••••${token.slice(-4)}` : "••••••••";
}

export async function generatePairingCode(paperclipUserId = "local-board", expiresInMinutes = 15): Promise<TelegramPairingCode> {
  const code = `ATL-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = Date.now();
  const pairingCode: TelegramPairingCode = {
    code,
    paperclipUserId,
    createdAt: now,
    expiresAt: now + expiresInMinutes * 60 * 1000,
  };

  // Clean expired codes and add new one
  currentConfig.pairingCodes = currentConfig.pairingCodes.filter((c) => c.expiresAt > now);
  currentConfig.pairingCodes.push(pairingCode);
  await saveTelegramConfig();

  addTelegramLog("info", `Generated new Telegram pairing code: ${code}`, { paperclipUserId, expiresInMinutes });
  return pairingCode;
}

export async function verifyAndPairUser(
  code: string,
  telegramUser: { id: number; username?: string; first_name?: string }
): Promise<TelegramUserPairing | null> {
  const now = Date.now();
  const cleanCode = code.trim().toUpperCase();

  const foundIndex = currentConfig.pairingCodes.findIndex(
    (c) => c.code.toUpperCase() === cleanCode && c.expiresAt > now
  );

  if (foundIndex === -1) {
    return null;
  }

  const matched = currentConfig.pairingCodes[foundIndex];
  // Remove matched code
  currentConfig.pairingCodes.splice(foundIndex, 1);

  // Check if user already paired
  const existingIndex = currentConfig.userPairings.findIndex((p) => p.telegramUserId === telegramUser.id);
  const newPairing: TelegramUserPairing = {
    telegramUserId: telegramUser.id,
    telegramUsername: telegramUser.username,
    telegramFirstName: telegramUser.first_name,
    paperclipUserId: matched.paperclipUserId,
    pairedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    currentConfig.userPairings[existingIndex] = newPairing;
  } else {
    currentConfig.userPairings.push(newPairing);
  }

  // Also add to allowedUserIds if not already there
  if (!currentConfig.allowedUserIds.includes(telegramUser.id)) {
    currentConfig.allowedUserIds.push(telegramUser.id);
  }

  await saveTelegramConfig();
  addTelegramLog("info", `Successfully paired Telegram user ${telegramUser.id} (@${telegramUser.username || "unknown"})`, {
    paperclipUserId: matched.paperclipUserId,
  });

  return newPairing;
}

export async function unpairTelegramUser(telegramUserId: number): Promise<boolean> {
  const initialLen = currentConfig.userPairings.length;
  currentConfig.userPairings = currentConfig.userPairings.filter((p) => p.telegramUserId !== telegramUserId);
  currentConfig.allowedUserIds = currentConfig.allowedUserIds.filter((id) => id !== telegramUserId);
  await saveTelegramConfig();
  addTelegramLog("info", `Unpaired Telegram user ${telegramUserId}`);
  return currentConfig.userPairings.length < initialLen;
}

export async function recordChatTaskMapping(mapping: TelegramChatTaskMapping): Promise<void> {
  // Update or insert
  const idx = currentConfig.chatTaskMappings.findIndex(
    (m) => m.telegramChatId === mapping.telegramChatId && m.issueId === mapping.issueId
  );
  if (idx >= 0) {
    currentConfig.chatTaskMappings[idx] = mapping;
  } else {
    currentConfig.chatTaskMappings.unshift(mapping);
    if (currentConfig.chatTaskMappings.length > 100) {
      currentConfig.chatTaskMappings.pop();
    }
  }
  await saveTelegramConfig();
}

export function findTaskMappingByMessageOrChat(chatId: number, replyToMessageId?: number): TelegramChatTaskMapping | undefined {
  if (replyToMessageId) {
    const match = currentConfig.chatTaskMappings.find(
      (m) => m.telegramChatId === chatId && m.telegramMessageId === replyToMessageId
    );
    if (match) return match;
  }
  // Otherwise get most recent mapping for this chat
  return currentConfig.chatTaskMappings.find((m) => m.telegramChatId === chatId);
}
