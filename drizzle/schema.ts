import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  username: varchar("username", { length: 32 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  bio: text("bio"),
  availability: mysqlEnum("availability", ["available", "busy", "away"]).default("available").notNull(),
  language: mysqlEnum("language", ["ar", "en"]).default("ar").notNull(),
  privacyMode: mysqlEnum("privacyMode", ["everyone", "contacts", "nobody"]).default("everyone").notNull(),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => ({
  usernameUnique: unique("users_username_unique").on(table.username),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const chatRooms = mysqlTable("chatRooms", {
  id: varchar("id", { length: 16 }).primaryKey(),
  name: varchar("name", { length: 80 }).notNull().default("غرفة قريب"),
  ownerId: varchar("ownerId", { length: 96 }),
  pinnedMessageId: varchar("pinnedMessageId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  retentionDays: int("retentionDays").default(0).notNull(),
});

export const deviceProfiles = mysqlTable("deviceProfiles", {
  deviceId: varchar("deviceId", { length: 96 }).primaryKey(),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chatParticipants = mysqlTable("chatParticipants", {
  id: varchar("id", { length: 120 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  name: varchar("name", { length: 40 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
});

export const roomMemberBans = mysqlTable("roomMemberBans", {
  id: varchar("id", { length: 120 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  bannedBy: varchar("bannedBy", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const roomModerators = mysqlTable("roomModerators", {
  id: varchar("id", { length: 120 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  canPin: boolean("canPin").default(false).notNull(),
  canRename: boolean("canRename").default(false).notNull(),
  canManageMembers: boolean("canManageMembers").default(false).notNull(),
  canClearMessages: boolean("canClearMessages").default(false).notNull(),
  canViewActivity: boolean("canViewActivity").default(true).notNull(),
  assignedBy: varchar("assignedBy", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const roomAdminActivity = mysqlTable("roomAdminActivity", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  actorDeviceId: varchar("actorDeviceId", { length: 96 }).notNull(),
  actorName: varchar("actorName", { length: 40 }).notNull(),
  action: mysqlEnum("action", ["moderator_granted", "moderator_updated", "moderator_removed", "moderator_invited", "moderator_invite_approved", "moderator_invite_declined", "moderator_invite_cancelled", "room_renamed", "member_removed", "member_restored", "message_pinned", "message_unpinned", "messages_cleared"]).notNull(),
  targetDeviceId: varchar("targetDeviceId", { length: 96 }),
  targetName: varchar("targetName", { length: 40 }),
  details: varchar("details", { length: 180 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const roomModeratorInvitations = mysqlTable("roomModeratorInvitations", {
  id: varchar("id", { length: 160 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  targetDeviceId: varchar("targetDeviceId", { length: 96 }).notNull(),
  targetName: varchar("targetName", { length: 40 }).notNull(),
  targetColor: varchar("targetColor", { length: 7 }).notNull(),
  invitedBy: varchar("invitedBy", { length: 96 }).notNull(),
  invitedByName: varchar("invitedByName", { length: 40 }).notNull(),
  canPin: boolean("canPin").default(false).notNull(),
  canRename: boolean("canRename").default(false).notNull(),
  canManageMembers: boolean("canManageMembers").default(false).notNull(),
  canClearMessages: boolean("canClearMessages").default(false).notNull(),
  canViewActivity: boolean("canViewActivity").default(true).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "declined", "cancelled"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
  decidedBy: varchar("decidedBy", { length: 96 }),
});
export const roomNotifications = mysqlTable("roomNotifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  targetDeviceId: varchar("targetDeviceId", { length: 96 }).notNull(),
  activityId: varchar("activityId", { length: 64 }).notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  body: varchar("body", { length: 240 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
});
export const chatMessages = mysqlTable("chatMessages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  senderId: varchar("senderId", { length: 96 }).notNull(),
  senderName: varchar("senderName", { length: 40 }).notNull(),
  senderColor: varchar("senderColor", { length: 7 }).notNull(),
  text: text("text").notNull(),
  replyToId: varchar("replyToId", { length: 64 }),
  reactions: text("reactions"),
  editedAt: timestamp("editedAt"),
  editedBy: varchar("editedBy", { length: 96 }),
  deletedAt: timestamp("deletedAt"),
  deletedBy: varchar("deletedBy", { length: 96 }),
  attachmentName: varchar("attachmentName", { length: 120 }),
  attachmentType: varchar("attachmentType", { length: 100 }),
  attachmentUrl: varchar("attachmentUrl", { length: 512 }),
  pinnedAt: timestamp("pinnedAt"),
  pinnedBy: varchar("pinnedBy", { length: 96 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const directConversations = mysqlTable("directConversations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  participantOne: varchar("participantOne", { length: 96 }).notNull(),
  participantOneName: varchar("participantOneName", { length: 40 }).notNull(),
  participantOneColor: varchar("participantOneColor", { length: 7 }).notNull(),
  participantTwo: varchar("participantTwo", { length: 96 }).notNull(),
  participantTwoName: varchar("participantTwoName", { length: 40 }).notNull(),
  participantTwoColor: varchar("participantTwoColor", { length: 7 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const directMessages = mysqlTable("directMessages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  senderId: varchar("senderId", { length: 96 }).notNull(),
  senderName: varchar("senderName", { length: 40 }).notNull(),
  senderColor: varchar("senderColor", { length: 7 }).notNull(),
  text: text("text").notNull(),
  replyToId: varchar("replyToId", { length: 64 }),
  reactions: text("reactions"),
  attachmentName: varchar("attachmentName", { length: 120 }),
  attachmentType: varchar("attachmentType", { length: 100 }),
  attachmentUrl: varchar("attachmentUrl", { length: 512 }),
  editedAt: timestamp("editedAt"),
  editedBy: varchar("editedBy", { length: 96 }),
  deletedAt: timestamp("deletedAt"),
  deletedBy: varchar("deletedBy", { length: 96 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const directConversationPreferences = mysqlTable("directConversationPreferences", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  peerId: varchar("peerId", { length: 96 }).notNull(),
  isMuted: boolean("isMuted").default(false).notNull(),
  isBlocked: boolean("isBlocked").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const directReadStates = mysqlTable("directReadStates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  lastReadAt: timestamp("lastReadAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const directCallLogs = mysqlTable("directCallLogs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  callerId: varchar("callerId", { length: 96 }).notNull(),
  recipientId: varchar("recipientId", { length: 96 }).notNull(),
  callType: mysqlEnum("callType", ["audio", "video"]).notNull(),
  status: mysqlEnum("status", ["ringing", "accepted", "missed", "rejected", "ended", "failed"]).default("ringing").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  answeredAt: timestamp("answeredAt"),
  endedAt: timestamp("endedAt"),
});

export const userDevices = mysqlTable("userDevices", {
  id: varchar("id", { length: 96 }).primaryKey(),
  userId: varchar("userId", { length: 96 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  userAgent: varchar("userAgent", { length: 255 }),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

export const userPreferences = mysqlTable("userPreferences", {
  id: varchar("id", { length: 96 }).primaryKey(),
  userId: varchar("userId", { length: 96 }).notNull(),
  theme: mysqlEnum("theme", ["light", "dark", "system"]).default("system").notNull(),
  readingBackground: mysqlEnum("readingBackground", ["soft", "paper", "night"]).default("soft").notNull(),
  fontScale: int("fontScale").default(100).notNull(),
  compactMode: boolean("compactMode").default(false).notNull(),
  ringtoneEnabled: boolean("ringtoneEnabled").default(true).notNull(),
  notificationsEnabled: boolean("notificationsEnabled").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userUnique: unique("user_preferences_user_unique").on(table.userId),
}));

export const userNotifications = mysqlTable("userNotifications", {
  id: varchar("id", { length: 96 }).primaryKey(),
  recipientId: varchar("recipientId", { length: 96 }).notNull(),
  kind: varchar("kind", { length: 48 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  body: varchar("body", { length: 240 }).notNull(),
  roomId: varchar("roomId", { length: 16 }),
  conversationId: varchar("conversationId", { length: 64 }),
  messageId: varchar("messageId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
});

export const messageReceipts = mysqlTable("messageReceipts", {
  id: varchar("id", { length: 120 }).primaryKey(),
  messageId: varchar("messageId", { length: 64 }).notNull(),
  scopeType: mysqlEnum("scopeType", ["room", "direct"]).notNull(),
  readerId: varchar("readerId", { length: 96 }).notNull(),
  status: mysqlEnum("status", ["sent", "delivered", "read"]).default("delivered").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  messageReaderUnique: unique("message_receipts_reader_unique").on(table.messageId, table.scopeType, table.readerId),
}));

export const messagePins = mysqlTable("messagePins", {
  id: varchar("id", { length: 120 }).primaryKey(),
  scopeType: mysqlEnum("scopeType", ["room", "direct"]).notNull(),
  scopeId: varchar("scopeId", { length: 64 }).notNull(),
  messageId: varchar("messageId", { length: 64 }).notNull(),
  pinnedBy: varchar("pinnedBy", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  messagePinUnique: unique("message_pins_scope_message_unique").on(table.scopeType, table.scopeId, table.messageId),
}));

export const userReports = mysqlTable("userReports", {
  id: varchar("id", { length: 96 }).primaryKey(),
  reporterId: varchar("reporterId", { length: 96 }).notNull(),
  targetUserId: varchar("targetUserId", { length: 96 }).notNull(),
  roomId: varchar("roomId", { length: 16 }),
  conversationId: varchar("conversationId", { length: 64 }),
  messageId: varchar("messageId", { length: 64 }),
  reason: varchar("reason", { length: 64 }).notNull(),
  details: text("details"),
  status: mysqlEnum("status", ["open", "reviewed", "resolved", "dismissed"]).default("open").notNull(),
  reviewedBy: varchar("reviewedBy", { length: 96 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
});

export const moderationActions = mysqlTable("moderationActions", {
  id: varchar("id", { length: 96 }).primaryKey(),
  reportId: varchar("reportId", { length: 96 }),
  actorId: varchar("actorId", { length: 96 }).notNull(),
  targetUserId: varchar("targetUserId", { length: 96 }).notNull(),
  action: mysqlEnum("action", ["warn", "mute", "ban", "unban", "dismiss"]).notNull(),
  scopeType: mysqlEnum("scopeType", ["room", "direct", "global"]).notNull(),
  scopeId: varchar("scopeId", { length: 64 }),
  note: varchar("note", { length: 240 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const abuseEvents = mysqlTable("abuseEvents", {
  id: varchar("id", { length: 96 }).primaryKey(),
  actorId: varchar("actorId", { length: 96 }).notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  subjectKey: varchar("subjectKey", { length: 120 }).notNull(),
  details: varchar("details", { length: 240 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const rateLimitBuckets = mysqlTable("rateLimitBuckets", {
  id: varchar("id", { length: 180 }).primaryKey(),
  subjectKey: varchar("subjectKey", { length: 120 }).notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  windowStartedAt: timestamp("windowStartedAt").notNull(),
  count: int("count").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  bucketUnique: unique("rate_limit_bucket_unique").on(table.subjectKey, table.action, table.windowStartedAt),
}));

export const backupManifests = mysqlTable("backupManifests", {
  id: varchar("id", { length: 96 }).primaryKey(),
  scopeType: mysqlEnum("scopeType", ["room", "global"]).notNull(),
  scopeId: varchar("scopeId", { length: 64 }),
  createdBy: varchar("createdBy", { length: 96 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 512 }).notNull(),
  sizeBytes: int("sizeBytes").default(0).notNull(),
  status: mysqlEnum("status", ["ready", "failed", "restored"]).default("ready").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  restoredAt: timestamp("restoredAt"),
});

export const retentionPolicies = mysqlTable("retentionPolicies", {
  id: varchar("id", { length: 96 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  messageRetentionDays: int("messageRetentionDays").default(0).notNull(),
  fileRetentionDays: int("fileRetentionDays").default(0).notNull(),
  adminActivityRetentionDays: int("adminActivityRetentionDays").default(365).notNull(),
  updatedBy: varchar("updatedBy", { length: 96 }).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  roomUnique: unique("retention_policies_room_unique").on(table.roomId),
}));

export const uploadSessions = mysqlTable("uploadSessions", {
  id: varchar("id", { length: 120 }).primaryKey(),
  ownerId: varchar("ownerId", { length: 96 }).notNull(),
  scopeType: mysqlEnum("scopeType", ["room", "direct", "avatar"]).notNull(),
  scopeId: varchar("scopeId", { length: 64 }).notNull(),
  fileName: varchar("fileName", { length: 120 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  totalBytes: int("totalBytes").default(0).notNull(),
  receivedBytes: int("receivedBytes").default(0).notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  status: mysqlEnum("status", ["pending", "uploading", "complete", "aborted"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export const uploadChunks = mysqlTable("uploadChunks", {
  id: varchar("id", { length: 140 }).primaryKey(),
  sessionId: varchar("sessionId", { length: 120 }).notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  byteLength: int("byteLength").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  sessionChunkUnique: unique("upload_chunks_session_chunk_unique").on(table.sessionId, table.chunkIndex),
}));

export const roomAnalyticsDaily = mysqlTable("roomAnalyticsDaily", {
  id: varchar("id", { length: 96 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  day: varchar("day", { length: 10 }).notNull(),
  activeMembers: int("activeMembers").default(0).notNull(),
  messageCount: int("messageCount").default(0).notNull(),
  fileCount: int("fileCount").default(0).notNull(),
  callCount: int("callCount").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  roomDayUnique: unique("room_analytics_day_unique").on(table.roomId, table.day),
}));
