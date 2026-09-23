import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  abuseEvents,
  backupManifests,
  chatMessages,
  chatParticipants,
  chatRooms,
  directConversations,
  directMessages,
  messagePins,
  messageReceipts,
  moderationActions,
  rateLimitBuckets,
  retentionPolicies,
  roomAdminActivity,
  roomMemberBans,
  roomModeratorInvitations,
  roomModerators,
  roomNotifications,
  roomAnalyticsDaily,
  uploadChunks,
  uploadSessions,
  userDevices,
  userNotifications,
  userPreferences,
  userReports,
  users,
} from "../drizzle/schema";
import { getDb } from "./mysqlDb";
import { storageGetSignedUrl, storagePut } from "./storage";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة حاليًا.");
  return db;
}

function hashId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 56)}`;
}

async function assertRoomMember(roomId: string, deviceId: string) {
  const db = await dbOrThrow();
  const rows = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, roomId),
    eq(chatParticipants.deviceId, deviceId),
  )).limit(1);
  if (!rows[0]) throw new Error("يجب الانضمام إلى الغرفة أولًا.");
  return db;
}

async function assertRoomCapability(roomId: string, actorId: string, capability: keyof typeof roomModerators.$inferSelect) {
  const db = await dbOrThrow();
  const rooms = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, roomId)).limit(1);
  if (rooms[0]?.ownerId === actorId) return db;
  const moderators = await db.select().from(roomModerators).where(and(
    eq(roomModerators.roomId, roomId),
    eq(roomModerators.deviceId, actorId),
  )).limit(1);
  const moderator = moderators[0];
  if (!moderator || capability !== "canViewActivity" && !moderator[capability]) {
    throw new Error("لا تملك الصلاحية اللازمة لهذا الإجراء.");
  }
  return db;
}

async function assertDirectMember(conversationId: string, deviceId: string) {
  const db = await dbOrThrow();
  const rows = await db.select().from(directConversations).where(and(
    eq(directConversations.id, conversationId),
    or(eq(directConversations.participantOne, deviceId), eq(directConversations.participantTwo, deviceId)),
  )).limit(1);
  if (!rows[0]) throw new Error("لا تملك صلاحية الوصول إلى هذه المحادثة الخاصة.");
  return db;
}

export async function ensureUserDevice(input: { userId: string; deviceId: string; label: string; userAgent?: string | null }) {
  const db = await dbOrThrow();
  const now = new Date();
  await db.insert(userDevices).values({
    id: input.deviceId,
    userId: input.userId,
    label: input.label.trim().slice(0, 120) || "Qareeb device",
    userAgent: input.userAgent?.slice(0, 255) ?? null,
    lastSeenAt: now,
    revokedAt: null,
  }).onDuplicateKeyUpdate({ set: { userId: input.userId, label: input.label.trim().slice(0, 120) || "Qareeb device", userAgent: input.userAgent?.slice(0, 255) ?? null, lastSeenAt: now, revokedAt: null } });
  return { deviceId: input.deviceId, lastSeenAt: now };
}

export async function isDeviceRevoked(input: { userId: string; deviceId: string }) {
  const db = await dbOrThrow();
  const rows = await db.select({ revokedAt: userDevices.revokedAt }).from(userDevices).where(and(eq(userDevices.userId, input.userId), eq(userDevices.id, input.deviceId))).limit(1);
  return rows[0]?.revokedAt != null;
}

export async function listUserDevices(userId: string) {
  const db = await dbOrThrow();
  return db.select().from(userDevices).where(eq(userDevices.userId, userId)).orderBy(desc(userDevices.lastSeenAt));
}

export async function revokeUserDevice(input: { userId: string; deviceId: string }) {
  const db = await dbOrThrow();
  await db.update(userDevices).set({ revokedAt: new Date() }).where(and(eq(userDevices.userId, input.userId), eq(userDevices.id, input.deviceId)));
  return { success: true } as const;
}

export async function revokeAllUserDevices(input: { userId: string; exceptDeviceId?: string | null }) {
  const db = await dbOrThrow();
  const predicates = [eq(userDevices.userId, input.userId)];
  if (input.exceptDeviceId) predicates.push(ne(userDevices.id, input.exceptDeviceId));
  await db.update(userDevices).set({ revokedAt: new Date() }).where(and(...predicates));
  return { success: true } as const;
}

export async function getUserPreferences(userId: string) {
  const db = await dbOrThrow();
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return rows[0] ?? { userId, theme: "system", readingBackground: "soft", fontScale: 100, compactMode: false, ringtoneEnabled: true, notificationsEnabled: true };
}

export async function updateUserPreferences(input: {
  userId: string;
  theme: "light" | "dark" | "system";
  readingBackground: "soft" | "paper" | "night";
  fontScale: number;
  compactMode: boolean;
  ringtoneEnabled: boolean;
  notificationsEnabled: boolean;
}) {
  const db = await dbOrThrow();
  const id = hashId("preferences", input.userId);
  await db.insert(userPreferences).values({ id, ...input, fontScale: Math.max(85, Math.min(125, Math.round(input.fontScale))) }).onDuplicateKeyUpdate({
    set: { theme: input.theme, readingBackground: input.readingBackground, fontScale: Math.max(85, Math.min(125, Math.round(input.fontScale))), compactMode: input.compactMode, ringtoneEnabled: input.ringtoneEnabled, notificationsEnabled: input.notificationsEnabled, updatedAt: new Date() },
  });
  return getUserPreferences(input.userId);
}

export async function editRoomMessage(input: { roomId: string; messageId: string; senderId: string; text: string }) {
  const db = await assertRoomMember(input.roomId, input.senderId);
  const rows = await db.select({ senderId: chatMessages.senderId }).from(chatMessages).where(and(eq(chatMessages.id, input.messageId), eq(chatMessages.roomId, input.roomId))).limit(1);
  if (!rows[0]) throw new Error("الرسالة غير موجودة.");
  if (rows[0].senderId !== input.senderId) throw new Error("يمكنك تعديل رسائلك فقط.");
  const text = input.text.trim();
  if (!text) throw new Error("لا يمكن أن تكون الرسالة فارغة.");
  await db.update(chatMessages).set({ text, editedAt: new Date(), editedBy: input.senderId, deletedAt: null, deletedBy: null }).where(eq(chatMessages.id, input.messageId));
  return { success: true, messageId: input.messageId, text } as const;
}

export async function deleteRoomMessage(input: { roomId: string; messageId: string; actorId: string }) {
  const db = await assertRoomMember(input.roomId, input.actorId);
  const rows = await db.select({ senderId: chatMessages.senderId }).from(chatMessages).where(and(eq(chatMessages.id, input.messageId), eq(chatMessages.roomId, input.roomId))).limit(1);
  if (!rows[0]) throw new Error("الرسالة غير موجودة.");
  if (rows[0].senderId !== input.actorId) await assertRoomCapability(input.roomId, input.actorId, "canClearMessages");
  await db.update(chatMessages).set({ text: "", deletedAt: new Date(), deletedBy: input.actorId, editedAt: null, editedBy: null }).where(eq(chatMessages.id, input.messageId));
  return { success: true, messageId: input.messageId } as const;
}

export async function editDirectMessage(input: { conversationId: string; messageId: string; senderId: string; text: string }) {
  const db = await assertDirectMember(input.conversationId, input.senderId);
  const rows = await db.select({ senderId: directMessages.senderId }).from(directMessages).where(and(eq(directMessages.id, input.messageId), eq(directMessages.conversationId, input.conversationId))).limit(1);
  if (!rows[0]) throw new Error("الرسالة غير موجودة.");
  if (rows[0].senderId !== input.senderId) throw new Error("يمكنك تعديل رسائلك فقط.");
  const text = input.text.trim();
  if (!text) throw new Error("لا يمكن أن تكون الرسالة فارغة.");
  await db.update(directMessages).set({ text, editedAt: new Date(), editedBy: input.senderId, deletedAt: null, deletedBy: null }).where(eq(directMessages.id, input.messageId));
  return { success: true, messageId: input.messageId, text } as const;
}

export async function deleteDirectMessage(input: { conversationId: string; messageId: string; actorId: string }) {
  const db = await assertDirectMember(input.conversationId, input.actorId);
  const rows = await db.select({ senderId: directMessages.senderId }).from(directMessages).where(and(eq(directMessages.id, input.messageId), eq(directMessages.conversationId, input.conversationId))).limit(1);
  if (!rows[0]) throw new Error("الرسالة غير موجودة.");
  if (rows[0].senderId !== input.actorId) throw new Error("يمكنك حذف رسائلك فقط.");
  await db.update(directMessages).set({ text: "", deletedAt: new Date(), deletedBy: input.actorId, editedAt: null, editedBy: null }).where(eq(directMessages.id, input.messageId));
  return { success: true, messageId: input.messageId } as const;
}

export async function toggleRoomMessagePin(input: { roomId: string; messageId: string; actorId: string }) {
  const db = await assertRoomCapability(input.roomId, input.actorId, "canPin");
  const exists = await db.select({ id: messagePins.id }).from(messagePins).where(and(eq(messagePins.scopeType, "room"), eq(messagePins.scopeId, input.roomId), eq(messagePins.messageId, input.messageId))).limit(1);
  if (exists[0]) await db.delete(messagePins).where(eq(messagePins.id, exists[0].id));
  else await db.insert(messagePins).values({ id: hashId("pin", `room:${input.roomId}:${input.messageId}`), scopeType: "room", scopeId: input.roomId, messageId: input.messageId, pinnedBy: input.actorId });
  return listMessagePins({ scopeType: "room", scopeId: input.roomId, actorId: input.actorId });
}

export async function toggleDirectMessagePin(input: { conversationId: string; messageId: string; actorId: string }) {
  const db = await assertDirectMember(input.conversationId, input.actorId);
  const exists = await db.select({ id: messagePins.id }).from(messagePins).where(and(eq(messagePins.scopeType, "direct"), eq(messagePins.scopeId, input.conversationId), eq(messagePins.messageId, input.messageId))).limit(1);
  if (exists[0]) await db.delete(messagePins).where(eq(messagePins.id, exists[0].id));
  else await db.insert(messagePins).values({ id: hashId("pin", `direct:${input.conversationId}:${input.messageId}`), scopeType: "direct", scopeId: input.conversationId, messageId: input.messageId, pinnedBy: input.actorId });
  return listMessagePins({ scopeType: "direct", scopeId: input.conversationId, actorId: input.actorId });
}

export async function listMessagePins(input: { scopeType: "room" | "direct"; scopeId: string; actorId: string }) {
  if (input.scopeType === "room") await assertRoomMember(input.scopeId, input.actorId); else await assertDirectMember(input.scopeId, input.actorId);
  const db = await dbOrThrow();
  return db.select().from(messagePins).where(and(eq(messagePins.scopeType, input.scopeType), eq(messagePins.scopeId, input.scopeId))).orderBy(desc(messagePins.createdAt));
}

export async function markMessageReceipt(input: { scopeType: "room" | "direct"; scopeId: string; messageId: string; readerId: string; status: "sent" | "delivered" | "read" }) {
  if (input.scopeType === "room") await assertRoomMember(input.scopeId, input.readerId); else await assertDirectMember(input.scopeId, input.readerId);
  const db = await dbOrThrow();
  const id = hashId("receipt", `${input.scopeType}:${input.scopeId}:${input.messageId}:${input.readerId}`);
  await db.insert(messageReceipts).values({ id, messageId: input.messageId, scopeType: input.scopeType, readerId: input.readerId, status: input.status }).onDuplicateKeyUpdate({ set: { status: input.status, updatedAt: new Date() } });
  return { success: true } as const;
}

export async function listMessageReceipts(input: { scopeType: "room" | "direct"; scopeId: string; messageId: string; readerId: string }) {
  if (input.scopeType === "room") await assertRoomMember(input.scopeId, input.readerId); else await assertDirectMember(input.scopeId, input.readerId);
  const db = await dbOrThrow();
  return db.select().from(messageReceipts).where(and(eq(messageReceipts.scopeType, input.scopeType), eq(messageReceipts.messageId, input.messageId)));
}

export async function createUserNotification(input: { recipientId: string; kind: string; title: string; body: string; roomId?: string | null; conversationId?: string | null; messageId?: string | null }) {
  const db = await dbOrThrow();
  const id = `notification_${randomUUID()}`;
  await db.insert(userNotifications).values({ id, recipientId: input.recipientId, kind: input.kind.slice(0, 48), title: input.title.slice(0, 120), body: input.body.slice(0, 240), roomId: input.roomId ?? null, conversationId: input.conversationId ?? null, messageId: input.messageId ?? null });
  return { id };
}

export async function notifyMentionedUsers(input: { actorId: string; text: string; roomId?: string | null; conversationId?: string | null; messageId?: string | null }) {
  const usernames = Array.from(new Set(Array.from(input.text.matchAll(/@([a-zA-Z0-9_]{3,32})/g), match => match[1])));
  if (!usernames.length) return { notified: 0 };
  const db = await dbOrThrow();
  const targets = await db.select({ openId: users.openId, username: users.username }).from(users).where(inArray(users.username, usernames));
  for (const target of targets) {
    if (target.openId === input.actorId) continue;
    await createUserNotification({ recipientId: target.openId, kind: "mention", title: "تم ذكرك في رسالة", body: "قام أحد المستخدمين بذكرك في محادثة.", roomId: input.roomId, conversationId: input.conversationId, messageId: input.messageId });
  }
  return { notified: targets.filter(target => target.openId !== input.actorId).length };
}

export async function listUserNotifications(input: { recipientId: string; unreadOnly?: boolean }) {
  const db = await dbOrThrow();
  const where = input.unreadOnly ? and(eq(userNotifications.recipientId, input.recipientId), isNull(userNotifications.readAt)) : eq(userNotifications.recipientId, input.recipientId);
  return db.select().from(userNotifications).where(where).orderBy(desc(userNotifications.createdAt)).limit(100);
}

export async function markUserNotificationRead(input: { recipientId: string; notificationId?: string }) {
  const db = await dbOrThrow();
  const where = input.notificationId ? and(eq(userNotifications.recipientId, input.recipientId), eq(userNotifications.id, input.notificationId)) : eq(userNotifications.recipientId, input.recipientId);
  await db.update(userNotifications).set({ readAt: new Date() }).where(where);
  return { success: true } as const;
}

export async function createUserReport(input: { reporterId: string; targetUserId: string; reason: string; details?: string | null; roomId?: string | null; conversationId?: string | null; messageId?: string | null }) {
  if (input.reporterId === input.targetUserId) throw new Error("لا يمكنك الإبلاغ عن نفسك.");
  const db = await dbOrThrow();
  const id = `report_${randomUUID()}`;
  await db.insert(userReports).values({ id, reporterId: input.reporterId, targetUserId: input.targetUserId, reason: input.reason.slice(0, 64), details: input.details?.slice(0, 2000) ?? null, roomId: input.roomId ?? null, conversationId: input.conversationId ?? null, messageId: input.messageId ?? null });
  return { id, status: "open" as const };
}

export async function listUserReports(input: { status?: "open" | "reviewed" | "resolved" | "dismissed" }) {
  const db = await dbOrThrow();
  return db.select().from(userReports).where(input.status ? eq(userReports.status, input.status) : undefined).orderBy(desc(userReports.createdAt)).limit(200);
}

export async function resolveUserReport(input: { reportId: string; reviewerId: string; status: "reviewed" | "resolved" | "dismissed"; action?: "warn" | "mute" | "ban" | "unban" | "dismiss"; note?: string | null }) {
  const db = await dbOrThrow();
  const reports = await db.select().from(userReports).where(eq(userReports.id, input.reportId)).limit(1);
  const report = reports[0];
  if (!report) throw new Error("بلاغ المستخدم غير موجود.");
  await db.update(userReports).set({ status: input.status, reviewedBy: input.reviewerId, reviewedAt: new Date() }).where(eq(userReports.id, input.reportId));
  if (input.action === "ban" && report.roomId) {
    await db.insert(roomMemberBans).values({ id: hashId("ban", `${report.roomId}:${report.targetUserId}`), roomId: report.roomId, deviceId: report.targetUserId, bannedBy: input.reviewerId }).onDuplicateKeyUpdate({ set: { bannedBy: input.reviewerId, createdAt: new Date() } });
  }
  if (input.action === "unban" && report.roomId) {
    await db.delete(roomMemberBans).where(and(eq(roomMemberBans.roomId, report.roomId), eq(roomMemberBans.deviceId, report.targetUserId)));
  }
  if (input.action) await db.insert(moderationActions).values({ id: `moderation_${randomUUID()}`, reportId: input.reportId, actorId: input.reviewerId, targetUserId: report.targetUserId, action: input.action, scopeType: report.roomId ? "room" : report.conversationId ? "direct" : "global", scopeId: report.roomId ?? report.conversationId ?? null, note: input.note?.slice(0, 240) ?? null });
  return { success: true } as const;
}

export async function consumeRateLimit(input: { subjectKey: string; action: string; limit: number; windowMs: number }) {
  const db = await dbOrThrow();
  const windowStartedAt = new Date(Math.floor(Date.now() / input.windowMs) * input.windowMs);
  const id = hashId("rate", `${input.subjectKey}:${input.action}:${windowStartedAt.toISOString()}`);
  await db.insert(rateLimitBuckets).values({ id, subjectKey: input.subjectKey.slice(0, 120), action: input.action.slice(0, 48), windowStartedAt, count: 1 }).onDuplicateKeyUpdate({ set: { count: sql`${rateLimitBuckets.count} + 1`, updatedAt: new Date() } });
  const rows = await db.select({ count: rateLimitBuckets.count }).from(rateLimitBuckets).where(eq(rateLimitBuckets.id, id)).limit(1);
  const current = Number(rows[0]?.count ?? 0);
  if (current > input.limit) {
    const actorId = input.subjectKey.split(":")[0]?.slice(0, 96) || input.subjectKey.slice(0, 96);
    await db.insert(abuseEvents).values({ id: hashId("abuse", `${input.subjectKey}:${input.action}:${Date.now()}`), actorId, action: `rate_limit_${input.action}`.slice(0, 48), subjectKey: input.subjectKey.slice(0, 120), details: `limit=${input.limit}` });
    throw new Error("تم الوصول إلى حد الاستخدام المؤقت. حاول مرة أخرى بعد قليل.");
  }
  return { allowed: true, remaining: Math.max(0, input.limit - current), resetAt: new Date(windowStartedAt.getTime() + input.windowMs) };
}

export async function getRetentionPolicy(roomId: string) {
  const db = await dbOrThrow();
  const rows = await db.select().from(retentionPolicies).where(eq(retentionPolicies.roomId, roomId)).limit(1);
  return rows[0] ?? { roomId, messageRetentionDays: 0, fileRetentionDays: 0, adminActivityRetentionDays: 365, scheduleCronTaskUid: null };
}

export async function saveRetentionPolicy(input: { roomId: string; updatedBy: string; messageRetentionDays: number; fileRetentionDays: number; adminActivityRetentionDays: number; scheduleCronTaskUid?: string | null }) {
  await assertRoomCapability(input.roomId, input.updatedBy, "canManageMembers");
  const db = await dbOrThrow();
  const id = hashId("retention", input.roomId);
  const values = { id, roomId: input.roomId, updatedBy: input.updatedBy, messageRetentionDays: Math.max(0, Math.min(3650, Math.round(input.messageRetentionDays))), fileRetentionDays: Math.max(0, Math.min(3650, Math.round(input.fileRetentionDays))), adminActivityRetentionDays: Math.max(30, Math.min(3650, Math.round(input.adminActivityRetentionDays))), scheduleCronTaskUid: input.scheduleCronTaskUid ?? null };
  await db.insert(retentionPolicies).values(values).onDuplicateKeyUpdate({ set: { ...values, updatedAt: new Date() } });
  return getRetentionPolicy(input.roomId);
}

export async function runRetentionCleanup(input: { roomId?: string | null; scheduleCronTaskUid?: string | null }) {
  const db = await dbOrThrow();
  const where = input.scheduleCronTaskUid ? eq(retentionPolicies.scheduleCronTaskUid, input.scheduleCronTaskUid) : input.roomId ? eq(retentionPolicies.roomId, input.roomId) : undefined;
  const policies = await db.select().from(retentionPolicies).where(where);
  let messagesDeleted = 0;
  let activityDeleted = 0;
  for (const policy of policies) {
    if (policy.messageRetentionDays > 0) {
      const cutoff = new Date(Date.now() - policy.messageRetentionDays * 86_400_000);
      const result = await db.delete(chatMessages).where(and(eq(chatMessages.roomId, policy.roomId), lt(chatMessages.createdAt, cutoff)));
      messagesDeleted += Number(result[0]?.affectedRows ?? 0);
    }
    if (policy.adminActivityRetentionDays > 0) {
      const cutoff = new Date(Date.now() - policy.adminActivityRetentionDays * 86_400_000);
      const result = await db.delete(roomAdminActivity).where(and(eq(roomAdminActivity.roomId, policy.roomId), lt(roomAdminActivity.createdAt, cutoff)));
      activityDeleted += Number(result[0]?.affectedRows ?? 0);
    }
  }
  return { messagesDeleted, activityDeleted };
}

export async function getGlobalAnalytics() {
  const db = await dbOrThrow();
  const [rooms, members, messages, direct, files, reports] = await Promise.all([
    db.select({ total: count() }).from(chatRooms),
    db.select({ total: count() }).from(users),
    db.select({ total: count() }).from(chatMessages),
    db.select({ total: count() }).from(directMessages),
    db.select({ total: count() }).from(chatMessages).where(isNotNull(chatMessages.attachmentUrl)),
    db.select({ total: count() }).from(userReports).where(eq(userReports.status, "open")),
  ]);
  return { roomCount: Number(rooms[0]?.total ?? 0), userCount: Number(members[0]?.total ?? 0), messageCount: Number(messages[0]?.total ?? 0) + Number(direct[0]?.total ?? 0), fileCount: Number(files[0]?.total ?? 0), openReportCount: Number(reports[0]?.total ?? 0) };
}

export async function getRoomAnalytics(roomId: string, actorId: string) {
  await assertRoomCapability(roomId, actorId, "canViewActivity");
  const db = await dbOrThrow();
  const [members, messages, files, calls, daily] = await Promise.all([
    db.select({ total: count() }).from(chatParticipants).where(and(eq(chatParticipants.roomId, roomId), gte(chatParticipants.lastSeen, new Date(Date.now() - 86_400_000)))),
    db.select({ total: count() }).from(chatMessages).where(eq(chatMessages.roomId, roomId)),
    db.select({ total: count() }).from(chatMessages).where(and(eq(chatMessages.roomId, roomId), isNotNull(chatMessages.attachmentUrl))),
    db.select({ total: count() }).from(roomNotifications).where(eq(roomNotifications.roomId, roomId)),
    db.select().from(roomAnalyticsDaily).where(eq(roomAnalyticsDaily.roomId, roomId)).orderBy(desc(roomAnalyticsDaily.day)).limit(30),
  ]);
  return { activeMembers: Number(members[0]?.total ?? 0), messageCount: Number(messages[0]?.total ?? 0), fileCount: Number(files[0]?.total ?? 0), activityCount: Number(calls[0]?.total ?? 0), daily };
}

export async function rejectRecentDuplicateMessage(input: { scopeType: "room" | "direct"; scopeId: string; actorId: string; text: string }) {
  const normalized = input.text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (normalized.length < 8) return { allowed: true } as const;
  const db = input.scopeType === "room" ? await assertRoomMember(input.scopeId, input.actorId) : await assertDirectMember(input.scopeId, input.actorId);
  const since = new Date(Date.now() - 30_000);
  const rows = input.scopeType === "room"
    ? await db.select({ id: chatMessages.id, text: chatMessages.text }).from(chatMessages).where(and(eq(chatMessages.roomId, input.scopeId), eq(chatMessages.senderId, input.actorId), gt(chatMessages.createdAt, since))).limit(8)
    : await db.select({ id: directMessages.id, text: directMessages.text }).from(directMessages).where(and(eq(directMessages.conversationId, input.scopeId), eq(directMessages.senderId, input.actorId), gt(directMessages.createdAt, since))).limit(8);
  if (!rows.some(row => row.text.trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalized)) return { allowed: true } as const;
  await db.insert(abuseEvents).values({ id: `abuse_${randomUUID()}`, actorId: input.actorId, action: "spam_duplicate_message", subjectKey: `${input.scopeType}:${input.scopeId}`, details: "duplicate message within 30 seconds" });
  throw new Error("تم رفض الرسالة المكررة لحماية المحادثة من الإغراق.");
}

export async function createUploadSession(input: { ownerId: string; scopeType: "room" | "direct" | "avatar"; scopeId: string; fileName: string; mimeType: string; totalBytes: number }) {
  const db = await dbOrThrow();
  const id = `upload_${randomUUID()}`;
  await db.insert(uploadSessions).values({ id, ownerId: input.ownerId, scopeType: input.scopeType, scopeId: input.scopeId, fileName: input.fileName.slice(0, 120), mimeType: input.mimeType.slice(0, 100), totalBytes: Math.max(0, input.totalBytes), receivedBytes: 0, status: "pending" });
  return db.select().from(uploadSessions).where(eq(uploadSessions.id, id)).limit(1);
}

export async function updateUploadSession(input: { id: string; ownerId: string; receivedBytes: number; storageKey?: string | null; status: "uploading" | "complete" | "aborted" }) {
  const db = await dbOrThrow();
  const rows = await db.select().from(uploadSessions).where(and(eq(uploadSessions.id, input.id), eq(uploadSessions.ownerId, input.ownerId))).limit(1);
  if (!rows[0]) throw new Error("جلسة الرفع غير موجودة.");
  await db.update(uploadSessions).set({ receivedBytes: Math.max(0, input.receivedBytes), storageKey: input.storageKey ?? rows[0].storageKey, status: input.status, completedAt: input.status === "complete" ? new Date() : null, updatedAt: new Date() }).where(eq(uploadSessions.id, input.id));
  return db.select().from(uploadSessions).where(eq(uploadSessions.id, input.id)).limit(1);
}

export async function appendUploadChunk(input: { id: string; ownerId: string; chunkIndex: number; dataUrl: string }) {
  const db = await dbOrThrow();
  const sessions = await db.select().from(uploadSessions).where(and(eq(uploadSessions.id, input.id), eq(uploadSessions.ownerId, input.ownerId))).limit(1);
  const session = sessions[0];
  if (!session || session.status === "aborted" || session.status === "complete") throw new Error("جلسة الرفع غير متاحة للاستكمال.");
  if (!Number.isInteger(input.chunkIndex) || input.chunkIndex < 0) throw new Error("رقم الجزء غير صالح.");
  const existing = await db.select().from(uploadChunks).where(and(eq(uploadChunks.sessionId, input.id), eq(uploadChunks.chunkIndex, input.chunkIndex))).limit(1);
  if (existing[0]) return { session, chunk: existing[0], resumed: true };
  const match = /^data:[^;]+;base64,(.+)$/.exec(input.dataUrl);
  if (!match) throw new Error("بيانات الجزء غير صالحة.");
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.length || bytes.length > 1_500_000) throw new Error("حجم الجزء غير صالح.");
  const stored = await storagePut(`qareeb/uploads/${input.id}/${input.chunkIndex}.part`, bytes, session.mimeType || "application/octet-stream");
  const chunk = { id: `upload_chunk_${randomUUID()}`, sessionId: input.id, chunkIndex: input.chunkIndex, byteLength: bytes.length, storageKey: stored.key };
  await db.insert(uploadChunks).values(chunk);
  const all = await db.select({ byteLength: uploadChunks.byteLength }).from(uploadChunks).where(eq(uploadChunks.sessionId, input.id));
  const receivedBytes = all.reduce((sum, row) => sum + row.byteLength, 0);
  await db.update(uploadSessions).set({ receivedBytes, status: "uploading", updatedAt: new Date() }).where(eq(uploadSessions.id, input.id));
  const updated = await db.select().from(uploadSessions).where(eq(uploadSessions.id, input.id)).limit(1);
  return { session: updated[0], chunk, resumed: false };
}

export async function finalizeUploadSession(input: { id: string; ownerId: string }) {
  const db = await dbOrThrow();
  const sessions = await db.select().from(uploadSessions).where(and(eq(uploadSessions.id, input.id), eq(uploadSessions.ownerId, input.ownerId))).limit(1);
  const session = sessions[0];
  if (!session) throw new Error("جلسة الرفع غير موجودة.");
  if (session.status === "complete" && session.storageKey) return session;
  const chunks = await db.select().from(uploadChunks).where(eq(uploadChunks.sessionId, input.id)).orderBy(uploadChunks.chunkIndex);
  const expected = chunks.length ? chunks[chunks.length - 1].chunkIndex + 1 : 0;
  if (!chunks.length || chunks.length !== expected || chunks.some((chunk, index) => chunk.chunkIndex !== index)) throw new Error("لم تكتمل كل أجزاء الرفع بعد.");
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (total !== session.totalBytes) throw new Error("حجم الملف لا يطابق الأجزاء المستلمة.");
  const parts: Buffer[] = [];
  for (const chunk of chunks) {
    const signedUrl = await storageGetSignedUrl(chunk.storageKey);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error("تعذر قراءة جزء مرفوع.");
    parts.push(Buffer.from(await response.arrayBuffer()));
  }
  const stored = await storagePut(`qareeb/${session.scopeType}/${session.scopeId}/${session.fileName}`, Buffer.concat(parts), session.mimeType || "application/octet-stream");
  await db.update(uploadSessions).set({ receivedBytes: total, storageKey: stored.key, status: "complete", completedAt: new Date(), updatedAt: new Date() }).where(eq(uploadSessions.id, input.id));
  const updated = await db.select().from(uploadSessions).where(eq(uploadSessions.id, input.id)).limit(1);
  return updated[0];
}

export async function recordBackupManifest(input: { scopeType: "room" | "global"; scopeId?: string | null; createdBy: string; storageKey: string; storageUrl: string; sizeBytes: number; expiresAt?: Date | null }) {
  const db = await dbOrThrow();
  const id = `backup_${randomUUID()}`;
  await db.insert(backupManifests).values({ id, scopeType: input.scopeType, scopeId: input.scopeId ?? null, createdBy: input.createdBy, storageKey: input.storageKey, storageUrl: input.storageUrl, sizeBytes: Math.max(0, input.sizeBytes), expiresAt: input.expiresAt ?? null });
  return db.select().from(backupManifests).where(eq(backupManifests.id, id)).limit(1);
}

export async function listBackupManifests(input: { createdBy: string; scopeId?: string | null }) {
  const db = await dbOrThrow();
  const where = input.scopeId ? and(eq(backupManifests.createdBy, input.createdBy), eq(backupManifests.scopeId, input.scopeId)) : eq(backupManifests.createdBy, input.createdBy);
  return db.select().from(backupManifests).where(where).orderBy(desc(backupManifests.createdAt)).limit(100);
}

export async function getRoomBackupData(roomId: string, actorId: string) {
  await assertRoomCapability(roomId, actorId, "canViewActivity");
  const db = await dbOrThrow();
  const [room, participants, messages, bans, moderators, invitations, activity, notifications] = await Promise.all([
    db.select().from(chatRooms).where(eq(chatRooms.id, roomId)).limit(1),
    db.select().from(chatParticipants).where(eq(chatParticipants.roomId, roomId)),
    db.select().from(chatMessages).where(eq(chatMessages.roomId, roomId)),
    db.select().from(roomMemberBans).where(eq(roomMemberBans.roomId, roomId)),
    db.select().from(roomModerators).where(eq(roomModerators.roomId, roomId)),
    db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.roomId, roomId)),
    db.select().from(roomAdminActivity).where(eq(roomAdminActivity.roomId, roomId)),
    db.select().from(roomNotifications).where(eq(roomNotifications.roomId, roomId)),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), room: room[0] ?? null, participants, messages, bans, moderators, invitations, activity, notifications };
}

function backupDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function restoreRoomBackup(input: { roomId: string; actorId: string; payload: unknown }) {
  const db = await assertRoomCapability(input.roomId, input.actorId, "canManageMembers");
  if (!input.payload || typeof input.payload !== "object") throw new Error("ملف النسخة الاحتياطية غير صالح.");
  const data = input.payload as { room?: Record<string, unknown> | null; participants?: unknown[]; messages?: unknown[]; bans?: unknown[]; moderators?: unknown[]; invitations?: unknown[]; activity?: unknown[]; notifications?: unknown[] };
  const room = data.room;
  if (!room || String(room.id) !== input.roomId) throw new Error("النسخة الاحتياطية لا تخص هذه الغرفة.");
  await db.insert(chatRooms).values({ id: input.roomId, name: String(room.name ?? "غرفة قريب").slice(0, 80), ownerId: room.ownerId ? String(room.ownerId) : null, pinnedMessageId: room.pinnedMessageId ? String(room.pinnedMessageId) : null, retentionDays: Number(room.retentionDays ?? 0), createdAt: backupDate(room.createdAt), updatedAt: new Date() }).onDuplicateKeyUpdate({ set: { name: String(room.name ?? "غرفة قريب").slice(0, 80), retentionDays: Number(room.retentionDays ?? 0), updatedAt: new Date() } });
  let restoredMessages = 0;
  const asRecord = (raw: unknown) => raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  for (const raw of data.participants ?? []) {
    const participant = asRecord(raw);
    if (!participant || String(participant.roomId) !== input.roomId || !participant.id || !participant.deviceId) continue;
    await db.insert(chatParticipants).values({ id: String(participant.id), roomId: input.roomId, deviceId: String(participant.deviceId), name: String(participant.name ?? "زائر").slice(0, 40), color: String(participant.color ?? "#5B8DEF").slice(0, 7), lastSeen: backupDate(participant.lastSeen) }).onDuplicateKeyUpdate({ set: { name: String(participant.name ?? "زائر").slice(0, 40), color: String(participant.color ?? "#5B8DEF").slice(0, 7), lastSeen: backupDate(participant.lastSeen) } });
  }
  for (const raw of data.bans ?? []) {
    const ban = asRecord(raw);
    if (!ban || String(ban.roomId) !== input.roomId || !ban.id || !ban.deviceId || !ban.bannedBy) continue;
    await db.insert(roomMemberBans).values({ id: String(ban.id), roomId: input.roomId, deviceId: String(ban.deviceId), bannedBy: String(ban.bannedBy), createdAt: backupDate(ban.createdAt) }).onDuplicateKeyUpdate({ set: { bannedBy: String(ban.bannedBy) } });
  }
  for (const raw of data.moderators ?? []) {
    const moderator = asRecord(raw);
    if (!moderator || String(moderator.roomId) !== input.roomId || !moderator.id || !moderator.deviceId || !moderator.assignedBy) continue;
    await db.insert(roomModerators).values({ id: String(moderator.id), roomId: input.roomId, deviceId: String(moderator.deviceId), canPin: Boolean(moderator.canPin), canRename: Boolean(moderator.canRename), canManageMembers: Boolean(moderator.canManageMembers), canClearMessages: Boolean(moderator.canClearMessages), canViewActivity: moderator.canViewActivity !== false, assignedBy: String(moderator.assignedBy), createdAt: backupDate(moderator.createdAt), updatedAt: new Date() }).onDuplicateKeyUpdate({ set: { canPin: Boolean(moderator.canPin), canRename: Boolean(moderator.canRename), canManageMembers: Boolean(moderator.canManageMembers), canClearMessages: Boolean(moderator.canClearMessages), canViewActivity: moderator.canViewActivity !== false, updatedAt: new Date() } });
  }
  for (const raw of data.invitations ?? []) {
    const invitation = asRecord(raw);
    if (!invitation || String(invitation.roomId) !== input.roomId || !invitation.id || !invitation.targetDeviceId || !invitation.invitedBy) continue;
    await db.insert(roomModeratorInvitations).values({ id: String(invitation.id), roomId: input.roomId, targetDeviceId: String(invitation.targetDeviceId), targetName: String(invitation.targetName ?? "زائر").slice(0, 40), targetColor: String(invitation.targetColor ?? "#5B8DEF").slice(0, 7), invitedBy: String(invitation.invitedBy), invitedByName: String(invitation.invitedByName ?? "زائر").slice(0, 40), canPin: Boolean(invitation.canPin), canRename: Boolean(invitation.canRename), canManageMembers: Boolean(invitation.canManageMembers), canClearMessages: Boolean(invitation.canClearMessages), canViewActivity: invitation.canViewActivity !== false, status: String(invitation.status ?? "pending") as "pending" | "approved" | "declined" | "cancelled", createdAt: backupDate(invitation.createdAt), decidedAt: invitation.decidedAt ? backupDate(invitation.decidedAt) : null, decidedBy: invitation.decidedBy ? String(invitation.decidedBy) : null }).onDuplicateKeyUpdate({ set: { status: String(invitation.status ?? "pending") as "pending" | "approved" | "declined" | "cancelled", decidedAt: invitation.decidedAt ? backupDate(invitation.decidedAt) : null, decidedBy: invitation.decidedBy ? String(invitation.decidedBy) : null } });
  }
  for (const raw of data.messages ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as Record<string, unknown>;
    if (String(message.roomId) !== input.roomId || !message.id || !message.senderId) continue;
    await db.insert(chatMessages).values({ id: String(message.id), roomId: input.roomId, senderId: String(message.senderId), senderName: String(message.senderName ?? "زائر").slice(0, 40), senderColor: String(message.senderColor ?? "#5B8DEF").slice(0, 7), text: String(message.text ?? "").slice(0, 20_000), replyToId: message.replyToId ? String(message.replyToId) : null, reactions: message.reactions ? String(message.reactions) : null, editedAt: message.editedAt ? backupDate(message.editedAt) : null, deletedAt: message.deletedAt ? backupDate(message.deletedAt) : null, attachmentName: message.attachmentName ? String(message.attachmentName).slice(0, 120) : null, attachmentType: message.attachmentType ? String(message.attachmentType).slice(0, 100) : null, attachmentUrl: message.attachmentUrl ? String(message.attachmentUrl).slice(0, 512) : null, pinnedAt: message.pinnedAt ? backupDate(message.pinnedAt) : null, pinnedBy: message.pinnedBy ? String(message.pinnedBy).slice(0, 96) : null, createdAt: backupDate(message.createdAt) }).onDuplicateKeyUpdate({ set: { text: String(message.text ?? "").slice(0, 20_000), editedAt: message.editedAt ? backupDate(message.editedAt) : null, deletedAt: message.deletedAt ? backupDate(message.deletedAt) : null } });
    restoredMessages += 1;
  }
  for (const raw of data.activity ?? []) {
    const entry = asRecord(raw);
    if (!entry || String(entry.roomId) !== input.roomId || !entry.id || !entry.actorDeviceId || !entry.action) continue;
    await db.insert(roomAdminActivity).values({ id: String(entry.id), roomId: input.roomId, actorDeviceId: String(entry.actorDeviceId), actorName: String(entry.actorName ?? "زائر").slice(0, 40), action: String(entry.action) as "moderator_granted", targetDeviceId: entry.targetDeviceId ? String(entry.targetDeviceId) : null, targetName: entry.targetName ? String(entry.targetName).slice(0, 40) : null, details: entry.details ? String(entry.details).slice(0, 180) : null, createdAt: backupDate(entry.createdAt) }).onDuplicateKeyUpdate({ set: { details: entry.details ? String(entry.details).slice(0, 180) : null } });
  }
  for (const raw of data.notifications ?? []) {
    const notification = asRecord(raw);
    if (!notification || String(notification.roomId) !== input.roomId || !notification.id || !notification.targetDeviceId || !notification.activityId) continue;
    await db.insert(roomNotifications).values({ id: String(notification.id), roomId: input.roomId, targetDeviceId: String(notification.targetDeviceId), activityId: String(notification.activityId), kind: String(notification.kind ?? "admin"), title: String(notification.title ?? "إجراء إداري").slice(0, 120), body: String(notification.body ?? "").slice(0, 240), createdAt: backupDate(notification.createdAt), readAt: notification.readAt ? backupDate(notification.readAt) : null }).onDuplicateKeyUpdate({ set: { title: String(notification.title ?? "إجراء إداري").slice(0, 120), body: String(notification.body ?? "").slice(0, 240), readAt: notification.readAt ? backupDate(notification.readAt) : null } });
  }
  return { success: true, restoredMessages, restoredParticipants: (data.participants ?? []).length, restoredBans: (data.bans ?? []).length, restoredModerators: (data.moderators ?? []).length, restoredInvitations: (data.invitations ?? []).length, restoredActivity: (data.activity ?? []).length, restoredNotifications: (data.notifications ?? []).length };
}
