export interface TelegramUserPairing {
  telegramUserId: number;
  telegramUsername?: string;
  telegramFirstName?: string;
  paperclipUserId: string;
  pairedAt: string;
}

export interface TelegramPairingCode {
  code: string;
  paperclipUserId: string;
  createdAt: number;
  expiresAt: number;
}

export interface TelegramChatTaskMapping {
  telegramChatId: number;
  telegramMessageId?: number;
  telegramThreadId?: number;
  issueId: string;
  issueIdentifier: string;
  taskTitle: string;
  assignedAgentName: string;
  lastActivityAt: string;
}

export interface TelegramLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  details?: Record<string, unknown> | null;
}

export interface TelegramBridgeConfig {
  botToken: string;
  botEnabled: boolean;
  defaultAgentId: string | null;
  notificationsEnabled: boolean;
  notificationLevel: "all" | "mentions_and_tasks" | "approvals_only";
  /** Telegram receives outbound updates only when this mode is enabled. */
  inboundMode?: "interactive" | "notifications_only";
  /** Telegram chats that receive outbound notifications. */
  allowedChatIds: number[];
  allowedUserIds: number[];
  allowedUsernames: string[];
  userPairings: TelegramUserPairing[];
  pairingCodes: TelegramPairingCode[];
  chatTaskMappings: TelegramChatTaskMapping[];
  /** Native project choice scoped to both Telegram chat and company. */
  chatProjectSelections: TelegramChatProjectSelection[];
  lastUpdateId: number;
  stats: {
    incomingMessages: number;
    tasksCreated: number;
    commentsCreated: number;
    approvalsProcessed: number;
    errors: number;
  };
}

export interface TelegramChatProjectSelection {
  telegramChatId: number;
  companyId: string;
  nativeProjectId: string;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

export interface TelegramBridgeStatus {
  status: "stopped" | "polling" | "connected" | "error";
  botEnabled: boolean;
  isConfigured: boolean;
  tokenPreview: string | null;
  botInfo: TelegramBotInfo | null;
  lastPollAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  startedAt: string | null;
  uptimeSeconds: number;
  lastUpdateId: number;
  stats: TelegramBridgeConfig["stats"];
  pairedUserCount: number;
  whitelistedUserCount: number;
  configuredChatIds: number[];
  notificationsEnabled: boolean;
  inboundMode?: "interactive" | "notifications_only";
  defaultAgentId: string | null;
}

// Telegram Raw API types
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  forward_from?: TelegramUser;
  reply_to_message?: TelegramMessage;
  text?: string;
  caption?: string;
  message_thread_id?: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance?: string;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}
